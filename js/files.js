export {
  triggerSaveDiagram,
  triggerLoadDiagram,
  loadDataFromFile,
  clearLastFileHandle,
  verifyPermission,
  getCurrentDiagramDataForSave,
};

import { del, set, get } from "../lib/idb-keyval.js";
import {
  state,
  editorContainer,
  filePicker,
  SVG_NS,
  cleanupUnusedDataUrls,
} from "./state.js";
import { createPostIt } from "./postit.js";
import { Rect, Arrow } from "./drawing.js";
import {
  renderLine,
  updateChildrenPositions,
  MAIN_LINE_DEFAULT_THICKNESS,
  CHILD_LINE_DEFAULT_THICKNESS,
  MIN_LINE_LENGTH,
  getLineDepth,
} from "./lines.js";
import { pintaJsonToMarkdown, pintaMarkdownToJson } from "./markdown.js";

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
    dataUrls: state.dataUrls,
    dataUrlCounter: state.dataUrlCounter,
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
      setTimeout(() => info.classList.remove("fades"), 2500);
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

    state.dataUrls = jsonData.dataUrls || {};
    state.dataUrlCounter = jsonData.dataUrlCounter || 0;

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
      console.log("hello");
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
    cleanupUnusedDataUrls();
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
