export { showInfoHover, hideInfoHover };
import { state } from "./state.js";

function showInfoHover(text) {
  const infoHover = document.getElementById("info-hover");
  if (infoHover) {
    const editorContainer = document.getElementById("editor-container");
    const editorRect = editorContainer.getBoundingClientRect();
    infoHover.textContent = text;
    infoHover.classList.add("visible");
    infoHover.style.left = `${state.lastMousePosition.x - editorRect.left + 15}px`;
    infoHover.style.top = `${state.lastMousePosition.y - editorRect.top - 30}px`;
  }
}

function hideInfoHover() {
  const infoHover = document.getElementById("info-hover");
  if (infoHover) {
    infoHover.classList.remove("visible");
  }
}
