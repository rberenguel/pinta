export { handleDeleteItemClick };

import {
  state,
  deleteModal,
  deleteModalMessage,
  confirmDeleteButton,
  cancelDeleteButton,
} from "./state.js";

import { deleteDrawingElement } from "./drawing.js";
import { deletePostIt } from "./postit.js";
import { deleteLineRecursive } from "./lines.js";

function handleDeleteItemClick(event) {
  state.itemToDeleteId = event.target.dataset.itemId;
  state.itemTypeToDelete = event.target.dataset.itemType;
  let itemName = "this item";
  let descendantCount = 0;
  if (state.itemTypeToDelete === "line") {
    const line = state.linesStore[state.itemToDeleteId];
    if (!line) return;
    itemName = `the line "${line.text || "untitled"}"`;
    descendantCount = getDescendantIds(state.itemToDeleteId).length;
  } else if (state.itemTypeToDelete === "postit") {
    const postIt = state.postItsStore[state.itemToDeleteId];
    if (!postIt) return;
    itemName = `the note "${postIt.title || "untitled"}"`;
  } else if (state.itemTypeToDelete === "drawing") {
    const drawing = state.drawingElementsStore[state.itemToDeleteId];
    if (!drawing) return;
    itemName = `the drawing (${drawing.kind})`;
  } else return;
  let message = `Are you sure you want to delete ${itemName}?`;
  if (descendantCount > 0)
    message += ` This will also delete ${descendantCount} child line(s).`;
  message += " This action cannot be undone.";
  deleteModalMessage.textContent = message;
  deleteModal.style.display = "flex";
  // Get out of drawing modes
  state.currentDrawingTool = null;
  state.activeDrawingShape = null;
  state.selectedDrawingElement?.deselect();
  state.selectedDrawingElement = null;
  state.drawingCanvas.style.pointerEvents = "none";
  state.drawingCanvas.style.cursor = "default";
  state.colorChangeModeActive = false;
}
confirmDeleteButton.onclick = () => {
  if (state.itemToDeleteId && state.itemTypeToDelete === "line")
    deleteLineRecursive(state.itemToDeleteId);
  else if (state.itemToDeleteId && state.itemTypeToDelete === "postit")
    deletePostIt(state.itemToDeleteId);
  else if (state.itemToDeleteId && state.itemTypeToDelete === "drawing")
    deleteDrawingElement(state.itemToDeleteId);
  state.itemToDeleteId = null;
  state.itemTypeToDelete = "";
  deleteModal.style.display = "none";
};
cancelDeleteButton.onclick = () => {
  state.itemToDeleteId = null;
  state.itemTypeToDelete = "";
  deleteModal.style.display = "none";
};

function getDescendantIds(lineId, visited = new Set()) {
  if (visited.has(lineId)) return [];
  visited.add(lineId);
  const line = state.linesStore[lineId];
  if (!line || !line.children || line.children.length === 0) return [];
  let descendants = [...line.children];
  line.children.forEach((childId) => {
    descendants = descendants.concat(getDescendantIds(childId, visited));
  });
  return descendants;
}
