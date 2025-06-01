export {
  triggerSaveDiagram,
  triggerLoadDiagram,
  loadDataFromFile,
  exportToStaticHTML,
  clearLastFileHandle,
  verifyPermission,
};

import { del, set, get } from "../lib/idb-keyval.js";
import { state, editorContainer, filePicker, SVG_NS } from "./state.js";
import { createPostIt } from "./postit.js";
import { Rect, Arrow } from "./drawing.js";
import {
  renderLine,
  updateChildrenPositions,
  MAIN_LINE_DEFAULT_THICKNESS,
  CHILD_LINE_DEFAULT_THICKNESS,
  MIN_LINE_LENGTH,
} from "./lines.js";

import { DEFAULT_SCHEMA_TEXT_COLOR_VAR, getLinkPrefix } from "./text.js";
const EXPORT_START_MARKER = "<!-- PINTA_DIAGRAM_DATA_START ";
const EXPORT_END_MARKER = "PINTA_DIAGRAM_DATA_END -->";

async function verifyPermission(fileHandle) {
  // Check if the browser supports the File System Access API's permission model for this handle
  if (
    !fileHandle ||
    typeof fileHandle.queryPermission !== "function" ||
    typeof fileHandle.requestPermission !== "function"
  ) {
    // This handle likely doesn't support permission checks (e.g., from <input type="file">)
    // or is not a valid FileSystemFileHandle. Assume permission if we have the handle.
    return true;
  }
  const options = { mode: "readwrite" }; // Request read-write for general use
  try {
    // Check if permission was already granted
    if ((await fileHandle.queryPermission(options)) === "granted") {
      return true;
    }
    // Request permission
    if ((await fileHandle.requestPermission(options)) === "granted") {
      return true;
    }
  } catch (error) {
    console.error("Pinta: Error verifying file permission:", error);
    return false;
  }
  // The user didn't grant permission
  return false;
}

async function clearLastFileHandle() {
  try {
    await del("pintaLastFileHandle");
    console.log("Pinta: Last file handle cleared from IndexedDB.");
  } catch (error) {
    console.error(
      "Pinta: Error clearing last file handle from IndexedDB:",
      error,
    );
  }
}

function getCurrentDiagramDataForSave() {
  const mainLineId = Object.keys(state.linesStore).find(
    (id) => state.linesStore[id] && state.linesStore[id].parentId === null,
  );
  const mainLineRef =
    mainLineId && state.linesStore[mainLineId]
      ? {
          id: mainLineId,
          length: state.linesStore[mainLineId].length,
        }
      : null;

  const diagramData = {
    lines: state.linesStore,
    postIts: {},
    drawings: [],
    mainLineReference: mainLineRef,
  };

  for (const id in state.postItsStore) {
    const postItElement = document.getElementById(id);
    const postItData = { ...state.postItsStore[id] };

    if (postItElement) {
      const contentArea = postItElement.querySelector(".postit-content-area");
      if (contentArea) {
        postItData.content = contentArea.innerHTML;
      }
      const dragHandle = postItElement.querySelector(".postit-drag-handle");
      if (dragHandle) {
        postItData.title = dragHandle.textContent || "";
      }

      const currentX =
        (parseFloat(postItElement.style.left) || 0) +
        (parseFloat(postItElement.getAttribute("data-x")) || 0);
      const currentY =
        (parseFloat(postItElement.style.top) || 0) +
        (parseFloat(postItElement.getAttribute("data-y")) || 0);

      const postItCenterX = currentX + postItElement.offsetWidth / 2;
      const postItCenterY = currentY + postItElement.offsetHeight / 2;

      postItData.savedWidth = postItElement.offsetWidth;
      postItData.savedHeight = postItElement.offsetHeight;

      if (mainLineRef && state.linesStore[mainLineRef.id]) {
        const mainLine = state.linesStore[mainLineRef.id];
        const mainLineStartX = mainLine.startX;
        const mainLineStartY = mainLine.startY;
        const mainLineAngleRad = mainLine.angle * (Math.PI / 180);
        const mainLineLength = mainLine.length;

        if (Math.abs(mainLineLength) > 1e-6) {
          const vecX = postItCenterX - mainLineStartX;
          const vecY = postItCenterY - mainLineStartY;

          const mainLineDirX = Math.cos(mainLineAngleRad);
          const mainLineDirY = Math.sin(mainLineAngleRad);

          const distAlongMainLine = vecX * mainLineDirX + vecY * mainLineDirY;
          postItData.offsetRatioOnMainLine = distAlongMainLine / mainLineLength;

          const perpDirX = -mainLineDirY;
          const perpDirY = mainLineDirX;
          const perpDistFromMainLine = vecX * perpDirX + vecY * perpDirY;
          postItData.perpDistRatioFromMainLine =
            perpDistFromMainLine / mainLineLength;

          delete postItData.xPercent;
          delete postItData.yPercent;
        } else {
          const editorRect = editorContainer.getBoundingClientRect();
          if (editorRect.width > 0)
            postItData.xPercent = (currentX / editorRect.width) * 100;
          if (editorRect.height > 0)
            postItData.yPercent = (currentY / editorRect.height) * 100;
          console.warn(
            "Main line has zero length during save, PostIt saved with editor %",
          );
        }
      } else {
        const editorRect = editorContainer.getBoundingClientRect();
        if (editorRect.width > 0)
          postItData.xPercent = (currentX / editorRect.width) * 100;
        if (editorRect.height > 0)
          postItData.yPercent = (currentY / editorRect.height) * 100;
        console.warn(
          "No main line reference during save, PostIt saved with editor %",
        );
      }
    }
    diagramData.postIts[id] = postItData;
  }

  diagramData.drawings = Object.values(state.drawingElementsStore)
    .map((el) => el.toSaveData())
    .filter((d) => d !== null);

  return diagramData;
}

async function triggerSaveDiagram() {
  const dataToSave = getCurrentDiagramDataForSave();
  const diagramData = JSON.stringify(dataToSave, null, 2);
  const blob = new Blob([diagramData], { type: "application/json" });
  let fileHandle = null;

  try {
    const existingHandle = await get("pintaLastFileHandle");
    if (existingHandle && (await verifyPermission(existingHandle))) {
      fileHandle = existingHandle;
    } else {
      if (window.showSaveFilePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: "diagram.pnt",
          types: [
            {
              description: "Pinta JSON Diagram Files (.pnt)",
              accept: {
                "application/json": [".pnt"],
                "text/html": [".html", ".htm"],
              },
            },
          ],
        });
      }
    }

    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      await set("pintaLastFileHandle", fileHandle);
      info.innerHTML = "&#x1F4BE;";
      info.classList.add("fades");
      console.log("Pinta: Diagram saved successfully. Handle stored/updated.");
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "pinta.pnt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log(
        "Pinta: Diagram download initiated (fallback). No handle stored.",
      );
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Pinta: Error saving diagram:", err);
    } else {
      console.log("Pinta: Save diagram aborted by user.");
    }
  }
}

async function triggerLoadDiagram() {
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Pinta JSON Diagram Files (.pnt)",
            accept: {
              "application/json": [".pnt"],
              "text/html": [".html", ".htm"],
            },
          },
        ],
        multiple: false,
      });
      const file = await fileHandle.getFile();
      if (await verifyPermission(fileHandle)) {
        if (
          !file.name.toLowerCase().endsWith(".html") &&
          !file.name.toLowerCase().endsWith(".htm")
        ) {
          await set("pintaLastFileHandle", fileHandle);
          console.log("Pinta: .pnt diagram loaded and handle stored.");
        } else {
          console.log(
            "Pinta: Diagram loaded from HTML file. Handle NOT stored; will prompt for .pnt on next save.",
          );
          await clearLastFileHandle();
        }
        loadDataFromFile(file);
        console.log("Pinta: Diagram loaded and handle stored.");
      } else {
        console.error("Pinta: Permission denied for the selected file.");
        alert("Pinta: Permission was not granted to open the file.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Pinta: Error opening file via picker:", err);
      } else {
        console.log("Pinta: File open aborted by user.");
      }
    }
  } else {
    filePicker.click();
  }
}

function _processLoadedDiagramData(fileContentString) {
  let jsonToParse = fileContentString;
  const trimmedContent = fileContentString.trim();

  if (
    (trimmedContent.toLowerCase().startsWith("<html") ||
      trimmedContent.toLowerCase().startsWith("<!doctype html")) &&
    trimmedContent.includes(EXPORT_START_MARKER)
  ) {
    const startIndex = trimmedContent.indexOf(EXPORT_START_MARKER);
    const endIndex = trimmedContent.lastIndexOf(EXPORT_END_MARKER);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonToParse = trimmedContent
        .substring(startIndex + EXPORT_START_MARKER.length, endIndex)
        .trim();
      console.log("Pinta: Extracted diagram data from HTML comment.");
    } else {
      console.warn(
        "Pinta: HTML file loaded, but Pinta data comment not found or malformed.",
      );
      alert(
        "Error: This HTML file does not appear to contain valid Pinta diagram data.",
      );
      return;
    }
  }
  try {
    const savedData = JSON.parse(jsonToParse);
    if (
      typeof savedData === "object" &&
      savedData !== null &&
      savedData.lines
    ) {
      editorContainer.innerHTML = ""; // Clear existing content
      const newdrawingCanvas = document.createElementNS(SVG_NS, "svg");
      newdrawingCanvas.id = "drawingCanvas";
      newdrawingCanvas.setAttribute("width", "100%");
      newdrawingCanvas.setAttribute("height", "100%");
      newdrawingCanvas.innerHTML = `<defs>
                          <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
                              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/><feOffset dx="1" dy="1" result="offsetBlur"/><feMerge><feMergeNode in="offsetBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                          <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--red)" /></marker>
                          <marker id="arrowhead-orange" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--orange)" /></marker>
                          <marker id="arrowhead-yellow" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--yellow)" /></marker>
                          <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--green)" /></marker>
                          <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--blue)" /></marker>
                          <marker id="arrowhead-cyan" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--cyan)" /></marker>
                          <marker id="arrowhead-violet" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--violet)" /></marker>
                          <marker id="arrowhead-magenta" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--magenta)" /></marker>
                          <marker id="arrowhead-print" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="black" /></marker>
                      </defs>`;
      editorContainer.appendChild(newdrawingCanvas);
      state.drawingCanvas = newdrawingCanvas;

      state.linesStore = {};
      state.postItsStore = {};
      state.drawingElementsStore = {};
      state.lineIdCounter = 0;
      state.postItIdCounter = 0;
      state.drawingElementIdCounter = 0;

      const loadedLinesPart = savedData.lines;
      const mainLineRef = savedData.mainLineReference;
      const loadedPostItsPart = savedData.postIts || {};
      const loadedDrawingsPart = savedData.drawings || [];

      const containerRect = editorContainer.getBoundingClientRect();
      if (containerRect.width === 0 || containerRect.height === 0) {
        console.error("Editor container has zero dimensions during load.");
        return;
      }

      const safeMargin = Math.max(
        50,
        Math.min(containerRect.width, containerRect.height) * 0.1,
      );
      const p1x = safeMargin;
      const p1y = containerRect.height - safeMargin;
      const p2x = containerRect.width - safeMargin;
      const p2y = safeMargin;
      const currentDisplayMainLength = Math.sqrt(
        (p2x - p1x) ** 2 + (p2y - p1y) ** 2,
      );
      const currentDisplayMainAngle =
        (Math.atan2(p2y - p1y, p2x - p1x) * 180) / Math.PI;
      state.currentMainLineAngle = currentDisplayMainAngle;

      const scaleFactor =
        mainLineRef && mainLineRef.length !== 0 && currentDisplayMainLength > 0
          ? currentDisplayMainLength / mainLineRef.length
          : 1;

      let maxLineIdNum = -1;
      const tempLinesArray = Object.values(loadedLinesPart);
      tempLinesArray.sort((a, b) =>
        a.parentId === null ? -1 : b.parentId === null ? 1 : 0,
      );

      const mainLineLoadedData = mainLineRef
        ? loadedLinesPart[mainLineRef.id]
        : tempLinesArray.find((l) => l.parentId === null);

      if (!mainLineLoadedData) {
        console.error(
          "Pinta: Main line data not found in loaded file. Cannot proceed with relative positioning for Post-its.",
        );
        return;
      }
      const mainLineCurrentId = mainLineLoadedData.id;

      tempLinesArray.forEach((loadedLine) => {
        const numId = parseInt(loadedLine.id.split("-")[1]);
        if (!isNaN(numId) && numId > maxLineIdNum) maxLineIdNum = numId;

        let newLineData = { ...loadedLine };
        if (loadedLine.id === mainLineCurrentId) {
          newLineData.startX = p1x;
          newLineData.startY = p1y;
          newLineData.length = Math.max(
            currentDisplayMainLength,
            MIN_LINE_LENGTH,
          );
          newLineData.angle = currentDisplayMainAngle; // Crucial: use current display angle
          newLineData.thickness = MAIN_LINE_DEFAULT_THICKNESS;
        } else {
          let newScaledLength =
            (loadedLine.length || CHILD_LINE_DEFAULT_THICKNESS * 10) *
            scaleFactor;
          newLineData.length =
            Math.sign(newScaledLength) *
            Math.max(Math.abs(newScaledLength), MIN_LINE_LENGTH);
          newLineData.thickness = Math.max(
            1,
            (loadedLine.thickness || CHILD_LINE_DEFAULT_THICKNESS) *
              scaleFactor,
          );
          newLineData.textPerpOffset =
            (loadedLine.textPerpOffset || -15) * scaleFactor;
        }
        state.linesStore[newLineData.id] = newLineData;
      });
      state.lineIdCounter = maxLineIdNum + 1;

      if (state.linesStore[mainLineCurrentId]) {
        renderLine(state.linesStore[mainLineCurrentId]);
        updateChildrenPositions(mainLineCurrentId);
      } else {
        console.warn(
          "Pinta: Main line not found after processing lines. Rendering all as is.",
        );
        for (const id in state.linesStore) renderLine(state.linesStore[id]);
      }

      let maxPostItIdNum = -1;
      const currentMainLineForPostIts = state.linesStore[mainLineCurrentId];

      for (const id in loadedPostItsPart) {
        const originalNoteData = loadedPostItsPart[id];
        const numId = parseInt(id.split("-")[1]);
        if (!isNaN(numId) && numId > maxPostItIdNum) maxPostItIdNum = numId;

        state.postItsStore[id] = { ...originalNoteData };

        const noteDataForCreate = { ...originalNoteData };

        if (
          currentMainLineForPostIts &&
          noteDataForCreate.offsetRatioOnMainLine !== undefined &&
          noteDataForCreate.perpDistRatioFromMainLine !== undefined &&
          noteDataForCreate.savedWidth !== undefined &&
          noteDataForCreate.savedHeight !== undefined &&
          Math.abs(currentMainLineForPostIts.length) > 1e-6
        ) {
          const cmLineStartX = currentMainLineForPostIts.startX;
          const cmLineStartY = currentMainLineForPostIts.startY;
          const cmLineAngleRad =
            currentMainLineForPostIts.angle * (Math.PI / 180);
          const cmLineLength = currentMainLineForPostIts.length;

          const distAlongCurrentMain =
            noteDataForCreate.offsetRatioOnMainLine * cmLineLength;
          const perpDistFromCurrentMain =
            noteDataForCreate.perpDistRatioFromMainLine * cmLineLength;

          const pointOnMainLineX =
            cmLineStartX + distAlongCurrentMain * Math.cos(cmLineAngleRad);
          const pointOnMainLineY =
            cmLineStartY + distAlongCurrentMain * Math.sin(cmLineAngleRad);

          const perpDirX = -Math.sin(cmLineAngleRad);
          const perpDirY = Math.cos(cmLineAngleRad);

          const targetCenterX =
            pointOnMainLineX + perpDistFromCurrentMain * perpDirX;
          const targetCenterY =
            pointOnMainLineY + perpDistFromCurrentMain * perpDirY;

          noteDataForCreate.styleLeft = `${targetCenterX - noteDataForCreate.savedWidth / 2}px`;
          noteDataForCreate.styleTop = `${targetCenterY - noteDataForCreate.savedHeight / 2}px`;
        } else if (
          noteDataForCreate.xPercent !== undefined &&
          noteDataForCreate.yPercent !== undefined
        ) {
          if (containerRect.width > 0)
            noteDataForCreate.styleLeft = `${(noteDataForCreate.xPercent / 100) * containerRect.width}px`;
          else noteDataForCreate.styleLeft = "10px";
          if (containerRect.height > 0)
            noteDataForCreate.styleTop = `${(noteDataForCreate.yPercent / 100) * containerRect.height}px`;
          else noteDataForCreate.styleTop = "10px";
        } else {
          noteDataForCreate.styleLeft = "10px";
          noteDataForCreate.styleTop = "10px";
        }
        createPostIt(noteDataForCreate);
      }
      state.postItIdCounter = maxPostItIdNum + 1;

      let maxDrawingIdNum = -1;
      loadedDrawingsPart.forEach((shapeData) => {
        const numId = parseInt(shapeData.id.split("-")[1]);
        if (!isNaN(numId) && numId > maxDrawingIdNum) maxDrawingIdNum = numId;

        const currentEditorRect = editorContainer.getBoundingClientRect();
        let shape;
        if (shapeData.kind === "rect" || shapeData.kind === "highlight") {
          const x = (shapeData.xPercent / 100) * currentEditorRect.width;
          const y = (shapeData.yPercent / 100) * currentEditorRect.height;
          const w = (shapeData.widthPercent / 100) * currentEditorRect.width;
          const h = (shapeData.heightPercent / 100) * currentEditorRect.height;
          shape = new Rect(
            x,
            y,
            shapeData.colorName,
            state.drawingCanvas,
            shapeData.type,
          );
          shape.width = w;
          shape.height = h;
          if (shape.element) {
            shape.element.setAttribute("x", x);
            shape.element.setAttribute("y", y);
            shape.element.setAttribute("width", w);
            shape.element.setAttribute("height", h);
          }
          if (typeof shape._applyRotation === "function") {
            shape._applyRotation();
          }
        } else if (shapeData.kind === "arrow") {
          const x1 = (shapeData.x1Percent / 100) * currentEditorRect.width;
          const y1 = (shapeData.y1Percent / 100) * currentEditorRect.height;
          const x2 = (shapeData.x2Percent / 100) * currentEditorRect.width;
          const y2 = (shapeData.y2Percent / 100) * currentEditorRect.height;
          shape = new Arrow(x1, y1, shapeData.colorName, state.drawingCanvas);
          shape.x2 = x2;
          shape.y2 = y2;
          if (shape.element) {
            shape.element.setAttribute("x2", x2);
            shape.element.setAttribute("y2", y2);
          }
        }
        if (shape) {
          shape.id = shapeData.id;
          if (shape.element) shape.element.setAttribute("id", shape.id);
          state.drawingElementsStore[shape.id] = shape;
        }
      });
      state.drawingElementIdCounter = maxDrawingIdNum + 1;

      console.log("Pinta: Diagram data processed and rendered successfully.");
    } else {
      console.error("Pinta: Invalid diagram data structure in parsed JSON.");
      alert("Error: Could not load diagram. Invalid file format or structure.");
    }
  } catch (err) {
    console.error("Pinta: Error parsing diagram JSON data:", err);
    alert(
      "Error: Could not load diagram. File may be corrupted or not valid JSON.",
    );
  }
}

function loadDataFromFile(fileOrJsonString) {
  if (typeof fileOrJsonString === "string") {
    console.log("Pinta: Loading diagram from JSON string.");
    _processLoadedDiagramData(fileOrJsonString);
  } else if (fileOrJsonString instanceof File) {
    console.log(
      `Pinta: Loading diagram from File object: ${fileOrJsonString.name}`,
    );
    const reader = new FileReader();
    reader.onload = (event) => {
      _processLoadedDiagramData(event.target.result);
    };
    reader.onerror = () => {
      console.error("Pinta: Error reading file with FileReader.");
      alert("Error: Could not read the selected file.");
    };
    reader.readAsText(fileOrJsonString);
  } else {
    console.error(
      "Pinta: loadDataFromFile received invalid input type.",
      fileOrJsonString,
    );
    alert("Error: Invalid data provided for loading.");
  }
}

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function exportToStaticHTML(loadedCSSText) {
  const currentThemeClass = document.body.classList.contains("light-theme")
    ? "light-theme"
    : "";
  let diagramContentHTML = "";

  const liveEditorRectForRelativePositioning =
    editorContainer.getBoundingClientRect();
  const editorWrapperStyle = `
    position: relative;
    width: ${liveEditorRectForRelativePositioning.width}px;
    height: ${liveEditorRectForRelativePositioning.height}px;
    background-color: var(--theme-editor-background);
    border: 1px solid var(--theme-border-color);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    border-radius: 0.5rem;
    margin: 20px auto; /* Center it on the page */
  `;

  const pintaSaveData = getCurrentDiagramDataForSave();
  const pintaJsonString = JSON.stringify(pintaSaveData);

  const jsonComment = `\n${EXPORT_START_MARKER}\n${pintaJsonString}\n${EXPORT_END_MARKER}\n`;

  const linesHtml = Object.values(state.linesStore)
    .map((line) => {
      const lineElementGroup = document.getElementById(line.id);
      if (!lineElementGroup) return "";

      const groupClassAttr = lineElementGroup.className
        ? `class="${lineElementGroup.className}"`
        : "";
      const groupStyle = lineElementGroup.style.cssText || "";

      let visualHtml = "";
      let whiteSpaceStyle = "";
      const visualElement = lineElementGroup.querySelector(".line-visual");
      if (visualElement) {
        const visualClassAttr = visualElement.className
          ? `class="${visualElement.className}"`
          : "";
        const visualStyle = visualElement.style.cssText || "";
        visualHtml = `<div ${visualClassAttr} style="${visualStyle}"></div>`;
      }

      let textHtml = "";
      const textElement = lineElementGroup.querySelector(".line-text");
      if (textElement && textElement.style) {
        if (textElement.style.whiteSpace) {
          whiteSpaceStyle = `white-space: ${textElement.style.whiteSpace};`;
        } else {
          whiteSpaceStyle = "white-space: pre-wrap;";
          textHtml = escapeHtml(rawLineText);
        }
        const textClassAttr = textElement.className
          ? `class="${textElement.className}"`
          : "";
        const hasExplicitNewlinesFallback =
          line.text && line.text.includes("\n");
        whiteSpaceStyle = hasExplicitNewlinesFallback
          ? "white-space: pre-wrap;"
          : "white-space: normal;";
        const textStyle = textElement.style.cssText + whiteSpaceStyle || "";

        let textContentHtml;
        const rawLineText = line.text || "...";
        if (line.linkUrl) {
          const prefix = getLinkPrefix(line.linkUrl);
          textContentHtml = `<a href="${escapeHtml(
            line.linkUrl,
          )}" target="_blank" style="text-decoration:none; color:inherit;">${escapeHtml(
            prefix,
          )}${escapeHtml(rawLineText)}</a>`;
        } else {
          textContentHtml = escapeHtml(rawLineText);
        }

        if (line.hasCheckbox) {
          const currentLineTextColorValue =
            line.textColor && line.textColor !== "default"
              ? `var(--${line.textColor})`
              : DEFAULT_SCHEMA_TEXT_COLOR_VAR;
          const checkedAttr = line.isCheckboxChecked ? " checked" : "";
          let checkboxInlineStyle = `border-color: ${currentLineTextColorValue};`;
          if (line.isCheckboxChecked) {
            checkboxInlineStyle += ` background-color: ${currentLineTextColorValue};`;
          } else {
            checkboxInlineStyle += ` background-color: var(--theme-main-background);`;
          }
          textContentHtml = `<input type="checkbox" class="line-label-checkbox" style="${checkboxInlineStyle}"${checkedAttr} disabled>${textContentHtml}`;
        }
        textHtml = `<div ${textClassAttr} style="${textStyle}">${textContentHtml}</div>`;
      }
      return `<div ${groupClassAttr} style="${groupStyle}">${visualHtml}${textHtml}</div>`;
    })
    .join("");
  diagramContentHTML += linesHtml;

  const postItsHtml = Object.values(state.postItsStore)
    .map((postIt) => {
      const postItElement = document.getElementById(postIt.id);
      if (!postItElement) return "";

      const elemRect = postItElement.getBoundingClientRect();
      const exportLeft =
        elemRect.left - liveEditorRectForRelativePositioning.left;
      const exportTop = elemRect.top - liveEditorRectForRelativePositioning.top;

      let postItGeneratedStyle = `position:absolute; left:${exportLeft}px; top:${exportTop}px; width:${elemRect.width}px; height:${elemRect.height}px;`;

      if (postItElement.style.transform) {
        postItGeneratedStyle += ` transform: ${postItElement.style.transform};`;
      }

      const classAttr = postItElement.className
        ? `class="${postItElement.className}"`
        : "";

      let titleHtml = "";
      const titleHandle = postItElement.querySelector(".postit-drag-handle");
      if (titleHandle) {
        const titleClass = titleHandle.className
          ? `class="${titleHandle.className}"`
          : "";
        const titleStyle = titleHandle.style.cssText
          ? `style="${titleHandle.style.cssText}"`
          : "";
        titleHtml = `<div ${titleClass} ${titleStyle}>${escapeHtml(
          postIt.title || "",
        )}</div>`;
      }

      let contentAreaHtml = "";
      const contentArea = postItElement.querySelector(".postit-content-area");
      if (contentArea) {
        const contentClass = contentArea.className
          ? `class="${contentArea.className}"`
          : "";
        // For some reason we need to add the white-space: normal to handle new lines in post its
        const contentStyle = contentArea.style.cssText
          ? `style="${contentArea.style.cssText} white-space: normal;"`
          : "";
        contentAreaHtml = `<div ${contentClass} ${contentStyle}>${postIt.content}</div>`; // postIt.content is already HTML
      }

      return `<div ${classAttr} style="${postItGeneratedStyle}">${titleHtml}${contentAreaHtml}</div>`;
    })
    .join("");
  diagramContentHTML += postItsHtml;

  if (state.drawingCanvas) {
    const svgClone = state.drawingCanvas.cloneNode(true);
    svgClone.setAttribute(
      "style",
      "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;",
    );
    diagramContentHTML += svgClone.outerHTML;
  }

  const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinta Diagram Export</title>
  <style>
    /* Embedded CSS from style.css */
    ${loadedCSSText}
    /* Additional styles for static export if needed */
    body {
        margin: 0;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--theme-main-background);
        color: var(--theme-primary-text);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
    }
    .postit-content-area a { color: var(--blue); text-decoration: underline; }
    .postit-content-area a:hover { color: var(--cyan); }
  </style>
</head>
<body class="${currentThemeClass}">
  <div id="editor-container-export" style="${editorWrapperStyle}">
    ${diagramContentHTML}
  </div>
  ${jsonComment}
</body>
</html>`;

  const blob = new Blob([finalHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "pinta-diagram.html";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  console.log("Diagram exported to HTML.");
}
