export { init, createNewDiagram };

import {
  state,
  SVG_NS,
  POSTIT_DEFAULT_COLOR,
  POSTIT_VALID_COLORS,
  drawingColorNames,
  editorContainer,
  deleteModal,
  filePicker,
} from "./js/state.js";

import { Rect, Arrow } from "./js/drawing.js";
import { createPostIt } from "./js/postit.js";
import { initializelinkModal } from "./js/text.js";
import { del, get, set } from "./lib/idb-keyval.js";

import {
  triggerSaveDiagram,
  triggerLoadDiagram,
  loadDataFromFile,
  verifyPermission,
  clearLastFileHandle,
} from "./js/files.js";

import {
  createLineObject,
  renderLine,
  MAIN_LINE_DEFAULT_THICKNESS,
  highlightBranch,
  updateChildrenPositions,
  deleteLineRecursive,
  getLineDisplayAngle,
  isEditingLineText,
  increaseAllLinesFontSize,
  decreaseAllLinesFontSize,
} from "./js/lines.js";

import { exportToStaticHTML } from "./js/htmlExport.js";

import { handleDeleteItemClick } from "./js/delete.js";

let launchHandledByQueue = false;

let helpModal;
let closeHelpModalButton;

let version = "";
let loadedCSSText = "";
let loadedCSSIconoir = "";

function getDeepCopyOfBranch(lineId, linesStore) {
  const line = linesStore[lineId];
  if (!line) return null;

  const lineCopy = { ...line, children: [] }; // Deep copy of line, reset children

  if (line.children && line.children.length > 0) {
    lineCopy.children = line.children
      .map((childId) => getDeepCopyOfBranch(childId, linesStore))
      .filter(Boolean); // Filter out nulls if any child is missing
  }

  return lineCopy;
}

function addBranchToStore(lineData, linesStore) {
  linesStore[lineData.id] = { ...lineData, children: [] };

  if (lineData.children && lineData.children.length > 0) {
    lineData.children.forEach((child) => {
      linesStore[lineData.id].children.push(child.id);
      addBranchToStore(child, linesStore);
    });
  }
}

function pasteBranch(branchData, newParentId, linesStore) {
  const newId = `line-${state.lineIdCounter++}`;
  const newLineData = {
    ...branchData,
    id: newId,
    parentId: newParentId,
    children: [], // This will be populated recursively
  };

  linesStore[newId] = newLineData;

  if (branchData.children && branchData.children.length > 0) {
    newLineData.children = branchData.children.map((childData) => {
      const newChild = pasteBranch(childData, newId, linesStore);
      return newChild.id;
    });
  }

  return newLineData;
}

function restoreClipboard() {
  if (!state.clipboard) return;

  state.clipboard.forEach((branchRoot) => {
    // Add the branch back to the linesStore
    addBranchToStore(branchRoot, state.linesStore);

    // Re-link to the original parent
    const parent = state.linesStore[branchRoot.parentId];
    if (parent) {
      if (!parent.children.includes(branchRoot.id)) {
        parent.children.push(branchRoot.id);
      }
    }

    // Re-render the restored branch
    renderLine(state.linesStore[branchRoot.id], { updating: true });
  });

  // Clear the clipboard
  state.clipboard = null;
  console.log("Pinta: Cut operation undone.");
}

async function handleLaunchQueueFiles(launchParams) {
  console.debug("Processing launch queue");
  if (!launchParams.files || launchParams.files.length === 0) {
    console.info("No files in launch queue");
    launchHandledByQueue = false;
    return false; // No files launched
  }
  launchHandledByQueue = true; // Mark that launch queue is attempting to handle a file
  const fileHandle = launchParams.files[0];

  if (fileHandle) {
    try {
      console.log("Pinta: Attempting to load file from PWA launch queue...");
      if (await verifyPermission(fileHandle)) {
        await set("pintaLastFileHandle", fileHandle);
        const file = await fileHandle.getFile();
        loadDataFromFile(file); // Pinta's function to parse and render diagram data
        console.log("Pinta: Successfully loaded file from launch queue.");
        return true; // File successfully processed
      } else {
        console.error("Pinta: Permission denied for file launched via PWA.");
        try {
          await del("pintaLastFileHandle");
        } catch (e) {
          // Ignoring error
        }
      }
    } catch (error) {
      console.error("Pinta: Error handling file from PWA launch queue:", error);
    }
  }
  return false; // File not processed
}

async function loadFromStorageOrInitDefault() {
  console.info("Loading from storage");
  if (launchHandledByQueue) {
    // If launch queue already attempted to load a file (successfully or not),
    // respect that outcome. If it failed and state is still empty, init() might be called later.
    // If Pinta's state is empty after launch queue attempt (e.g., error during loadDataFromFile)
    if (
      !Object.keys(state.linesStore || {}).length &&
      !Object.keys(state.postItsStore || {}).length
    ) {
      console.log(
        "Pinta: Launch queue processed, but diagram state is empty. Initializing default diagram.",
      );
      init(); // Initialize a default Pinta diagram
    }
    return;
  }

  let successfullyLoadedFromIDB = false;
  try {
    const fileHandle = await get("pintaLastFileHandle");
    if (fileHandle) {
      console.log(
        "Pinta: Found last file handle in IndexedDB. Verifying permission...",
      );
      if (await verifyPermission(fileHandle)) {
        const file = await fileHandle.getFile();
        loadDataFromFile(file);
        console.log(
          "Pinta: Successfully loaded last session file from IndexedDB.",
        );
        successfullyLoadedFromIDB = true;
      } else {
        console.warn(
          "Pinta: Permission denied for stored file handle. Clearing it.",
        );
        try {
          await del("pintaLastFileHandle");
        } catch (e) {
          // Ignore error
        }
      }
    } else {
      console.log("Pinta: No last file handle found in IndexedDB.");
    }
  } catch (error) {
    console.error(
      "Pinta: Error loading last session file from IndexedDB:",
      error,
    );
    try {
      await del("pintaLastFileHandle");
    } catch (e) {
      // Ignore error
    }
  }

  if (!successfullyLoadedFromIDB) {
    console.log("Pinta: Initializing a new default diagram.");
    init(); // Pinta's existing function to set up a blank or default diagram
  }
}

async function fetchAppStyles() {
  try {
    const response = await fetch("./style.css");
    if (response.ok) {
      loadedCSSText = await response.text();
      console.log("App styles fetched for export.");
    } else {
      console.warn(
        "Failed to fetch style.css for export:",
        response.statusText,
      );
    }
  } catch (error) {
    console.error("Error fetching style.css for export:", error);
  }
  try {
    const response = await fetch("./fonts/iconoir/iconoir.css");
    if (response.ok) {
      loadedCSSIconoir = await response.text();
      console.log("App styles fetched for export.");
    } else {
      console.warn(
        "Failed to fetch style.css for export:",
        response.statusText,
      );
    }
  } catch (error) {
    console.error("Error fetching iconoir.css for export:", error);
  }
}

async function fetchSelfManifest() {
  try {
    const response = await fetch("./manifest.json"); // Assumes style.css is in the same directory as index.html
    if (response.ok) {
      let loadedManifest = await response.text();
      version = JSON.parse(loadedManifest).version;
      state.version = version;
      helpModal.querySelector("h3").innerHTML = helpModal
        .querySelector("h3")
        .innerHTML.replace("{{version}}", version);
      console.log("Version fetched.");
    } else {
      console.warn("Failed to fetch manifest", response.statusText);
    }
  } catch (error) {
    console.error("Error fetching manifest: ", error);
  }
}

function showHelpModal() {
  if (helpModal) {
    helpModal.style.display = "flex";
  }
}

function hideHelpModal() {
  if (helpModal) {
    helpModal.style.display = "none";
  }
}

editorContainer.addEventListener("click", (ev) => {
  if (ev.altKey && ev.target === editorContainer) {
    const editorRect = editorContainer.getBoundingClientRect();
    const xPercent = ((ev.clientX - editorRect.left) / editorRect.width) * 100;
    const yPercent = ((ev.clientY - editorRect.top) / editorRect.height) * 100;
    createPostIt({
      xPercent: xPercent,
      yPercent: yPercent,
      color:
        POSTIT_VALID_COLORS[
          Math.floor(Math.random() * POSTIT_VALID_COLORS.length)
        ],
    });
  }
});

interact(editorContainer).on("hold", function (event) {
  if (event.button != 0) {
    return;
  }
  if (event.target === editorContainer) {
    const editorRect = editorContainer.getBoundingClientRect();
    const xPercent = ((event.pageX - editorRect.left) / editorRect.width) * 100;
    const yPercent = ((event.pageY - editorRect.top) / editorRect.height) * 100;
    createPostIt({
      xPercent: xPercent,
      yPercent: yPercent,
      color: POSTIT_DEFAULT_COLOR,
    });
  }
});

filePicker.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) loadDataFromFile(file);
});

function handleKeyDown(event) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
  const activeEl = document.activeElement;
  const isEditingText =
    activeEl &&
    (activeEl.isContentEditable ||
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA");

  const isModalActive =
    deleteModal.style.display === "flex" ||
    state.linkModal?.style.display === "flex";

  if (ctrlCmd && event.key.toLowerCase() === "s") {
    event.preventDefault();
    triggerSaveDiagram();
    return;
  } else if (ctrlCmd && event.key.toLowerCase() === "o") {
    event.preventDefault();
    triggerLoadDiagram();
    return;
  } else if (ctrlCmd && event.key.toLowerCase() === "c" && !isEditingText) {
    event.preventDefault();
    if (state.selectedLines.size > 0) {
      state.clipboard = [];
      state.selectedLines.forEach((lineId) => {
        const branchCopy = getDeepCopyOfBranch(lineId, state.linesStore);
        if (branchCopy) {
          state.clipboard.push(branchCopy);
        }
      });
      state.isCutOperation = false;
      state.selectedLines.forEach((id) => highlightBranch(id, false));
      state.selectedLines.clear();
      console.log("Pinta: Copied to clipboard.");
    }
    return;
  } else if (ctrlCmd && event.key.toLowerCase() === "x") {
    if (isEditingText) {
      return;
    }
    event.preventDefault();
    if (state.selectedLines.size > 0) {
      state.clipboard = [];
      state.selectedLines.forEach((lineId) => {
        const branchCopy = getDeepCopyOfBranch(lineId, state.linesStore);
        if (branchCopy) {
          state.clipboard.push(branchCopy);
          deleteLineRecursive(lineId);
        }
      });
      state.selectedLines.forEach((id) => highlightBranch(id, false));
      state.isCutOperation = true;
      state.selectedLines.clear();
    }
    return;
  } else if (ctrlCmd && event.key.toLowerCase() === "v") {
    if (isModalActive) {
      return;
    }
    if (isEditingText) {
      return;
    }
    event.preventDefault();
    if (state.clipboard && state.hoveredLineIdForVisualColorChange) {
      const pasteeId = state.hoveredLineIdForVisualColorChange;
      const pasteeLine = state.linesStore[pasteeId];

      state.clipboard.forEach((branchRoot) => {
        const newBranchRoot = pasteBranch(
          branchRoot,
          pasteeId,
          state.linesStore,
        );
        pasteeLine.children.push(newBranchRoot.id);
      });

      const childCount = pasteeLine.children.length;
      pasteeLine.children.forEach((childId, index) => {
        const childLine = state.linesStore[childId];
        if (childLine) {
          childLine.offsetRatioOnParent = (index + 1) / (childCount + 1);
        }
      });

      updateChildrenPositions(pasteeId);
      if (state.isCutOperation) {
        state.clipboard = null;
      }
    }
    return;
  }

  if (deleteModal.style.display === "flex") {
    console.log(event.key);
    if (event.key === "Enter") {
      event.preventDefault();

      document.getElementById("confirmDeleteButton").click();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      document.getElementById("cancelDeleteButton").click();
      return;
    }
  }

  if (
    isEditingText &&
    !event.target.classList.contains("postit-content-area")
  ) {
    return;
  }
  if (ctrlCmd && event.key.toLowerCase() === "e") {
    event.preventDefault();
    exportToStaticHTML(loadedCSSText, loadedCSSIconoir);
    return;
  }
  if (ctrlCmd && event.key.toLowerCase() === "n") {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    event.preventDefault();
    event.stopPropagation();
    createNewDiagram();
    return;
  }
  if (event.key.toLowerCase() === "q" && !isEditingText && !isModalActive) {
    if (event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    document.body.classList.toggle("light-theme");

    if (document.body.classList.contains("light-theme")) {
      localStorage.setItem("pintaTheme", "light");
    } else {
      localStorage.setItem("pintaTheme", "dark");
    }
    return;
  }
  const isModalAlreadyOpen =
    deleteModal.style.display === "flex" ||
    state.linkModal?.style.display === "flex" ||
    (helpModal &&
      helpModal.style.display === "flex" &&
      event.key.toLowerCase() !== "?");

  if (
    event.key.toLowerCase() === "?" &&
    !isEditingText &&
    !isModalAlreadyOpen
  ) {
    event.preventDefault();
    showHelpModal();
    return;
  }
  // For closing with 'h' if it's already open
  if (
    event.key.toLowerCase() === "?" &&
    helpModal &&
    helpModal.style.display === "flex"
  ) {
    event.preventDefault();
    hideHelpModal();
    return;
  }

  // Ensure Escape key also closes the help modal
  if (event.key === "Escape") {
    if (state.clipboard && state.isCutOperation) {
      event.preventDefault();
      restoreClipboard();
      return;
    }
    if (helpModal && helpModal.style.display === "flex") {
      hideHelpModal();
    }
  }
  if (
    !isEditingText &&
    !isModalActive &&
    !state.hoveredLineIdForVisualColorChange
  ) {
    let toolSelected = false;
    if (event.key.toLowerCase() === "r") {
      state.currentDrawingTool = "rect";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "h") {
      state.currentDrawingTool = "highlight";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "a") {
      state.currentDrawingTool = "arrow";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "x") {
      state.currentDrawingTool = null;
      toolSelected = true;

      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null;
      }
      state.activeDrawingShape = null;
      if (state.drawingCanvas) {
        state.drawingCanvas.style.pointerEvents = "none";
        state.drawingCanvas.style.cursor = "default";
      }
      state.colorChangeModeActive = false;
    }

    if (toolSelected) {
      if (state.drawingCanvas) {
        state.drawingCanvas.style.pointerEvents = "auto";
        state.drawingCanvas.style.cursor = "crosshair";
      }
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null;
      }
      state.colorChangeModeActive = false;
    } else if (event.key.toLowerCase() === "escape") {
      state.currentDrawingTool = null;
      state.activeDrawingShape = null;
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null;
      }
      if (state.drawingCanvas) {
        state.drawingCanvas.style.pointerEvents = "none";
        state.drawingCanvas.style.cursor = "default";
      }
      state.colorChangeModeActive = false;
    } else if (
      event.key.toLowerCase() === "c" &&
      !state.currentDrawingTool &&
      !isEditingText &&
      !isModalActive &&
      !state.hoveredLineIdForTextColorChange
    ) {
      state.colorChangeModeActive = !state.colorChangeModeActive;
      console.log(
        "Color change mode:",
        state.colorChangeModeActive
          ? "ON (select shape, then color key)"
          : "OFF",
      );
    } else if (
      state.colorChangeModeActive &&
      drawingColorNames[event.key.toLowerCase()] &&
      !isEditingText &&
      !isModalActive
    ) {
      state.currentDrawingColorName =
        drawingColorNames[event.key.toLowerCase()];
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.setColor(state.currentDrawingColorName);
      }
      state.colorChangeModeActive = false;
    } else if (
      (event.key === "Backspace" || event.key === "Delete") &&
      state.selectedDrawingElement &&
      !isEditingText &&
      !isModalActive
    ) {
      handleDeleteItemClick({
        target: {
          dataset: {
            itemId: state.selectedDrawingElement.id,
            itemType: "drawing",
          },
        },
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    fetchAppStyles();
    try {
      fetchSelfManifest();
    } catch (e) {}
    helpModal = document.getElementById("helpModal");
    closeHelpModalButton = document.getElementById("closeHelpModalButton");
    if (closeHelpModalButton) {
      closeHelpModalButton.addEventListener("click", hideHelpModal);
    }

    // Optional: Click on overlay to close
    if (helpModal) {
      helpModal.addEventListener("click", (event) => {
        if (event.target === helpModal) {
          // Only if click is on the overlay itself
          hideHelpModal();
        }
      });
    }
    document.body.addEventListener("keydown", handleKeyDown);
    initializelinkModal();
    if (
      "launchQueue" in window &&
      typeof window.launchQueue.setConsumer === "function"
    ) {
      console.log("Pinta: Launch queue API is available.");
      window.launchQueue.setConsumer(async (launchParams) => {
        console.log("Async fetching launch queue data");
        try {
          await handleLaunchQueueFiles(launchParams);
          // After launch queue attempt, ensure diagram is initialized if nothing loaded
          if (
            !launchHandledByQueue ||
            (!Object.keys(state.linesStore || {}).length &&
              !Object.keys(state.postItsStore || {}).length)
          ) {
            console.info(
              "Nothing to be processed from the launch queue. Could be a failure",
            );
            await loadFromStorageOrInitDefault(); // Try IDB or default init
          }
        } catch (consumerError) {
          console.error(
            "Pinta: Error in launchQueue consumer's async execution flow:",
            consumerError,
          );
          // Critical failure in consumer, try to initialize default state
          if (
            !Object.keys(state.linesStore || {}).length &&
            !Object.keys(state.postItsStore || {}).length
          ) {
            try {
              init();
            } catch (initErr) {
              console.error(
                "Pinta: Fallback init after consumer error also failed:",
                initErr,
              );
            }
          }
        }
      });
    } else {
      console.log(
        "Pinta: Launch queue API not available. Loading from storage or default.",
      );
      await loadFromStorageOrInitDefault();
    }

    console.log(
      "Pinta DOMContentLoaded: Proceeding to loadFromStorageOrInitDefault.",
    );
    await loadFromStorageOrInitDefault();
  } catch (err) {
    console.error(
      "Pinta: Critical error during DOMContentLoaded initialization sequence:",
      err,
    );
    // Attempt a final fallback initialization if everything above failed
    if (
      !Object.keys(state.linesStore || {}).length &&
      !Object.keys(state.postItsStore || {}).length
    ) {
      try {
        console.log(
          "Pinta DOMContentLoaded: Critical error caught, attempting emergency fallback init.",
        );
        init();
      } catch (initError) {
        console.error(
          "Pinta: Emergency fallback init in DOMContentLoaded also failed:",
          initError,
        );
        if (editorContainer)
          editorContainer.innerHTML =
            "<h1>Pinta failed to start. Please check console.</h1>";
      }
    }
  }
  console.log("Pinta DOMContentLoaded: End - Pinta startup sequence complete.");
});

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const editorRect = editorContainer.getBoundingClientRect();
    if (editorRect.width === 0 || editorRect.height === 0) return;

    const mainLineId = Object.keys(state.linesStore).find(
      (id) => state.linesStore[id] && state.linesStore[id].parentId === null,
    );
    const mainLine = mainLineId ? state.linesStore[mainLineId] : null;

    Object.values(state.postItsStore).forEach((noteData) => {
      const el = document.getElementById(noteData.id);
      if (el) {
        if (
          mainLine &&
          noteData.offsetRatioOnMainLine !== undefined &&
          noteData.perpDistRatioFromMainLine !== undefined &&
          noteData.savedWidth !== undefined &&
          noteData.savedHeight !== undefined &&
          Math.abs(mainLine.length) > 1e-6
        ) {
          const cmLineStartX = mainLine.startX;
          const cmLineStartY = mainLine.startY;
          const cmLineAngleRad = mainLine.angle * (Math.PI / 180);
          const cmLineLength = mainLine.length;
          const distAlongCurrentMain =
            noteData.offsetRatioOnMainLine * cmLineLength;
          const perpDistFromCurrentMain =
            noteData.perpDistRatioFromMainLine * cmLineLength;
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
          el.style.left = `${targetCenterX - noteData.savedWidth / 2}px`;
          el.style.top = `${targetCenterY - noteData.savedHeight / 2}px`;
        } else if (
          noteData.xPercent !== undefined &&
          noteData.yPercent !== undefined
        ) {
          el.style.left = `${(noteData.xPercent / 100) * editorRect.width}px`;
          el.style.top = `${(noteData.yPercent / 100) * editorRect.height}px`;
        }
      }
    });

    Object.values(state.drawingElementsStore).forEach((shape) => {
      if (shape.toSaveData) {
        const saved = shape.toSaveData();
        if (!saved) return;

        let absoluteX, absoluteY, absoluteWidth, absoluteHeight;
        let x1, y1, x2, y2;

        if (shape.kind === "rect" || shape.kind === "highlight") {
          if (
            mainLine &&
            saved.xOffsetRatio !== undefined &&
            Math.abs(mainLine.length) > 1e-6
          ) {
            const cmLineStartX = mainLine.startX;
            const cmLineStartY = mainLine.startY;
            const cmLineAngleRad = mainLine.angle * (Math.PI / 180);
            const cmLineLength = mainLine.length;
            const cosA = Math.cos(cmLineAngleRad);
            const sinA = Math.sin(cmLineAngleRad);
            const perpDirX = -sinA;
            const perpDirY = cosA;

            const distAlongMain = saved.xOffsetRatio * cmLineLength;
            const perpDist = saved.yPerpDistRatio * cmLineLength;
            absoluteX =
              cmLineStartX + distAlongMain * cosA + perpDist * perpDirX;
            absoluteY =
              cmLineStartY + distAlongMain * sinA + perpDist * perpDirY;
            absoluteWidth = saved.widthRatio * Math.abs(cmLineLength);
            absoluteHeight = saved.heightRatio * Math.abs(cmLineLength);
          } else if (saved.xPercent !== undefined) {
            absoluteX = (saved.xPercent / 100) * editorRect.width;
            absoluteY = (saved.yPercent / 100) * editorRect.height;
            absoluteWidth = (saved.widthPercent / 100) * editorRect.width;
            absoluteHeight = (saved.heightPercent / 100) * editorRect.height;
          } else {
            return;
          }

          shape.x = absoluteX;
          shape.y = absoluteY;
          shape.width = absoluteWidth;
          shape.height = absoluteHeight;
          if (shape.element) {
            shape.element.setAttribute("x", shape.x);
            shape.element.setAttribute("y", shape.y);
            shape.element.setAttribute("width", shape.width);
            shape.element.setAttribute("height", shape.height);
          }
          if (typeof shape._applyRotation === "function") {
            shape._applyRotation();
          }
        } else if (shape.kind === "arrow") {
          if (
            mainLine &&
            saved.x1OffsetRatio !== undefined &&
            Math.abs(mainLine.length) > 1e-6
          ) {
            const cmLineStartX = mainLine.startX;
            const cmLineStartY = mainLine.startY;
            const cmLineAngleRad = mainLine.angle * (Math.PI / 180);
            const cmLineLength = mainLine.length;
            const cosA = Math.cos(cmLineAngleRad);
            const sinA = Math.sin(cmLineAngleRad);
            const perpDirX = -sinA;
            const perpDirY = cosA;

            const distAlongMain1 = saved.x1OffsetRatio * cmLineLength;
            const perpDist1 = saved.y1PerpDistRatio * cmLineLength;
            const pointOnMainLine1X = cmLineStartX + distAlongMain1 * cosA;
            const pointOnMainLine1Y = cmLineStartY + distAlongMain1 * sinA;
            x1 = pointOnMainLine1X + perpDist1 * perpDirX;
            y1 = pointOnMainLine1Y + perpDist1 * perpDirY;

            const distAlongMain2 = saved.x2OffsetRatio * cmLineLength;
            const perpDist2 = saved.y2PerpDistRatio * cmLineLength;
            const pointOnMainLine2X = cmLineStartX + distAlongMain2 * cosA;
            const pointOnMainLine2Y = cmLineStartY + distAlongMain2 * sinA;
            x2 = pointOnMainLine2X + perpDist2 * perpDirX;
            y2 = pointOnMainLine2Y + perpDist2 * perpDirY;
          } else if (saved.x1Percent !== undefined) {
            x1 = (saved.x1Percent / 100) * editorRect.width;
            y1 = (saved.y1Percent / 100) * editorRect.height;
            x2 = (saved.x2Percent / 100) * editorRect.width;
            y2 = (saved.y2Percent / 100) * editorRect.height;
          } else {
            return;
          }

          shape.x1 = x1;
          shape.y1 = y1;
          shape.x2 = x2;
          shape.y2 = y2;
          if (shape.element) {
            shape.element.setAttribute("x1", shape.x1);
            shape.element.setAttribute("y1", shape.y1);
            shape.element.setAttribute("x2", shape.x2);
            shape.element.setAttribute("y2", shape.y2);
          }
        }
      }
    });
  }, 100);
});

let drawingStartX, drawingStartY;

document.addEventListener(
  "mousemove",
  (e) => {
    state.lastMousePosition = { x: e.clientX, y: e.clientY };
  },
  { passive: true },
);

editorContainer.addEventListener("mousedown", (e) => {
  if (e.target !== editorContainer) return;
  if (state.activeTextEditElement) {
    state.activeTextEditElement.blur();
  }
  state.isSelecting = true;
  state.selectedLines.forEach((id) => highlightBranch(id, false));
  state.selectedLines.clear();
  e.preventDefault();
});

function isCursorOnLine(cursorEvent, lineId, editorRect) {
  const line = state.linesStore[lineId];
  if (!line) return false;

  const cursorX = cursorEvent.clientX - editorRect.left;
  const cursorY = cursorEvent.clientY - editorRect.top;

  const dx = cursorX - line.startX;
  const dy = cursorY - line.startY;

  const angle = getLineDisplayAngle(line.id, state.linesStore);
  const angleRad = -angle * (Math.PI / 180);

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const localX = dx * cosA - dy * sinA;
  const localY = dx * sinA + dy * cosA;

  // The CSS uses a transparent border to increase the clickable area.
  // We'll use a generous fixed padding to simulate this for easy selection.
  const hitPadding = 10; // 10px tolerance above and below the line's visual center.

  const isWithinX =
    localX >= Math.min(0, line.length) && localX <= Math.max(0, line.length);
  const isWithinY = Math.abs(localY) <= line.thickness / 2 + hitPadding;

  return isWithinX && isWithinY;
}

editorContainer.addEventListener("mousemove", (e) => {
  if (!state.isSelecting) return;
  const trailDot = document.createElement("div");
  trailDot.className = "selection-trail";
  const editorRect = editorContainer.getBoundingClientRect();
  trailDot.style.left = `${e.clientX - editorRect.left}px`;
  trailDot.style.top = `${e.clientY - editorRect.top}px`;
  editorContainer.appendChild(trailDot);

  setTimeout(() => {
    trailDot.remove();
  }, 1000); // Animation duration
  for (const lineId in state.linesStore) {
    if (isCursorOnLine(e, lineId, editorRect)) {
      const line = state.linesStore[lineId];
      if (line && line.parentId) {
        // Corrected Logic: Select the line that was actually hovered over.
        // The upward traversal has been removed.
        if (!state.selectedLines.has(lineId)) {
          state.selectedLines.add(lineId);
          // highlightBranch correctly highlights the line and all its children.
          highlightBranch(lineId, true);
        }
      }
    }
  }
});
editorContainer.addEventListener("mouseup", (e) => {
  state.isSelecting = false;
});
editorContainer.addEventListener("mouseleave", (e) => {
  state.isSelecting = false;
});
editorContainer.addEventListener("contextmenu", (event) => {
  const target = event.target;

  // Check if the right-clicked element is an image within our diagram
  if (target.tagName === "IMG" && target.classList.contains("inlined-image")) {
    // Prevent the default right-click menu
    //event.preventDefault();
    const wrapper = target.parentElement; // Get the wrapper
    const imageUrl = target.src;
    if (state.manuallyDownloadedUrls.has(imageUrl)) {
      // It's already marked, so un-mark it
      state.manuallyDownloadedUrls.delete(imageUrl);
      wrapper.classList.remove("pinta-image-downloaded");
      console.log(`Pinta: Marked ${imageUrl} as NOT downloaded.`);
    } else {
      // Mark it as downloaded
      state.manuallyDownloadedUrls.add(imageUrl);
      wrapper.classList.add("pinta-image-downloaded");
      console.log(`Pinta: Marked ${imageUrl} as downloaded.`);
    }
  }
});
document.addEventListener("mousedown", (event) => {
  if (
    state.drawingCanvas.style.pointerEvents !== "auto" &&
    !state.drawingCanvas.classList.contains("active-drawing") &&
    !state.drawingCanvas.classList.contains("tool-selected")
  ) {
    return;
  }

  const rect = state.drawingCanvas.getBoundingClientRect();
  const svgX = event.clientX - rect.left;
  const svgY = event.clientY - rect.top;

  if (!state.currentDrawingTool) {
    const targetElement = event.target.closest("rect, ellipse, line");
    if (
      targetElement &&
      targetElement.id &&
      state.drawingElementsStore[targetElement.id]
    ) {
      state.selectedDrawingElement?.deselect();
      state.selectedDrawingElement =
        state.drawingElementsStore[targetElement.id];
      state.selectedDrawingElement.select();
      state.selectedDrawingElement.dragInit(event.clientX, event.clientY);
      state.drawingCanvas.style.cursor = "grabbing";
    } else {
      state.selectedDrawingElement?.deselect();
      state.selectedDrawingElement = null;
      state.drawingCanvas.style.cursor = "default";
    }
    return;
  }

  drawingStartX = svgX;
  drawingStartY = svgY;

  if (
    state.currentDrawingTool === "rect" ||
    state.currentDrawingTool === "highlight"
  ) {
    state.activeDrawingShape = new Rect(
      drawingStartX,
      drawingStartY,
      state.currentDrawingColorName,
      state.drawingCanvas,
      state.currentDrawingTool,
    );
  } else if (state.currentDrawingTool === "arrow") {
    console.log("drawn arrow");
    state.activeDrawingShape = new Arrow(
      drawingStartX,
      drawingStartY,
      state.currentDrawingColorName,
      state.drawingCanvas,
    );
  }

  if (state.activeDrawingShape) {
    state.drawingElementsStore[state.activeDrawingShape.id] =
      state.activeDrawingShape;
    state.isDrawingModeActive = true;
  }
});

document.addEventListener("mousemove", (event) => {
  if (state.isDrawingModeActive && state.activeDrawingShape) {
    const rect = state.drawingCanvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    state.activeDrawingShape.updateShape(currentX, currentY);
  } else if (
    state.selectedDrawingElement &&
    state.selectedDrawingElement.isSelected &&
    event.buttons === 1
  ) {
    state.selectedDrawingElement.drag(event);
  }
});

document.addEventListener("mouseup", (event) => {
  if (state.isDrawingModeActive && state.activeDrawingShape) {
    if (
      state.activeDrawingShape._length &&
      state.activeDrawingShape._length() < 1
    ) {
      state.activeDrawingShape.delete();
      state.activeDrawingShape = null;
    } else {
      if (state.activeDrawingShape.toSaveData) {
        state.drawingElementsStore[state.activeDrawingShape.id].saveData =
          state.activeDrawingShape.toSaveData();
      }
    }

    state.activeDrawingShape = null;
    state.currentDrawingTool = null;
    state.drawingCanvas.classList.remove("active-drawing");
    state.drawingCanvas.style.pointerEvents = "none";
    state.drawingCanvas.style.cursor = "default";
  }
  if (state.selectedDrawingElement && event.button === 0) {
    state.selectedDrawingElement.dragOff();
    if (
      state.drawingElementsStore[state.selectedDrawingElement.id] &&
      state.drawingElementsStore[state.selectedDrawingElement.id].toSaveData
    ) {
      state.drawingElementsStore[state.selectedDrawingElement.id].saveData =
        state.drawingElementsStore[
          state.selectedDrawingElement.id
        ].toSaveData();
    }
    state.drawingCanvas.style.cursor = state.currentDrawingTool
      ? "crosshair"
      : "default";
  }
  state.isDrawingModeActive = false;
});

function handleCanvasKeydown(event) {
  // Do not interfere if a line is hovered, as it has its own keybindings
  if (
    state.hoveredLineIdForVisualColorChange ||
    isEditingLineText() ||
    state.hoveredLineIdForTextColorChange
  ) {
    return;
  }

  // Do not interfere when typing in an input/editable field
  const activeElement = document.activeElement;
  if (
    activeElement.isContentEditable ||
    activeElement.tagName === "INPUT" ||
    activeElement.tagName === "TEXTAREA"
  ) {
    return;
  }

  // Do not interfere with OS-level shortcuts
  if (event.metaKey || event.ctrlKey) {
    return;
  }

  const key = event.key;

  if (key === ",") {
    event.preventDefault();
    event.stopPropagation();
    decreaseAllLinesFontSize();
  } else if (key === ".") {
    // Check for '>' on the same key
    if (event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    increaseAllLinesFontSize();
  } else if (key === "=") {
    if (state.selectedLines && state.selectedLines.size > 0) {
      const selectedLineIds = Array.from(state.selectedLines);
      const sourceLineId = selectedLineIds[0];
      const sourceLine = state.linesStore[sourceLineId];

      if (sourceLine) {
        const { length, thickness } = sourceLine;
        selectedLineIds.forEach((id) => {
          const lineToUpdate = state.linesStore[id];
          if (lineToUpdate) {
            lineToUpdate.length = length;
            lineToUpdate.thickness = thickness;
            renderLine(lineToUpdate, { updating: true });
          }
        });
      }
    }
  }
}

function init() {
  editorContainer.innerHTML = "";
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
  state.activeTextEditElement = null;

  const containerRect = editorContainer.getBoundingClientRect();
  if (
    !editorContainer ||
    containerRect.width === 0 ||
    containerRect.height === 0
  ) {
    console.warn("Editor container not ready or has zero dimensions for init.");
    if (!editorContainer) {
      console.error("CRITICAL: editor-container not found in DOM for init.");
      return;
    }
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
  const mainLength = Math.sqrt(dx * dx + dy * dy);
  const mainAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  state.currentMainLineAngle = mainAngle;

  const mainLine = createLineObject({
    parentId: null,
    startX: p1x,
    startY: p1y,
    length: mainLength,
    angle: mainAngle,
    text: "...",
    thickness: MAIN_LINE_DEFAULT_THICKNESS,
    textPerpOffset: -15,
    color: "default",
  });
  renderLine(mainLine);

  if (editorContainer) {
    editorContainer.addEventListener("mouseenter", () => {
      document.addEventListener("keydown", handleCanvasKeydown);
    });

    editorContainer.addEventListener("mouseleave", () => {
      document.removeEventListener("keydown", handleCanvasKeydown);
    });
  }
}

async function createNewDiagram() {
  // Made exportable if called from elsewhere
  init(); // Re-initializes the Pinta diagram to a blank state
  await clearLastFileHandle(); // Clears the stored file handle from IndexedDB
  console.log("Pinta: New diagram created. Last file handle has been cleared.");
}

async function openExample(filePath = "./example.pnt") {
  // Default path
  console.log(`Pinta: Attempting to open example file: ${filePath}`);
  try {
    // It's good practice to clear any "last saved file" handle when loading an example,
    // so a subsequent "Save" acts like "Save As".
    if (typeof clearLastFileHandle === "function") {
      await clearLastFileHandle();
    } else {
      console.warn(
        "Pinta: clearLastFileHandle function not available for openExample.",
      );
    }

    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(
        `Network response was not ok: ${response.status} ${response.statusText} while fetching ${filePath}`,
      );
    }
    const fileContentJsonString = await response.text(); // This is the JSON string

    // Call Pinta's function that processes the diagram data string
    loadDataFromFile(fileContentJsonString); // Pass the string directly

    console.log(`Pinta: Example file ${filePath} loaded and processed.`);
  } catch (error) {
    console.error(
      `Pinta: Failed to open or process example file ${filePath}:`,
      error,
    );
    alert(
      `Failed to load the example diagram "${filePath.split("/").pop()}":\n${
        error.message
      }`,
    );
    // Optionally, initialize a blank diagram if example loading fails and the canvas is empty
    if (
      !Object.keys(state.linesStore || {}).length &&
      !Object.keys(state.postItsStore || {}).length
    ) {
      console.log(
        "Pinta: Example loading failed, initializing a new default diagram.",
      );
      init(); // Call your existing init function
    }
  }
}

const commands = [
  {
    title: "New",
    aliases: ["preferences", "configuration"],
    lambda: createNewDiagram,
  },
  {
    title: "Open main example",
    lambda: openExample,
  },
  {
    title: "Export to static HTML",
    lambda: () => exportToStaticHTML(loadedCSSText, loadedCSSIconoir),
  },
  {
    title: "Save as markdown",
    lambda: () => triggerSaveDiagram(/*asMarkdown=*/ true),
  },
  {
    title: "Version",
    lambda: () => {
      info.innerHTML = `v${version}`;
      info.classList.add("fades");
      setTimeout(() => {
        info.classList.remove("fades");
      }, 2500);
    },
  },
];

metaP.maxCommands = 10;
metaP.bind(commands);

/* Weird stuff with the extension */

window.addEventListener("pintaReceiveBase64", (event) => {
  const { originalUrl, dataUrl } = event.detail;

  console.log(`Received Base64 data for: ${originalUrl}`);

  if (!state.dataUrls) state.dataUrls = {};
  if (!state.dataUrlCounter) state.dataUrlCounter = 0;

  // Generate a new, unique key for the data URL
  const dataKey = `data-${++state.dataUrlCounter}`;

  console.log(JSON.stringify(state.dataUrls));

  // Store the base64 data and original URL for future reference
  state.dataUrls[dataKey] = {
    base64: dataUrl,
    originalUrl: originalUrl,
  };

  // Iterate through all lines to find and replace the URL in the source text.
  for (const lineId in state.linesStore) {
    const line = state.linesStore[lineId];
    console.log(originalUrl);
    console.log(line.text);
    if (line.text && line.text.includes(`!${originalUrl}!`)) {
      // Replace the URL with the new placeholder !data-N!
      line.text = line.text.replaceAll(`!${originalUrl}!`, `!${dataKey}!`);

      // Re-render the line to reflect the change
      console.log(line.text);
      renderLine(line, { updating: true });
    }
  }
  state.base64ImageCache.set(originalUrl, dataUrl);
});
