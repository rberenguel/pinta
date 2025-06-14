export const state = {
  // Data Stores
  linesStore: {},
  currentMainLineAngle: 0,
  hoveredLineIdForVisualColorChange: null,
  hoveredLineIdForTextColorChange: null,
  isWaitingForColorKey: false,
  postItsStore: {},
  drawingElementsStore: {},
  selectedLines: new Set(),
  selectedDrawings: new Set(),
  clipboard: null,
  isCutOperation: false,
  manuallyDownloadedUrls: new Set(),
  base64ImageCache: new Map(),

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

export const POSTIT_DEFAULT_COLOR = "yellow";
export const POSTIT_VALID_COLORS = [
  "yellow",
  "red",
  "green",
  "blue",
  "white",
  "transp-0",
  "transp-1",
  "transp-2",
];

export const drawingColorNames = {
  b: "blue",
  c: "cyan",
  g: "green",
  k: "black",
  m: "magenta",
  o: "orange",
  r: "red",
  v: "violet",
  w: "white",
  y: "yellow",
};

export const SCHEMA_LINE_COLORS = {
  r: "red", // Will use var(--red)
  y: "yellow", // Will use var(--yellow)
  b: "blue", // Will use var(--blue)
  d: "default", // Special value for theme default
};

export const DEFAULT_LINE_VISUAL_COLOR = "var(--theme-schema-line-color)";

export const LINK_SYMBOL_MAP = [
  {
    regex: /.*docs\.google\..*/i,
    symbol: `<div class="iconoir-multiple-pages-empty"></div>`,
  },
  {
    regex: /.*slides\.google\..*/i,
    symbol: `<div class="iconoir-presentation"></div>`,
  },
  {
    regex: /.*sheets.google\.com.*/i,
    symbol: `<div class="iconoir-calculator"></div>`,
  },
  {
    regex: /.*github\.com.*/i,
    symbol: `<div class="iconoir-github-circle"></div>`,
  },
  {
    regex: /.*wikipedia\..*/i,
    symbol: `<div class="iconoir-globe"></div>`,
  },
  { regex: /.*youtube\.com.*/i, symbol: `<div class="iconoir-youtube"></div>` },
  { regex: /.*arxiv\.org.*/i, symbol: `<div class="iconoir-flask"></div>` },
];
export const DEFAULT_LINK_SYMBOL = `<div class="iconoir-link"></div>`;

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

export function cleanupUnusedDataUrls() {
  if (!state.dataUrls || Object.keys(state.dataUrls).length === 0) {
    return; // Nothing to clean up.
  }

  // 1. Find all data-N keys that are actually used in the lines.
  const allLineTexts = Object.values(state.linesStore)
    .map((line) => line.text || "")
    .join(" ");
  const usedKeys = new Set();
  const dataUrlRegex = /!(data-\d+)!/g;
  let match;
  while ((match = dataUrlRegex.exec(allLineTexts)) !== null) {
    usedKeys.add(match[1]);
  }

  // 2. Iterate over the stored keys and delete any that are not in the 'used' set.
  let removedCount = 0;
  for (const storedKey in state.dataUrls) {
    if (!usedKeys.has(storedKey)) {
      delete state.dataUrls[storedKey];
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(`Pinta: Cleaned up ${removedCount} unused data URLs.`);
  }
}
