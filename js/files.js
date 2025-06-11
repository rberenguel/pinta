export {
  triggerSaveDiagram,
  triggerLoadDiagram,
  loadDataFromFile,
  exportToStaticHTML,
  clearLastFileHandle,
  verifyPermission,
  pintaJsonToMarkdown,
  pintaMarkdownToJson,
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
  getLineDepth,
  SCHEMA_LINE_VISUAL_COLORS,
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

async function triggerSaveDiagram(asMarkdown = false) {
  const dataToSave = getCurrentDiagramDataForSave();
  let fileContent;
  let fileExtension = asMarkdown ? ".md" : ".pnt";
  let suggestedName = `diagram${fileExtension}`;
  let mimeType = asMarkdown ? "text/markdown" : "application/json";

  if (asMarkdown) {
    fileContent = pintaJsonToMarkdown(dataToSave);
  } else {
    fileContent = JSON.stringify(dataToSave, null, 2);
  }

  const blob = new Blob([fileContent], { type: mimeType });
  let fileHandle = null;

  try {
    const existingHandle = await get("pintaLastFileHandle");
    if (
      existingHandle &&
      existingHandle.name.endsWith(fileExtension) &&
      (await verifyPermission(existingHandle))
    ) {
      fileHandle = existingHandle;
    } else {
      if (existingHandle) await clearLastFileHandle(); // Clear if extension mismatch or no permission
      if (window.showSaveFilePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: `Pinta ${
                asMarkdown ? "Markdown" : "JSON"
              } Diagram Files (${fileExtension})`,
              accept: { [mimeType]: [fileExtension] },
            },
            // Optionally offer the other type as well
            {
              description: `Pinta ${
                asMarkdown ? "JSON" : "Markdown"
              } Diagram Files (${asMarkdown ? ".pnt" : ".md"})`,
              accept: {
                [asMarkdown ? "application/json" : "text/markdown"]: [
                  asMarkdown ? ".pnt" : ".md",
                ],
              },
            },
          ],
        });
        // Update extension and mimetype if user changed it in the picker
        if (fileHandle.name.endsWith(".md")) {
          fileExtension = ".md";
          mimeType = "text/markdown";
          if (!asMarkdown) {
            // User switched to MD in picker
            fileContent = pintaJsonToMarkdown(dataToSave);
          }
        } else if (fileHandle.name.endsWith(".pnt")) {
          fileExtension = ".pnt";
          mimeType = "application/json";
          if (asMarkdown) {
            // User switched to PNT in picker
            fileContent = JSON.stringify(dataToSave, null, 2);
          }
        }
      }
    }

    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      // Re-create blob if content type changed due to picker interaction
      const finalBlob = new Blob([fileContent], { type: mimeType });
      await writable.write(finalBlob);
      await writable.close();
      if (fileExtension === ".pnt") {
        // Only store handle for .pnt files
        await set("pintaLastFileHandle", fileHandle);
      } else {
        await clearLastFileHandle(); // Clear handle if saved as .md
      }
      info.innerHTML = "&#x1F4BE;";
      info.classList.add("fades");
      console.log(`Pinta: Diagram saved as ${fileExtension}.`);
    } else {
      // Fallback for browsers without showSaveFilePicker
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = suggestedName; // Will be diagram.pnt or diagram.md
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log(
        `Pinta: Diagram download as ${suggestedName} initiated (fallback).`,
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
              "text/markdown": [".md"],
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
          !file.name.toLowerCase().endsWith(".htm") &&
          !file.name.toLowerCase().endsWith(".md")
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

function adjustChildrenLayoutForEvenSplit(parentId, linesStore) {
  const parentLine = linesStore[parentId];
  if (parentLine && parentLine.children && parentLine.children.length > 0) {
    const childrenToAutoPosition = parentLine.children.filter((id) => {
      const child = linesStore[id];
      return child && child.autoPositionHint === true;
    });

    const numAutoPositionChildren = childrenToAutoPosition.length;

    // Only apply even split if ALL children of this parent were implicitly positioned
    if (
      numAutoPositionChildren > 0 &&
      numAutoPositionChildren === parentLine.children.length
    ) {
      childrenToAutoPosition.forEach((childId, index) => {
        if (linesStore[childId]) {
          linesStore[childId].offsetRatioOnParent =
            (index + 1) / (numAutoPositionChildren + 1);
          // Optional: Alternate relativeDirection if not explicitly set
          // if (linesStore[childId].relativeDirection === undefined) { // Or check another hint
          //    linesStore[childId].relativeDirection = (index % 2 === 0) ? 1 : -1;
          // }
          delete linesStore[childId].autoPositionHint; // Clean up hint
        }
      });
    } else {
      // If only some children were auto-positioned, they keep their parser default (e.g., 0.5)
      // or you could implement a more complex logic to insert them among fixed-position siblings.
      // For now, just remove hints.
      parentLine.children.forEach((childId) => {
        if (linesStore[childId] && linesStore[childId].autoPositionHint) {
          delete linesStore[childId].autoPositionHint;
        }
      });
    }
  }
}

function _processLoadedDiagramData(fileContentString, isMarkdown = false) {
  let jsonData;
  if (isMarkdown) {
    try {
      jsonData = pintaMarkdownToJson(fileContentString);
      console.log("Pinta: Parsed diagram data from Markdown.");
      console.debug(JSON.parse(JSON.stringify(jsonData)));
    } catch (err) {
      console.error("Pinta: Error parsing Markdown diagram data:", err);
      alert(
        "Error: Could not parse Markdown diagram. File may be corrupted or invalid.",
      );
      return;
    }
  } else {
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
      jsonData = JSON.parse(jsonToParse);
    } catch (err) {
      console.error("Pinta: Error parsing diagram JSON data:", err);
      alert(
        "Error: Could not load diagram. File may be corrupted or not valid JSON.",
      );
    }
  }
  if (typeof jsonData === "object" && jsonData !== null && jsonData.lines) {
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

    const loadedLinesPart = jsonData.lines;
    const mainLineRef = jsonData.mainLineReference;
    const loadedPostItsPart = jsonData.postIts || {};
    const loadedDrawingsPart = jsonData.drawings || [];

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
        "Pinta: Main line data not found in loaded file. Cannot proceed with relative positioning.",
      );
      return;
    }
    const mainLineCurrentId = mainLineLoadedData.id;

    tempLinesArray.forEach((loadedLine) => {
      const numId = parseInt(loadedLine.id.split("-")[1]);
      if (!isNaN(numId) && numId > maxLineIdNum) maxLineIdNum = numId;

      let newLineData = { ...loadedLine };
      delete newLineData["hasCheckbox"]; // Avoid rewriting legacy fields
      delete newLineData["isCheckboxChecked"]; // Avoid rewriting legacy fields
      delete newLineData["visualColor"]; // Avoid rewriting legacy fields

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
        if (typeof loadedLine.length === "number") {
          let newScaledLength =
            (loadedLine.length || CHILD_LINE_DEFAULT_THICKNESS * 10) *
            scaleFactor;
          newLineData.length =
            Math.sign(newScaledLength) *
            Math.max(Math.abs(newScaledLength), MIN_LINE_LENGTH);
        } else {
          // Length was NOT specified (e.g., bare-bones MD from user)
          // Calculate default length based on parent and depth
          const parentLine = state.linesStore[loadedLine.parentId]; // Parent MUST be in state.linesStore at this point due to processing order assumption

          if (parentLine && typeof parentLine.length === "number") {
            const depth =
              0.1 + getLineDepth(loadedLine.parentId, state.linesStore); // Line is not in store yet
            const lengthMultiplier = 0.8 * (1.0 - 0.75 / depth);

            let calculatedMagnitude =
              Math.abs(parentLine.length) * lengthMultiplier;
            calculatedMagnitude = Math.max(
              calculatedMagnitude,
              MIN_LINE_LENGTH,
            );

            // Determine sign for the length.
            // Use relativeDirection (defaulted by MD parser to alternate) to influence length sign.
            // If relativeDirection is -1 (typically "left" turn from parent), length is negative.
            // If relativeDirection is 1 (typically "right" turn from parent), length is positive.
            // This makes the initial visual extension direction consistent with the turn.
            const sign = loadedLine.relativeDirection === -1 ? -1 : 1;
            newLineData.length = sign * calculatedMagnitude;
            // Note: parentLine.length here is already scaled to the current viewport for the main line,
            // or derived from that for other parents. So, no additional scaleFactor is needed for this default.
          } else {
            // Fallback if parent somehow has no length or not found (shouldn't happen in valid tree)
            console.warn(
              `Parent line or parent line length not found for ${loadedLine.id}. Defaulting length.`,
            );
            newLineData.length = MIN_LINE_LENGTH * scaleFactor; // Basic default scaled from original diagram proportions
          }
        }

        newLineData.thickness = Math.max(
          1,
          (loadedLine.thickness || CHILD_LINE_DEFAULT_THICKNESS) * scaleFactor,
        );
        newLineData.textPerpOffset =
          (loadedLine.textPerpOffset || -15) * scaleFactor;
      }
      state.linesStore[newLineData.id] = newLineData;
    });
    state.lineIdCounter = maxLineIdNum + 1;

    if (mainLineCurrentId && state.linesStore[mainLineCurrentId]) {
      // Create a processing queue for adjusting children, starting with the main line
      const processingQueue = [mainLineCurrentId];
      const processedParents = new Set();

      while (processingQueue.length > 0) {
        const currentParentId = processingQueue.shift();
        if (processedParents.has(currentParentId)) continue;

        adjustChildrenLayoutForEvenSplit(currentParentId, state.linesStore);
        processedParents.add(currentParentId);

        const parentLine = state.linesStore[currentParentId];
        if (parentLine && parentLine.children) {
          parentLine.children.forEach((childId) => {
            if (state.linesStore[childId] && !processedParents.has(childId)) {
              processingQueue.push(childId);
            }
          });
        }
      }
    }

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
    const currentMainLine = state.linesStore[mainLineCurrentId]; // Used for both PostIts and Drawings

    for (const id in loadedPostItsPart) {
      const originalNoteData = loadedPostItsPart[id];
      const numId = parseInt(id.split("-")[1]);
      if (!isNaN(numId) && numId > maxPostItIdNum) maxPostItIdNum = numId;

      state.postItsStore[id] = { ...originalNoteData };

      const noteDataForCreate = { ...originalNoteData };

      if (
        currentMainLine &&
        noteDataForCreate.offsetRatioOnMainLine !== undefined &&
        noteDataForCreate.perpDistRatioFromMainLine !== undefined &&
        noteDataForCreate.savedWidth !== undefined &&
        noteDataForCreate.savedHeight !== undefined &&
        Math.abs(currentMainLine.length) > 1e-6
      ) {
        const cmLineStartX = currentMainLine.startX;
        const cmLineStartY = currentMainLine.startY;
        const cmLineAngleRad = currentMainLine.angle * (Math.PI / 180);
        const cmLineLength = currentMainLine.length;

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

        noteDataForCreate.styleLeft = `${
          targetCenterX - noteDataForCreate.savedWidth / 2
        }px`;
        noteDataForCreate.styleTop = `${
          targetCenterY - noteDataForCreate.savedHeight / 2
        }px`;
      } else if (
        noteDataForCreate.xPercent !== undefined &&
        noteDataForCreate.yPercent !== undefined
      ) {
        if (containerRect.width > 0)
          noteDataForCreate.styleLeft = `${
            (noteDataForCreate.xPercent / 100) * containerRect.width
          }px`;
        else noteDataForCreate.styleLeft = "10px";
        if (containerRect.height > 0)
          noteDataForCreate.styleTop = `${
            (noteDataForCreate.yPercent / 100) * containerRect.height
          }px`;
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
        let x, y, w, h;
        if (
          currentMainLine &&
          shapeData.xOffsetRatio !== undefined &&
          shapeData.yPerpDistRatio !== undefined &&
          shapeData.widthRatio !== undefined &&
          shapeData.heightRatio !== undefined &&
          Math.abs(currentMainLine.length) > 1e-6
        ) {
          const cmLineStartX = currentMainLine.startX;
          const cmLineStartY = currentMainLine.startY;
          const cmLineAngleRad = currentMainLine.angle * (Math.PI / 180);
          const cmLineLength = currentMainLine.length;

          const distAlongMain = shapeData.xOffsetRatio * cmLineLength;
          const perpDist = shapeData.yPerpDistRatio * cmLineLength;
          const cosA = Math.cos(cmLineAngleRad);
          const sinA = Math.sin(cmLineAngleRad);
          const perpDirX = -sinA;
          const perpDirY = cosA;

          x = cmLineStartX + distAlongMain * cosA + perpDist * perpDirX;
          y = cmLineStartY + distAlongMain * sinA + perpDist * perpDirY;
          w = shapeData.widthRatio * Math.abs(cmLineLength); // Use abs length for dimensions
          h = shapeData.heightRatio * Math.abs(cmLineLength);
        } else if (shapeData.xPercent !== undefined) {
          x = (shapeData.xPercent / 100) * currentEditorRect.width;
          y = (shapeData.yPercent / 100) * currentEditorRect.height;
          w = (shapeData.widthPercent / 100) * currentEditorRect.width;
          h = (shapeData.heightPercent / 100) * currentEditorRect.height;
        } else {
          console.warn(
            `Rect/Highlight ${shapeData.id} could not be positioned. Defaulting.`,
          );
          x = 10;
          y = 10;
          w = 50;
          h = 50;
        }
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
        let x1, y1, x2, y2;
        if (
          currentMainLine &&
          shapeData.x1OffsetRatio !== undefined &&
          shapeData.y1PerpDistRatio !== undefined &&
          shapeData.x2OffsetRatio !== undefined &&
          shapeData.y2PerpDistRatio !== undefined &&
          Math.abs(currentMainLine.length) > 1e-6
        ) {
          const cmLineStartX = currentMainLine.startX;
          const cmLineStartY = currentMainLine.startY;
          const cmLineAngleRad = currentMainLine.angle * (Math.PI / 180);
          const cmLineLength = currentMainLine.length;
          const cosA = Math.cos(cmLineAngleRad);
          const sinA = Math.sin(cmLineAngleRad);
          const perpDirX = -sinA;
          const perpDirY = cosA;

          // Calculate P1
          const distAlongMain1 = shapeData.x1OffsetRatio * cmLineLength;
          const perpDist1 = shapeData.y1PerpDistRatio * cmLineLength;
          const pointOnMainLine1X = cmLineStartX + distAlongMain1 * cosA;
          const pointOnMainLine1Y = cmLineStartY + distAlongMain1 * sinA;
          x1 = pointOnMainLine1X + perpDist1 * perpDirX;
          y1 = pointOnMainLine1Y + perpDist1 * perpDirY;

          // Calculate P2
          const distAlongMain2 = shapeData.x2OffsetRatio * cmLineLength;
          const perpDist2 = shapeData.y2PerpDistRatio * cmLineLength;
          const pointOnMainLine2X = cmLineStartX + distAlongMain2 * cosA;
          const pointOnMainLine2Y = cmLineStartY + distAlongMain2 * sinA;
          x2 = pointOnMainLine2X + perpDist2 * perpDirX;
          y2 = pointOnMainLine2Y + perpDist2 * perpDirY;
        } else if (shapeData.x1Percent !== undefined) {
          // Fallback to old percentage based
          x1 = (shapeData.x1Percent / 100) * currentEditorRect.width;
          y1 = (shapeData.y1Percent / 100) * currentEditorRect.height;
          x2 = (shapeData.x2Percent / 100) * currentEditorRect.width;
          y2 = (shapeData.y2Percent / 100) * currentEditorRect.height;
        } else {
          console.warn(
            `Arrow ${shapeData.id} could not be positioned. Defaulting.`,
          );
          x1 = 0;
          y1 = 0;
          x2 = 10;
          y2 = 10; // Minimal default
        }

        shape = new Arrow(x1, y1, shapeData.colorName, state.drawingCanvas);
        shape.x2 = x2;
        shape.y2 = y2;
        if (shape.element) {
          shape.element.setAttribute("x1", x1);
          shape.element.setAttribute("y1", y1);
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
}

function loadDataFromFile(fileOrJsonString) {
  let isMarkdown = false;
  if (typeof fileOrJsonString === "string") {
    console.log("Pinta: Loading diagram from string data.");
    // Simple content sniffing for markdown can be added here if needed,
    // but relying on explicit type or filename is safer.
    // For now, assume string is JSON unless explicitly told otherwise.
  } else if (fileOrJsonString instanceof File) {
    console.log(
      `Pinta: Loading diagram from File object: ${fileOrJsonString.name}`,
    );
    isMarkdown = fileOrJsonString.name.toLowerCase().endsWith(".md");
    const reader = new FileReader();
    reader.onload = (event) => {
      _processLoadedDiagramData(event.target.result, isMarkdown);
    };
    reader.onerror = () => {
      console.error("Pinta: Error reading file with FileReader.");
      alert("Error: Could not read the selected file.");
    };
    reader.readAsText(fileOrJsonString);
    return; // Handled by reader.onload
  } else {
    console.error(
      "Pinta: loadDataFromFile received invalid input type.",
      fileOrJsonString,
    );
    alert("Error: Invalid data provided for loading.");
    return;
  }
  // If it's a string and not handled by FileReader, process directly
  // (isMarkdown would be false by default if it's just a string without context)
  _processLoadedDiagramData(fileOrJsonString, isMarkdown);
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

function iconoirSubsetter(iconoirCSS, usedClasses) {
  console.log(usedClasses);
  const lines = iconoirCSS.split("\n");
  let output = [];
  let header = true;
  let klass = false;
  for (let line of lines) {
    if (!header) {
    } else {
      if (line.startsWith(".iconoir-")) {
        header = false;
      } else {
        output.push(line);
      }
    }
    if (header) {
      continue;
    } else {
      if (line.startsWith(".")) {
        const currentClass = line.slice(1).split("::")[0];
        if (usedClasses.has(currentClass)) {
          klass = true;
        }
      }
      if (klass) {
        output.push(line);
      }
      if (line.startsWith("}")) {
        klass = false;
      }
    }
  }
  return output.join("\n");
}

async function exportToStaticHTML(loadedCSSText, loadedCSSIconoir) {
  const currentThemeClass = document.body.classList.contains("light-theme")
    ? "light-theme"
    : "";
  const toggleHTML = `
    <input type="checkbox" id="theme-toggle-export" class="theme-toggle-checkbox">
    <label for="theme-toggle-export" class="theme-toggle-label">
      <i class="sun-light iconoir-sun-light"></i>
      <i class="half-moon iconoir-half-moon"></i>
    </label>
  `;
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
    margin: 15px;
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
        let rawLineText = line.text || "...";
        let prefixSymbol = undefined;
        let prefix = "";
        if (rawLineText.startsWith(":")) {
          const maybeIcon = rawLineText.slice(1).split(":");
          if (maybeIcon.length > 1) {
            const icon = maybeIcon[0];
            if (icon) {
              prefixSymbol = `<div class="iconoir-${icon}"></div>`;
              if (!line.linkUrl) {
                prefix = `<span class="link-icon-nonclickable">${prefixSymbol}</span>`;
              }
              rawLineText = rawLineText
                .slice(1)
                .split(":")
                .slice(1)
                .join(":")
                .trim();
            }
          }
        }
        let appending = [];
        if (rawLineText.startsWith("[")) {
          const maybeDate = rawLineText.slice(1).split("]");
          if (maybeDate.length > 1) {
            const content = maybeDate[0];
            const yearMonthPattern = /^(19\d{2}|20\d{2}|2100)(0[1-9]|1[0-2])?$/;
            const match = content.match(yearMonthPattern);

            if (match) {
              console.info("Found year and optional month");
              const yearPart = match[1];
              const monthPart = match[2];

              const yearSpan = `<span class="year">${yearPart}</span>`;
              appending.push(yearSpan);

              if (monthPart) {
                console.info("Found month");
                const monthSpan = `<span class="month">${monthPart}</span>`;
                appending.push(monthSpan);
              }

              rawLineText = rawLineText
                .slice(1)
                .split("]")
                .slice(1)
                .join("]")
                .trim();
            }
          }
        }
        rawLineText = prefix + rawLineText;
        let title = null;
        if (
          line.textRenderLength &&
          rawLineText.length > line.textRenderLength
        ) {
          title = rawLineText;
          rawLineText = rawLineText.substring(0, line.textRenderLength) + "…";
        }
        let lineText = `<div class="line-text-wrapper" title="${title}">${rawLineText}${appending.join(
          " ",
        )}</div>`;

        if (line.linkUrl) {
          prefixSymbol = prefixSymbol || getLinkPrefix(line.linkUrl);
          const prefix = `<span class="link-icon-clickable">${prefixSymbol}</span>`;
          textContentHtml = `<a href="${escapeHtml(
            line.linkUrl,
          )}" target="_blank" style="text-decoration:none; color:inherit;">${prefix}</a>${lineText}`;
        } else {
          textContentHtml = lineText;
        }

        if (
          line.checkboxState === "checked" ||
          line.checkboxState === "unchecked"
        ) {
          const isCheckboxChecked = line.checkboxState === "checked";
          const currentLineTextColorValue =
            line.textColor && line.textColor !== "default"
              ? `var(--${line.textColor})`
              : DEFAULT_SCHEMA_TEXT_COLOR_VAR;
          const checkedAttr = isCheckboxChecked ? " checked" : "";
          let checkboxInlineStyle = `border-color: ${currentLineTextColorValue};`;
          if (isCheckboxChecked) {
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

      let postItGeneratedStyle = `position:absolute; left:${exportLeft}px; top:${exportTop}px; width:${elemRect.width}px;`;

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
  const usedIconoirClasses = new Set(
    Array.from(document.querySelectorAll('[class*="iconoir-"]'))
      .map((e) => e.classList[0])
      .concat(["iconoir-half-moon", "iconoir-sun-light"]),
  );
  const subsetIconoirCSS = iconoirSubsetter(
    loadedCSSIconoir,
    usedIconoirClasses,
  );
  console.info(subsetIconoirCSS);
  const fullCSS = loadedCSSText + "\n" + subsetIconoirCSS;

  const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinta Diagram Export</title>
  <style>
    /* Embedded CSS from style.css */
    ${fullCSS}
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
${toggleHTML}
  <div class="pinta-static-container">
  <div id="editor-container-export" style="${editorWrapperStyle}">
    ${diagramContentHTML}
  </div>
  </div>
  ${jsonComment}
</body>
</html>`;

  const blob = new Blob([finalHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);

  let title =
    Object.values(state.linesStore).filter((l) => !l.parentId)[0].text || "...";
  if (title.startsWith(":")) {
    const maybeIcon = title.slice(1).split(":");
    if (maybeIcon.length > 1) {
      const icon = maybeIcon[0];
      if (icon) {
        title = title.slice(1).split(":").slice(1).join(":").trim();
      }
    }
  }
  const suggestedName = `${title}.html`;

  try {
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: "HTML Document",
            accept: { "text/html": [".html", ".htm"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log("Pinta: Diagram exported to HTML.");
    } else {
      // Fallback for browsers that don't support showSaveFilePicker
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log("Pinta: Diagram download initiated (fallback).");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Pinta: Error exporting to HTML:", err);
    } else {
      console.log("Pinta: HTML export aborted by user.");
    }
  }
}

// Add this to js/files.js

/**
 * Converts Pinta JSON diagram data to a Markdown-like string.
 * @param {object} jsonData The Pinta diagram data.
 * @returns {string} A string in a Markdown/YAML-hybrid format.
 */
function pintaJsonToMarkdown(jsonData) {
  let mdString = "";

  // Helper to format properties
  const formatProps = (obj, excludeKeys = []) => {
    let propsMd = "";
    for (const key in obj) {
      if (excludeKeys.includes(key) || typeof obj[key] === "function") continue;
      if (
        obj.hasOwnProperty("parentId") &&
        (key === "checkboxState" ||
          key === "linkUrl" ||
          key === "text" ||
          key === "isBold" ||
          key === "isCentered" ||
          key === "fontSize" ||
          key === "textColor" ||
          key === "angle" ||
          key === "startX" ||
          key === "startY")
      ) {
        continue;
      }
      // Specifically handle children for lines later if needed, for now, basic stringify
      if (key === "children" && Array.isArray(obj[key])) {
        // Optionally, list child IDs if needed, or skip if hierarchy is enough
        // propsMd += `- ${key}: [${obj[key].join(', ')}]\n`;
      } else {
        propsMd += `- ${key}: ${JSON.stringify(obj[key])}\n`;
      }
    }
    return propsMd;
  };

  // 1. Process Lines (Hierarchically)
  const processLine = (lineId, depth) => {
    const line = jsonData.lines[lineId];
    if (!line) return;

    let titlePrefix = "";
    if (line.checkboxState === "checked") {
      titlePrefix = "[x] ";
    } else if (line.checkboxState === "unchecked") {
      titlePrefix = "[ ] ";
    }
    const escapedLineText = (line.text || "Untitled Line").replace(
      /\n/g,
      "\\n",
    );
    let lineTitleContent = escapedLineText;
    if (line.linkUrl) {
      // Use a default link text if actual text is empty but URL exists
      const linkText = line.text || "Link";
      lineTitleContent = `[${linkText}](${line.linkUrl})`;
    }
    const newLine = depth > 1 ? "\n" : "";
    mdString += `${newLine}${"#".repeat(
      depth,
    )} ${titlePrefix}${lineTitleContent}\n`;
    let formatParts = [];
    if (line.isBold === true) {
      // Default is false
      formatParts.push("bold");
    }
    if (line.isCentered === false) {
      // Default is true, so only add if explicitly false
      formatParts.push("left-aligned"); // Or a similar keyword for non-centered
    } else if (
      line.isCentered === true &&
      jsonData.lines[line.parentId] !== undefined
    ) {
      // Only add "centered" if it's not the root and it's true (to override potential inheritance if that was a feature)
      // For now, let's be explicit if it's true and not a root-level default style for clarity
      // Or, better: only add "centered" if true. Absence will mean use Pinta default (which is true).
      // If user wants left-aligned, they'd omit "centered" OR we introduce "left-aligned".
      // Let's go with: "centered" means true. Absence means Pinta default (true).
      // To make it *not* centered, we'll need a "left" or "left-aligned" keyword.
      // Given the prompt "centered (or not)", let's assume "centered" means true.
      // If the user wants to explicitly make it left, they would omit "centered" from format string,
      // and the parser would default to false.
      // To make this robust: If isCentered is true (Pinta default), we only *need* to write it if it's different from an implied "false" when format is present.
      // Simpler: if isCentered is true, write "centered".
      formatParts.push("centered");
    }

    if (line.fontSize !== undefined && line.fontSize !== 16) {
      // Default is 16
      formatParts.push(String(line.fontSize));
    }
    if (line.textColor && line.textColor !== "default") {
      // Default is "default"
      formatParts.push(line.textColor);
    }

    if (formatParts.length > 0) {
      mdString += `- format: ${formatParts.join(", ")}\n`;
    }
    // Line visual property (color and thickness)
    const isMainLine = line.parentId === null;
    const defaultThickness = isMainLine
      ? MAIN_LINE_DEFAULT_THICKNESS
      : CHILD_LINE_DEFAULT_THICKNESS;
    const lineColor = line.color || "default";
    const lineThickness =
      line.thickness === undefined
        ? defaultThickness
        : parseFloat(line.thickness);

    if (lineColor !== "default" || lineThickness !== defaultThickness) {
      mdString += `- line: ${lineColor}, ${lineThickness.toFixed(2)}\n`;
    }

    // Exclude properties now handled in the heading or specific format/line props for lines
    mdString += formatProps(line, [
      "id",
      "parentId",
      "children",
      "text",
      "checkboxState",
      "linkUrl",
      "isBold",
      "isCentered",
      "fontSize",
      "textColor",
      "color",
      "thickness",
      "angle",
      "startX",
      "startY",
      "hasCheckbox", // Avoid rewriting legacy fields
      "isCheckboxChecked", // Avoid rewriting legacy fields
    ]);

    if (line.children && line.children.length > 0) {
      line.children.forEach((childId) => processLine(childId, depth + 1));
    }
  };

  const rootLineId = Object.keys(jsonData.lines).find(
    (id) => jsonData.lines[id] && jsonData.lines[id].parentId === null,
  );

  if (rootLineId) {
    processLine(rootLineId, 1);
  } else {
    // Fallback if no single root (should not happen with current Pinta logic)
    Object.keys(jsonData.lines).forEach((lineId) => {
      if (jsonData.lines[lineId] && jsonData.lines[lineId].parentId === null) {
        processLine(lineId, 1);
      }
    });
  }
  mdString += "\n";

  // 2. Process Drawings
  if (jsonData.drawings && jsonData.drawings.length > 0) {
    mdString += "---\n";
    mdString += "# Drawings\n\n";
    jsonData.drawings.forEach((drawing) => {
      mdString += `## ${drawing.kind || "Unnamed Drawing"} ${drawing.id}\n`;
      mdString += formatProps(drawing, ["kind", "id"]);
      mdString += "\n";
    });
  }

  // 3. Process Post-its
  if (jsonData.postIts && Object.keys(jsonData.postIts).length > 0) {
    mdString += "---\n";
    mdString += "# Post its\n\n";
    for (const postItId in jsonData.postIts) {
      const postIt = jsonData.postIts[postItId];
      mdString += `## ${postIt.title || postIt.id}\n`;
      // Decide how to handle content. For now, treating as a prop.
      // For better readability, you might want a block for content:
      // mdString += `\n\`\`\`\n${postIt.content}\n\`\`\`\n`;
      mdString += formatProps(postIt, ["id", "title"]); // if title used in header
      mdString += "\n";
    }
  }

  return mdString.trim();
}

// Add this to js/files.js

/**
 * Converts a Markdown-like string back to Pinta JSON diagram data.
 * @param {string} markdownString The Markdown/YAML-hybrid string.
 * @returns {object} The Pinta diagram data object.
 */
function pintaMarkdownToJson(markdownString) {
  const jsonData = {
    lines: {},
    postIts: {},
    drawings: [],
    mainLineReference: null,
  };
  let lineIdCounter = 0;
  let drawingIdCounter = 0; // Keep track for drawings if IDs are not in MD
  let postItIdCounter = 0; // Keep track for post-its if IDs are not in MD

  const lines = markdownString.split("\n");
  let currentSection = "lines"; // 'lines', 'drawings', 'postits'
  let currentLineParentStack = [];
  let currentObject = null; // For drawings or postits

  // Helper to parse "prop: value" lines
  const parsePropLine = (line) => {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let valueString = match[2].trim();
      try {
        // Attempt to parse as JSON (handles numbers, booleans, null, strings in quotes)
        return { key, value: JSON.parse(valueString) };
      } catch (e) {
        // If JSON.parse fails, it's likely an unquoted string or malformed
        return { key, value: valueString };
      }
    }
    return null;
  };

  const linkRegex = /\[(.*?)\]\((.*?)\)/;

  for (const line of lines) {
    if (line.trim() === "---") {
      currentObject = null; // Reset current object when changing section
      // Determine next section based on the heading that should follow
      continue; // Separator processed, move to next line
    }

    if (currentSection === "lines") {
      const headingMatch = line.match(/^(#+)\s+(.*)/);
      if (headingMatch) {
        const depth = headingMatch[1].length;
        let titleText = headingMatch[2].trim();
        let lineCheckboxState = null;

        if (titleText.startsWith("[ ] ")) {
          lineCheckboxState = "unchecked";
          titleText = titleText.substring(4);
        } else if (
          titleText.startsWith("[x] ") ||
          titleText.startsWith("[X] ")
        ) {
          lineCheckboxState = "checked";
          titleText = titleText.substring(4);
        }
        let lineText = titleText;
        let linkUrl = null;
        const linkMatch = titleText.match(linkRegex);

        if (
          linkMatch &&
          linkMatch[1] !== undefined &&
          linkMatch[2] !== undefined
        ) {
          lineText = linkMatch[1].trim();
          linkUrl = linkMatch[2].trim();
          if (!lineText && linkUrl) {
            // Handle empty link text like [](<url>)
            lineText = "Link";
          }
        }
        const lineId = `line-${lineIdCounter++}`;
        lineText = lineText.replace(/\\n/g, "\n");
        currentObject = {
          id: lineId,
          text: lineText,
          children: [],
          parentId: null,
          // Initialize with some defaults that might be overridden by props
          textPosRatio: 0.5,
          textPerpOffset: -15,
          thickness:
            depth === 1
              ? MAIN_LINE_DEFAULT_THICKNESS
              : CHILD_LINE_DEFAULT_THICKNESS,
          visualColor: "default",
          textColor: "default",
          fontSize: 16,
          isBold: false,
          isCentered: true,
          linkUrl: linkUrl,
          checkboxState: lineCheckboxState,
        };

        if (depth === 1) {
          if (!jsonData.mainLineReference) {
            // Assuming the first H1 is the main line
            jsonData.mainLineReference = { id: lineId, length: 0 }; // Length will be updated by prop
          }
          currentLineParentStack = [
            { id: lineId, depth: 1, obj: currentObject },
          ];
        } else {
          while (
            currentLineParentStack.length > 0 &&
            currentLineParentStack[currentLineParentStack.length - 1].depth >=
              depth
          ) {
            currentLineParentStack.pop();
          }
          if (currentLineParentStack.length > 0) {
            const parent =
              currentLineParentStack[currentLineParentStack.length - 1];
            currentObject.parentId = parent.id;
            parent.obj.children.push(lineId);
            // Set default and hint for auto-distribution if not overridden by a prop later
            currentObject.relativeDirection =
              parent.obj.children.length % 2 === 0 ? -1 : 1; // Default alternation
            currentObject.offsetRatioOnParent = 0.5; // Default to middle
            currentObject.autoPositionHint = true; // Add this hint for implicit positioning
          }
          currentLineParentStack.push({
            id: lineId,
            depth: depth,
            obj: currentObject,
          });
        }
        jsonData.lines[lineId] = currentObject;
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject && currentSection === "lines") {
          if (prop.key === "format") {
            console.log(prop.value);
            const formatString = `${prop.value}` || "";
            const parts = formatString
              .split(",")
              .map((p) => p.trim().toLowerCase());

            // Apply format parts, potentially overriding defaults set above
            // If a format part is missing, the default (or prior value) holds.
            // For isCentered, absence of "centered" in a format string means left-aligned.
            let foundCenteredInFormat = false;

            parts.forEach((part) => {
              if (part === "bold") {
                currentObject.isBold = true;
              } else if (part === "centered") {
                currentObject.isCentered = true;
                foundCenteredInFormat = true;
              } else if (part === "left-aligned") {
                // Specific keyword for left-align
                currentObject.isCentered = false;
                foundCenteredInFormat = true; // A alignment choice was made
              } else if (!isNaN(parseInt(part))) {
                currentObject.fontSize = parseInt(part);
              } else if (
                Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(part)
              ) {
                currentObject.textColor = part;
              } else if (SCHEMA_LINE_VISUAL_COLORS[part]) {
                // Check if it's a short color code like 'r' for 'red'
                currentObject.textColor = SCHEMA_LINE_VISUAL_COLORS[part];
              }
            });
            // If format string exists but "centered" or "left-aligned" is NOT mentioned,
            // it should become left-aligned (isCentered: false)
            if (!foundCenteredInFormat) {
              currentObject.isCentered = false;
            }

            delete currentObject.autoPositionHint;
          } else if (prop.key === "line") {
            const lineStyleString = prop.value;
            const parts = lineStyleString
              .split(",")
              .map((p) => p.trim().toLowerCase());

            // Defaults for color/thickness are already set. Override if found in parts.
            parts.forEach((part) => {
              const numPart = parseFloat(part);
              if (!isNaN(numPart)) {
                currentObject.thickness = numPart;
              } else if (
                Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(part)
              ) {
                currentObject.color = part;
              } else if (SCHEMA_LINE_VISUAL_COLORS[part]) {
                currentObject.color = SCHEMA_LINE_VISUAL_COLORS[part];
              }
            });
            delete currentObject.autoPositionHint;
          } else if (
            ![
              "text",
              "checkboxState",
              "linkUrl",
              "isBold",
              "isCentered",
              "fontSize",
              "textColor",
              "color",
              "thickness",
            ].includes(prop.key)
          ) {
            currentObject[prop.key] = prop.value;
            if (
              prop.key === "offsetRatioOnParent" ||
              prop.key === "relativeDirection" ||
              prop.key === "startX" ||
              prop.key === "startY"
            ) {
              delete currentObject.autoPositionHint;
            }
          }
          if (
            currentObject.id === jsonData.mainLineReference?.id &&
            prop.key === "length"
          ) {
            jsonData.mainLineReference.length = parseFloat(prop.value);
          }
        }
      }
    } else if (currentSection === "drawings") {
      const itemHeadingMatch = line.match(/^##\s+([^ ]+)\s+([^ ]+)/); // Matches "## kind id"
      if (itemHeadingMatch) {
        currentObject = { kind: itemHeadingMatch[1], id: itemHeadingMatch[2] };
        jsonData.drawings.push(currentObject);
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject) {
          currentObject[prop.key] = prop.value;
        }
      }
    } else if (currentSection === "postits") {
      const itemHeadingMatch = line.match(/^##\s+(.*)/); // Matches "## Title or ID"
      if (itemHeadingMatch) {
        const titleOrId = itemHeadingMatch[1].trim();
        // Attempt to extract ID if title format is "Title (id)" or just use as ID.
        // For simplicity, we'll assume the heading IS the ID or a unique title.
        // A more robust system might require explicit ID prop.
        const id = titleOrId.startsWith("postit-")
          ? titleOrId
          : `postit-${postItIdCounter++}`;
        currentObject = { id: id, title: titleOrId !== id ? titleOrId : "" };
        jsonData.postIts[id] = currentObject;
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject) {
          currentObject[prop.key] = prop.value;
        }
      }
    }

    // Switch section based on heading
    if (line.trim() === "# Drawings") {
      currentSection = "drawings";
      currentObject = null;
      currentLineParentStack = []; // Reset parent stack for lines
    } else if (line.trim() === "# Post its") {
      currentSection = "postits";
      currentObject = null;
      currentLineParentStack = []; // Reset parent stack for lines
    }
  }
  // After parsing all lines, ensure mainLineReference has length if not set by a prop for line-0
  if (
    jsonData.mainLineReference &&
    jsonData.mainLineReference.length === 0 &&
    jsonData.lines[jsonData.mainLineReference.id]
  ) {
    jsonData.mainLineReference.length =
      jsonData.lines[jsonData.mainLineReference.id].length || 0;
  }

  return jsonData;
}
