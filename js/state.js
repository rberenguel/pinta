export const state = {
  // Data Stores
  linesStore: {},
  postItsStore: {},
  drawingElementsStore: {},

  // Counters
  lineIdCounter: 0,
  postItIdCounter: 0,
  drawingElementIdCounter: 0,

  // Mutable UI/Interaction State Variables
  activeTextEditElement: null,
  itemToDeleteId: null,
  itemTypeToDelete: "", // Initialized to an empty string
  currentDrawingTool: null,
  currentDrawingColorName: "red", // Default value
  activeDrawingShape: null,
  selectedDrawingElement: null,
  isDrawingModeActive: false,
  colorChangeModeActive: false,
  currentLineEditIdForModal: null,
  drawingStartX: 0,
  drawingStartY: 0,

  // DOM references that are assigned/reassigned by pinta.js logic
  // These will be initialized to null here and populated by pinta.js
  // (e.g., in init(), loadDataFromFile(), initializeLinkModal()).
  drawingCanvas: null,
  linkModal: null,
  linkUrlInput: null,
  saveLinkButton: null,
  removeLinkButton: null,
  cancelLinkModalButton: null,

  // Drawing state
  currentDrawingTool: null,
  currentDrawingColorName: "red",
  activeDrawingShape: null,
  selectedDrawingElement: null,
  isDrawingModeActive: false,
  colorChangeModeActive: false,
};

export const SVG_NS = "http://www.w3.org/2000/svg";
export const MAX_TEXT_PERP_OFFSET = 30;
export const DELETE_BUTTON_PERP_OFFSET = 0;
export const MAIN_LINE_DEFAULT_THICKNESS = 4;
export const CHILD_LINE_DEFAULT_THICKNESS = 2;
export const POSTIT_DEFAULT_COLOR = "yellow";
export const POSTIT_VALID_COLORS = [
  "yellow",
  "red",
  "green",
  "blue",
  "white",
  "transp",
];

export const drawingColorNames = {
  r: "red",
  o: "orange",
  y: "yellow",
  g: "green",
  c: "cyan",
  b: "blue",
  v: "violet",
  m: "magenta",
};

export const LINK_SYMBOL_MAP = [
  { regex: /.*docs\.google\..*/i, symbol: "📜 " },
  { regex: /.*github\.com\..*/i, symbol: "📦 " },
];
export const DEFAULT_LINK_SYMBOL = "🔗 ";

// --- Stable DOM Element References --- (Moved from pinta.js)
// These are fetched once when this module loads and their references don't change.
export const editorContainer = document.getElementById("editor-container");
export const deleteModal = document.getElementById("deleteConfirmationModal");
export const deleteModalMessage = document.getElementById("deleteModalMessage");
export const confirmDeleteButton = document.getElementById(
  "confirmDeleteButton",
);
export const cancelDeleteButton = document.getElementById("cancelDeleteButton");
export const filePicker = document.getElementById("filePicker");

export { resetDrawing };

const resetDrawing = (st) => {
  st.currentDrawingTool = null;
  st.activeDrawingShape = null;
  st.selectedDrawingElement?.deselect();
  st.selectedDrawingElement = null;
  st.drawingCanvas.style.pointerEvents = "none";
  st.drawingCanvas.style.cursor = "default";
  st.colorChangeModeActive = false;
};
