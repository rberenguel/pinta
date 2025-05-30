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
  getLineDisplayAngle,
  MAIN_LINE_DEFAULT_THICKNESS,
  CHILD_LINE_DEFAULT_THICKNESS,
  MIN_LINE_LENGTH,
} from "./lines.js";

import { getLinkPrefix } from "./text.js";

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
    // An error during permission request (e.g. user dismissed prompt quickly) can occur.
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

// js/files.js (continued)

async function triggerSaveDiagram() {
  // ... (existing code to collect state.linesStore, state.postItsStore, etc. into dataToSave) ...
  // This part remains the same as your current Pinta logic
  const mainLineId = Object.keys(state.linesStore).find(
    (id) => state.linesStore[id].parentId === null,
  );
  for (const id in state.postItsStore) {
    const postItElement = document.getElementById(id);
    if (postItElement) {
      const editorRect = editorContainer.getBoundingClientRect();
      if (editorRect.width > 0)
        state.postItsStore[id].xPercent =
          (parseFloat(postItElement.style.left) / editorRect.width) * 100;
      if (editorRect.height > 0)
        state.postItsStore[id].yPercent =
          (parseFloat(postItElement.style.top) / editorRect.height) * 100;
      state.postItsStore[id].content =
        postItElement.querySelector(".postit-content-area")?.innerHTML || "";
      state.postItsStore[id].title =
        postItElement.querySelector(".postit-drag-handle")?.textContent || "";
    }
  }
  const drawingsToSave = Object.values(state.drawingElementsStore)
    .map((el) => el.toSaveData())
    .filter((d) => d !== null);

  const dataToSave = {
    lines: state.linesStore,
    postIts: state.postItsStore,
    drawings: drawingsToSave,
    mainLineReference:
      mainLineId && state.linesStore[mainLineId]
        ? {
            id: mainLineId,
            length: state.linesStore[mainLineId].length,
          }
        : null,
  };
  const diagramData = JSON.stringify(dataToSave, null, 2);
  const blob = new Blob([diagramData], { type: "application/json" });
  let fileHandle = null;

  try {
    // Attempt to get the currently stored file handle for a "Save" operation
    const existingHandle = await get("pintaLastFileHandle");
    if (existingHandle && (await verifyPermission(existingHandle))) {
      fileHandle = existingHandle;
      console.log("Pinta: Using existing file handle for saving.");
    } else {
      // No valid existing handle, or permission issue, so treat as "Save As"
      if (window.showSaveFilePicker) {
        console.log(
          "Pinta: No valid existing handle, prompting for new file location (Save As).",
        );
        fileHandle = await window.showSaveFilePicker({
          suggestedName: "diagram.pnt",
          types: [
            {
              description: "Pinta JSON Diagram Files (.pnt)",
              accept: { "application/json": [".pnt"] },
            },
          ],
        });
      }
    }

    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      await set("pintaLastFileHandle", fileHandle); // Store/update the handle
      console.log("Pinta: Diagram saved successfully. Handle stored/updated.");
    } else {
      // Fallback for browsers without showSaveFilePicker or if user cancelled initial "Save As"
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

// js/files.js (continued)

async function triggerLoadDiagram() {
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Pinta JSON Diagram Files (.pnt)",
            accept: { "application/json": [".pnt"] },
          },
        ],
        multiple: false,
      });
      if (await verifyPermission(fileHandle)) {
        await set("pintaLastFileHandle", fileHandle);
        const file = await fileHandle.getFile();
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

function _processLoadedDiagramData(jsonString) {
  try {
    const savedData = JSON.parse(jsonString);
    if (
      typeof savedData === "object" &&
      savedData !== null &&
      savedData.lines // Basic check for valid structure
    ) {
      // This is the core logic from your existing loadDataFromFile's reader.onload
      editorContainer.innerHTML = ""; // Clear existing diagram
      const newdrawingCanvas = document.createElementNS(SVG_NS, "svg");
      newdrawingCanvas.id = "drawingCanvas";
      newdrawingCanvas.setAttribute("width", "100%");
      newdrawingCanvas.setAttribute("height", "100%");
      // Copy your full <defs> content here
      newdrawingCanvas.innerHTML = `<defs>
                          <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
                              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                              <feOffset dx="1" dy="1" result="offsetBlur"/>
                              <feMerge><feMergeNode in="offsetBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                          </filter>
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
      if (
        !editorContainer ||
        containerRect.width === 0 ||
        containerRect.height === 0
      ) {
        console.error(
          "Pinta: Editor container not ready during data processing.",
        );
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
      const dx = p2x - p1x;
      const dy = p2y - p1y;
      const currentDisplayMainLength = Math.sqrt(dx * dx + dy * dy);
      const currentDisplayMainAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      state.currentMainLineAngle = currentDisplayMainAngle;
      const currentDisplayMainStartX = p1x;
      const currentDisplayMainStartY = p1y;
      const currentDisplayMainThickness = MAIN_LINE_DEFAULT_THICKNESS;

      const scaleFactor =
        mainLineRef && mainLineRef.length !== 0 && currentDisplayMainLength > 0
          ? currentDisplayMainLength / mainLineRef.length
          : 1;

      let maxLineIdNum = -1;
      const tempLinesArray = Object.values(loadedLinesPart); // Simpler way to get array
      tempLinesArray.sort((a, b) =>
        a.parentId === null ? -1 : b.parentId === null ? 1 : 0,
      );

      const mainLineLoadedId = mainLineRef
        ? mainLineRef.id
        : tempLinesArray.find((l) => l.parentId === null)?.id;

      tempLinesArray.forEach((loadedLine) => {
        const numId = parseInt(loadedLine.id.split("-")[1]);
        if (!isNaN(numId) && numId > maxLineIdNum) maxLineIdNum = numId;

        let newLineData = { ...loadedLine };
        if (mainLineLoadedId && loadedLine.id === mainLineLoadedId) {
          newLineData.startX = currentDisplayMainStartX;
          newLineData.startY = currentDisplayMainStartY;
          newLineData.length = Math.max(
            currentDisplayMainLength,
            MIN_LINE_LENGTH,
          );
          newLineData.angle = currentDisplayMainAngle;
          newLineData.thickness = currentDisplayMainThickness;
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
          // Ensure startX and startY are present if they are somehow missing for child lines
          // This part might need more sophisticated repositioning based on parent if they are not absolute in save file
          // For now, assuming saved child lines have absolute startX/startY or are correctly recalculated
        }
        state.linesStore[newLineData.id] = newLineData;
      });
      state.lineIdCounter = maxLineIdNum + 1;

      const mainLineToRender = mainLineLoadedId
        ? state.linesStore[mainLineLoadedId]
        : null;
      if (mainLineToRender) {
        renderLine(mainLineToRender);
        updateChildrenPositions(mainLineLoadedId);
      } else if (Object.keys(state.linesStore).length > 0) {
        console.warn(
          "Pinta: Main line could not be identified, rendering all loaded lines directly. This might lead to incorrect initial positions for child lines if they rely on dynamic parent positioning.",
        );
        for (const id in state.linesStore) renderLine(state.linesStore[id]);
      } else {
        console.log(
          "Pinta: No lines in loaded file/data. Initializing fresh (or this might be an error if data was expected).",
        );
        // init(); // Calling init() here might be too drastic, implies an empty file.
        // If called from openExample, and example is empty, init() would be correct.
        // For now, let's assume if we reach here with no lines, the file was "empty" of lines.
      }

      let maxPostItIdNum = -1;
      for (const id in loadedPostItsPart) {
        const noteData = loadedPostItsPart[id];
        const numId = parseInt(id.split("-")[1]);
        if (!isNaN(numId) && numId > maxPostItIdNum) maxPostItIdNum = numId;
        createPostIt(noteData);
      }
      state.postItIdCounter = maxPostItIdNum + 1;

      let maxDrawingIdNum = -1;
      loadedDrawingsPart.forEach((shapeData) => {
        const numId = parseInt(shapeData.id.split("-")[1]);
        if (!isNaN(numId) && numId > maxDrawingIdNum) maxDrawingIdNum = numId;

        const currentEditorRect = editorContainer.getBoundingClientRect(); // Use current rect
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
            // Check if element exists before setting attributes
            shape.element.setAttribute("x", x);
            shape.element.setAttribute("y", y);
            shape.element.setAttribute("width", w);
            shape.element.setAttribute("height", h);
          }
          if (typeof shape._applyRotation === "function") {
            shape._applyRotation(); // Apply rotation based on current main line angle
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
            // Check if element exists
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
    // If it's a string, process it directly
    console.log("Pinta: Loading diagram from JSON string.");
    _processLoadedDiagramData(fileOrJsonString);
  } else if (fileOrJsonString instanceof File) {
    // If it's a File object, use FileReader
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

/* HTML export */
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
  if (!loadedCSSText) {
    alert("Styles are not loaded yet. Please try again in a moment.");
    // Optionally, try to fetch them again here if it's critical path
    await fetchAppStyles(); // Attempt to fetch if not loaded
    if (!loadedCSSText) {
      alert("Failed to load styles for export. Cannot proceed.");
      return;
    }
  }

  const currentThemeClass = document.body.classList.contains("light-theme")
    ? "light-theme"
    : "";
  let diagramContentHTML = "";

  // A. Editor Wrapper (mimics #editor-container)
  const editorRect = editorContainer.getBoundingClientRect(); //
  const editorWrapperStyle = `
    position: relative;
    width: ${editorRect.width}px;
    height: ${editorRect.height}px;
    background-color: var(--theme-editor-background);
    border: 1px solid var(--theme-border-color);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    border-radius: 0.5rem;
    margin: 20px auto; /* Center it on the page */
  `;

  // B. Serialize Schema Lines
  const linesHtml = Object.values(state.linesStore)
    .map((line) => {
      const displayAngle = getLineDisplayAngle(line.id, state.linesStore); // Assumes getLineDisplayAngle is available
      const absLength = Math.abs(line.length);
      const groupScaleX = line.length < 0 ? -1 : 1;
      const normAngleForText = ((displayAngle % 360) + 360) % 360;
      const lineElementGroup = document.getElementById(line.id);
      const textElement = lineElementGroup
        ? lineElementGroup.querySelector(".line-text")
        : null;
      const textInternalRotation =
        normAngleForText > 90 && normAngleForText < 270 ? 180 : 0;
      const textScaleX = groupScaleX;

      const groupStyle = `position:absolute; left:${line.startX}px; top:${line.startY}px; width:${absLength}px; transform:rotate(${displayAngle}deg) scaleX(${groupScaleX}); transform-origin:0 0;`;
      // Use actual color value for line.color if it's a CSS var, or ensure var is defined.
      // For simplicity, assuming CSS vars in embedded style will handle it.
      const visualStyle = `width:100%; background-color:${line.color || "var(--theme-schema-line-color)"}; position:absolute; top:50%; transform:translateY(-50%); height:${line.thickness}px; border-radius:2px; background-clip:padding-box; border-top:0.5em solid transparent; border-bottom:0.5em solid transparent;`; // Added border technique

      let textContentHtml;
      const rawLineText = line.text || "...";
      if (line.linkUrl) {
        const prefix = getLinkPrefix(line.linkUrl); // Assumes getLinkPrefix is available
        // Line text with link becomes fully clickable, no extra decoration
        textContentHtml = `<a href="${escapeHtml(line.linkUrl)}" target="_blank" style="text-decoration:none; color:inherit;">${escapeHtml(prefix)}${escapeHtml(rawLineText)}</a>`;
      } else {
        textContentHtml = escapeHtml(rawLineText);
      }
      let whiteSpaceStyle = "";
      let widthStyle = "";
      // let widthStyle = 'width: auto;'; // 'width: auto' is often default for block/inline-block if maxWidth is used

      if (textElement && textElement.style) {
        if (textElement.style.whiteSpace) {
          whiteSpaceStyle = `white-space: ${textElement.style.whiteSpace};`;
        } else {
          // Fallback if not explicitly set (though renderLine should set it)
          whiteSpaceStyle = "white-space: pre-wrap;"; // Default to pre-wrap if somehow not set
        }

        if (
          textElement.style.maxWidth &&
          textElement.style.maxWidth !== "none" &&
          textElement.style.maxWidth !== ""
        ) {
          widthStyle = `width: ${textElement.style.width};`;
        }
        // If 'renderLine' also sets 'element.style.width' explicitly (other than 'auto'), fetch it:
        // if (textElement.style.width && textElement.style.width !== 'auto') {
        //   widthStyle = `width: ${textElement.style.width};`;
        // }
      } else {
        // Fallback logic if the DOM element isn't found or styles aren't set.
        // This indicates an issue, but we can provide a graceful degradation.
        console.warn(
          `HTML Export: Text element for line ${line.id} not found or styles missing. Using default export text styles.`,
        );
        const hasExplicitNewlinesFallback =
          line.text && line.text.includes("\n");
        whiteSpaceStyle = hasExplicitNewlinesFallback
          ? "white-space: pre-wrap;"
          : "white-space: normal;";
      }
      // *** END FETCHING STYLES ***

      const textStyle = `position:absolute; ${whiteSpaceStyle} ${widthStyle} color:var(--theme-schema-text-color); font-size:${
        line.fontSize || 16
      }px; padding:1px 2px; left:${line.textPosRatio * 100}%; top:${
        line.textPerpOffset
      }px; transform:translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg); font-weight:${
        line.isBold ? "bold" : "normal"
      }; text-align:${line.isCentered ? "center" : "left"};`;

      return `<div class="line-element-group" style="${groupStyle}"><div class="line-visual" style="${visualStyle}"></div><div class="line-text" style="${textStyle}">${textContentHtml}</div></div>`;
    })
    .join("");
  diagramContentHTML += linesHtml;

  // C. Serialize Post-it Notes
  const postItsHtml = Object.values(state.postItsStore)
    .map((postIt) => {
      const leftPx = (postIt.xPercent / 100) * editorRect.width;
      const topPx = (postIt.yPercent / 100) * editorRect.height;
      // Styles from style.css for .post-it
      const postItOuterStyle = `position:absolute; left:${leftPx}px; top:${topPx}px; z-index:500; padding:20px 8px 8px 8px; border-radius:3px; box-shadow:2px 2px 5px rgba(0,0,0,0.3); min-width:100px; min-height:50px; font-family:'Inter',sans-serif; font-size:${postIt.fontSizePercent ? (postIt.fontSizePercent / 100) * 11 + "px" : "11px"}; word-wrap:break-word; overflow:hidden; box-sizing:border-box; display:flex; flex-direction:column;`;
      const colorClass = `postit-color-${postIt.color || "yellow"}`; //

      // Simplified drag handle (not draggable in static export)
      const titleHtml = `<div class="postit-drag-handle" style="height:18px; padding-left:5px; font-size:10px; box-sizing:border-box;">${escapeHtml(postIt.title || "")}</div>`;
      const contentAreaHtml = `<div class="postit-content-area" style="flex-grow:1; white-space:pre-wrap; word-wrap:break-word; padding:2px; overflow-y:auto; color:inherit;">${postIt.content}</div>`; // postIt.content is already HTML

      return `<div class="post-it ${colorClass}" style="${postItOuterStyle}">${titleHtml}${contentAreaHtml}</div>`;
    })
    .join("");
  diagramContentHTML += postItsHtml;

  // D. Serialize SVG Drawings
  if (state.drawingCanvas) {
    // state.drawingCanvas is the <svg> element
    // Ensure SVG is styled relative to its container, not viewport percentages if it was 100% before
    const svgStyle = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;`;
    // Clone to avoid modifying the live canvas, then set style, then get outerHTML
    const svgClone = state.drawingCanvas.cloneNode(true);
    svgClone.setAttribute("style", svgStyle);
    diagramContentHTML += svgClone.outerHTML;
  }

  // E. Assemble Full HTML
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
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; /* From body style.css */
        background-color: var(--theme-main-background); /* */
        color: var(--theme-primary-text); /* */
        display: flex; /* */
        justify-content: center; /* */
        align-items: center; /* */
        min-height: 100vh; /* */
    }
    /* Ensure links within exported post-its are styled correctly if default is overridden */
    .postit-content-area a { color: var(--blue); text-decoration: underline; } /* From style.css */
    .postit-content-area a:hover { color: var(--cyan); } /* From style.css */

  </style>
</head>
<body class="${currentThemeClass}">
  <div id="editor-container-export" style="${editorWrapperStyle}">
    ${diagramContentHTML}
  </div>
</body>
</html>`;

  // F. Trigger Download
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
