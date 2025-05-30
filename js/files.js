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
  // If loadedCSSText is not passed, try to fetch it.
  if (!loadedCSSText) {
    // This is a simplified version. In your actual code,
    // ensure loadedCSSText is properly populated before this function is called,
    // or pass it as an argument after fetching.
    // For demonstration, we'll try a conceptual fetch.
    const styleResponse = await fetch("./style.css");
    if (styleResponse.ok) {
      loadedCSSText = await styleResponse.text();
    } else {
      alert(
        "Styles could not be loaded for export. The diagram might not look correct.",
      );
      loadedCSSText = "/* Stylesheet could not be loaded */";
    }
  }

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

  // B. Serialize Schema Lines
  const linesHtml = Object.values(state.linesStore)
    .map((line) => {
      const lineElementGroup = document.getElementById(line.id);
      if (!lineElementGroup) return "";

      const groupClassAttr = lineElementGroup.className
        ? `class="${lineElementGroup.className}"`
        : "";
      // Styles for the group are set directly by renderLine (left, top, width, transform, transform-origin)
      // So, lineElementGroup.style.cssText should capture them.
      const groupStyle = lineElementGroup.style.cssText || "";

      let visualHtml = "";
      const visualElement = lineElementGroup.querySelector(".line-visual");
      if (visualElement) {
        const visualClassAttr = visualElement.className
          ? `class="${visualElement.className}"`
          : "";
        // Styles for visual (height, background-color) are set by renderLine
        const visualStyle = visualElement.style.cssText || "";
        visualHtml = `<div ${visualClassAttr} style="${visualStyle}"></div>`;
      }

      let textHtml = "";
      const textElement = lineElementGroup.querySelector(".line-text");
      if (textElement) {
        const textClassAttr = textElement.className
          ? `class="${textElement.className}"`
          : "";
        // Styles for text (left, top, transform, font-size, font-weight, text-align, white-space, width, max-width etc.) are set by renderLine
        const textStyle = textElement.style.cssText || "";

        let textContentHtml;
        const rawLineText = line.text || "..."; // Use stored text
        if (line.linkUrl) {
          const prefix = getLinkPrefix(line.linkUrl);
          textContentHtml = `<a href="${escapeHtml(line.linkUrl)}" target="_blank" style="text-decoration:none; color:inherit;">${escapeHtml(prefix)}${escapeHtml(rawLineText)}</a>`;
        } else {
          textContentHtml = escapeHtml(rawLineText);
        }
        textHtml = `<div ${textClassAttr} style="${textStyle}">${textContentHtml}</div>`;
      }

      return `<div ${groupClassAttr} style="${groupStyle}">${visualHtml}${textHtml}</div>`;
    })
    .join("");
  diagramContentHTML += linesHtml;

  // C. Serialize Post-it Notes
  const postItsHtml = Object.values(state.postItsStore)
    .map((postIt) => {
      const postItElement = document.getElementById(postIt.id);
      if (!postItElement) return "";

      const elemRect = postItElement.getBoundingClientRect();
      const exportLeft =
        elemRect.left - liveEditorRectForRelativePositioning.left;
      const exportTop = elemRect.top - liveEditorRectForRelativePositioning.top;

      // Base geometric styles from getBoundingClientRect
      let postItGeneratedStyle = `position:absolute; left:${exportLeft}px; top:${exportTop}px; width:${elemRect.width}px; height:${elemRect.height}px;`;

      // Append other relevant inline styles from the element if they exist and aren't geometry
      // This is a simple concatenation; a more robust method would parse and merge.
      // For post-its, other styles like padding, box-shadow, etc., mostly come from CSS classes.
      // We need to be careful not to duplicate or override the geometry.
      // A common dynamic style for post-its via JS might be 'transform', if used.
      if (postItElement.style.transform) {
        postItGeneratedStyle += ` transform: ${postItElement.style.transform};`;
      }
      // Add other specific inline styles if necessary.

      const classAttr = postItElement.className
        ? `class="${postItElement.className}"`
        : ""; // This includes "post-it" and "postit-color-..."

      let titleHtml = "";
      const titleHandle = postItElement.querySelector(".postit-drag-handle");
      if (titleHandle) {
        const titleClass = titleHandle.className
          ? `class="${titleHandle.className}"`
          : "";
        // Capture inline styles of the handle, if any are dynamically set by JS
        const titleStyle = titleHandle.style.cssText
          ? `style="${titleHandle.style.cssText}"`
          : "";
        titleHtml = `<div ${titleClass} ${titleStyle}>${escapeHtml(postIt.title || "")}</div>`;
      }

      let contentAreaHtml = "";
      const contentArea = postItElement.querySelector(".postit-content-area");
      if (contentArea) {
        const contentClass = contentArea.className
          ? `class="${contentArea.className}"`
          : "";
        // Capture inline styles of content area, e.g., dynamically set font-size
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

  // D. Serialize SVG Drawings
  if (state.drawingCanvas) {
    const svgClone = state.drawingCanvas.cloneNode(true);
    // The style ensures it overlays correctly within the #editor-container-export
    svgClone.setAttribute(
      "style",
      "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;",
    );
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
