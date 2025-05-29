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

import {
  triggerSaveDiagram,
  triggerLoadDiagram,
  loadDataFromFile,
  exportToStaticHTML,
} from "./js/files.js";
import {
  createLineObject,
  renderLine,
  MAIN_LINE_DEFAULT_THICKNESS,
} from "./js/lines.js";

import { handleDeleteItemClick } from "./js/delete.js";

let helpModal;
let closeHelpModalButton;

let loadedCSSText = "";

async function fetchAppStyles() {
  try {
    const response = await fetch("./style.css"); // Assumes style.css is in the same directory as index.html
    if (response.ok) {
      loadedCSSText = await response.text();
      console.log("App styles fetched for export.");
    } else {
      console.error(
        "Failed to fetch style.css for export:",
        response.statusText,
      );
    }
  } catch (error) {
    console.error("Error fetching style.css for export:", error);
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

  if (ctrlCmd && event.key.toLowerCase() === "s") {
    event.preventDefault();
    triggerSaveDiagram();
    return;
  } else if (ctrlCmd && event.key.toLowerCase() === "o") {
    event.preventDefault();
    triggerLoadDiagram();
    return;
  }

  const isModalActive =
    deleteModal.style.display === "flex" ||
    state.linkModal?.style.display === "flex";

  if (
    isEditingText &&
    !event.target.classList.contains("postit-content-area")
  ) {
    return;
  }
  if (ctrlCmd && event.key.toLowerCase() === "e") {
    event.preventDefault();
    exportToStaticHTML(loadedCSSText);
    return;
  }
  if (event.key.toLowerCase() === "q" && !isEditingText && !isModalActive) {
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
    // ... (existing logic for other modals/tools) ...
    if (helpModal && helpModal.style.display === "flex") {
      hideHelpModal();
    }
  }
  if (!isEditingText && !isModalActive) {
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
    } else if (event.key.toLowerCase() === "s") {
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
      !isModalActive
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
document.addEventListener("DOMContentLoaded", () => {
  fetchAppStyles();
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
  init();
});

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  Object.values(state.postItsStore).forEach((noteData) => {
    const el = document.getElementById(noteData.id);
    if (el) {
      const editorRect = editorContainer.getBoundingClientRect();
      if (editorRect.width > 0)
        el.style.left = `${(noteData.xPercent / 100) * editorRect.width}px`;
      if (editorRect.height > 0)
        el.style.top = `${(noteData.yPercent / 100) * editorRect.height}px`;
    }
  });

  Object.values(state.drawingElementsStore).forEach((shape) => {
    if (shape.toSaveData) {
      const saved = shape.toSaveData();
      if (!saved) return;
      const editorRect = editorContainer.getBoundingClientRect();
      if (editorRect.width === 0 || editorRect.height === 0) return;

      if (shape.kind === "rect" || shape.kind === "highlight") {
        shape.x = (saved.xPercent / 100) * editorRect.width;
        shape.y = (saved.yPercent / 100) * editorRect.height;
        shape.width = (saved.widthPercent / 100) * editorRect.width;
        shape.height = (saved.heightPercent / 100) * editorRect.height;
        shape.element.setAttribute("x", shape.x);
        shape.element.setAttribute("y", shape.y);
        shape.element.setAttribute("width", shape.width);
        shape.element.setAttribute("height", shape.height);
      } else if (shape.kind === "arrow") {
        shape.x1 = (saved.x1Percent / 100) * editorRect.width;
        shape.y1 = (saved.y1Percent / 100) * editorRect.height;
        shape.x2 = (saved.x2Percent / 100) * editorRect.width;
        shape.y2 = (saved.y2Percent / 100) * editorRect.height;
        shape.element.setAttribute("x1", shape.x1);
        shape.element.setAttribute("y1", shape.y1);
        shape.element.setAttribute("x2", shape.x2);
        shape.element.setAttribute("y2", shape.y2);
      }
    }
  });
});

let drawingStartX, drawingStartY;
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

  const mainLine = createLineObject({
    parentId: null,
    startX: p1x,
    startY: p1y,
    length: mainLength,
    angle: mainAngle,
    text: "...",
    thickness: MAIN_LINE_DEFAULT_THICKNESS,
    textPerpOffset: -15,
    color: "var(--theme-schema-line-color)",
  });
  renderLine(mainLine);
}
