export {
  getLinkPrefix,
  setupTextDraggable,
  initializelinkModal,
  handleTextClick,
};
export const MAX_TEXT_PERP_OFFSET = 30;
export const DEFAULT_SCHEMA_TEXT_COLOR_VAR = "var(--theme-schema-text-color)";

import {
  state,
  editorContainer,
  LINK_SYMBOL_MAP,
  DEFAULT_LINK_SYMBOL,
} from "./state.js";

import {
  renderLine,
  getLineDisplayAngle,
  SCHEMA_LINE_VISUAL_COLORS,
} from "./lines.js";

function getLinkPrefix(url) {
  if (!url) return "";
  for (const mapping of LINK_SYMBOL_MAP) {
    if (mapping.regex.test(url)) {
      return mapping.symbol;
    }
  }
  return DEFAULT_LINK_SYMBOL;
}

function handleTextClick(e) {
  console.log(e.currentTarget);
  const textElementDiv = e.currentTarget;

  if (
    e.target.classList &&
    e.target.classList.contains("link-icon-clickable")
  ) {
    const urlToOpen = e.target.dataset.linkUrl;
    if (urlToOpen) {
      window.open(urlToOpen, "_blank", "noopener,noreferrer");
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }

  e.stopPropagation();

  const itemElement = textElementDiv.closest(".line-element-group");
  if (itemElement) {
    const rHandle = itemElement.querySelector(".resize-handle");
    const rdHandle = itemElement.querySelector(".root-drag-handle");
    const dHandle = itemElement.querySelector(".delete-handle");

    if (
      textElementDiv.classList.contains("dragging") ||
      (rHandle && rHandle.classList.contains("dragging")) ||
      (rdHandle && rdHandle.classList.contains("dragging")) ||
      (dHandle && dHandle.classList.contains("dragging"))
    ) {
      return;
    }
  }

  if (
    state.activeTextEditElement &&
    state.activeTextEditElement !== textElementDiv
  ) {
    state.activeTextEditElement.blur();
  }

  makeEditable(textElementDiv);
}

function setupTextDraggable(textElement, lineObject) {
  interact(textElement)
    .draggable({
      listeners: {
        start(event) {
          event.target.classList.add("dragging");
          if (state.activeTextEditElement === event.target) event.target.blur();
        },
        move(event) {
          const target = event.target;
          const lineId = target.dataset.lineId;
          const currentLine = state.linesStore[lineId];
          if (!currentLine) return;
          const absLineLength = Math.abs(currentLine.length);
          const displayAngle = getLineDisplayAngle(
            currentLine.id,
            state.linesStore,
          );
          const angleRad = (displayAngle * Math.PI) / 180;
          const cosA = Math.cos(angleRad);
          const sinA = Math.sin(angleRad);
          const groupFlipFactor = currentLine.length < 0 ? -1 : 1;
          const localDx = (event.dx * cosA + event.dy * sinA) * groupFlipFactor;
          const localDy = -event.dx * sinA + event.dy * cosA;
          if (absLineLength > 0) {
            currentLine.textPosRatio += localDx / absLineLength;
            currentLine.textPosRatio = Math.max(
              0,
              Math.min(1, currentLine.textPosRatio),
            );
          }
          currentLine.textPerpOffset += localDy;
          currentLine.textPerpOffset = Math.max(
            -MAX_TEXT_PERP_OFFSET,
            Math.min(MAX_TEXT_PERP_OFFSET, currentLine.textPerpOffset),
          );
          renderLine(currentLine, true);
        },
        end(event) {
          event.target.classList.remove("dragging");
        },
      },
      autoScroll: { container: editorContainer },
      inertia: false,
    })
    .styleCursor(false)
    .on("tap", function (event) {
      if (!event.target.classList.contains("dragging")) {
        const lineId = event.target.dataset.lineId;
        const lineGroup = document.getElementById(lineId);
        const rHandle = lineGroup?.querySelector(".resize-handle");
        const rdHandle = lineGroup?.querySelector(".root-drag-handle");
        const dHandle = lineGroup?.querySelector(".delete-handle");
        if (
          (rHandle && rHandle.classList.contains("dragging")) ||
          (rdHandle && rdHandle.classList.contains("dragging")) ||
          (dHandle && dHandle.classList.contains("dragging"))
        )
          return;
        if (
          state.activeTextEditElement &&
          state.activeTextEditElement !== event.target
        )
          state.activeTextEditElement.blur();
        makeEditable(event.target);
      }
      event.preventDefault();
      event.stopPropagation();
    });
}

function makeEditable(textEl) {
  if (textEl.isContentEditable || textEl.classList.contains("dragging")) return;
  state.activeTextEditElement = textEl;

  const itemId = textEl.dataset.lineId || textEl.closest(".post-it")?.id;
  const itemType = textEl.classList.contains("line-text")
    ? "line"
    : textEl.classList.contains("postit-content-area")
      ? "postit"
      : null;

  if (itemType === "line" && state.linesStore[itemId]) {
    textEl.textContent = state.linesStore[itemId].text || "...";
  }

  textEl.contentEditable = "true";
  textEl.style.cursor = "auto";
  textEl.focus();

  const isLineText = textEl.classList.contains("line-text");
  const isShortText = textEl.textContent.trim().length < 4;

  if (!isLineText || (isLineText && isShortText)) {
    if (
      itemType === "postit" ||
      (itemType === "line" && state.linesStore[itemId])
    ) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  const onBlur = () => {
    if (
      state.isWaitingForColorKey &&
      state.targetLineIdForTextColorChange === itemId
    ) {
      state.isWaitingForColorKey = false;
      state.targetLineIdForTextColorChange = null;
      // If you added a visual cue like an outline, remove it:
      // textEl.style.outline = "";
    }
    textEl.contentEditable = "false";
    textEl.style.cursor = textEl.classList.contains("line-text")
      ? "grab"
      : "text";
    if (itemId && itemType === "line" && state.linesStore[itemId]) {
      state.linesStore[itemId].text = textEl.textContent;

      renderLine(state.linesStore[itemId], true);
    } else if (itemId && itemType === "postit" && state.postItsStore[itemId]) {
      state.postItsStore[itemId].content = textEl.innerHTML;
    }
    textEl.removeEventListener("blur", onBlur);
    textEl.removeEventListener("keydown", onKeydown);
    state.activeTextEditElement = null;
  };

  const onKeydown = (e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    if (itemType === "line") {
      const lineId = itemId;
      const currentLine = state.linesStore[lineId];
      if (isCtrlOrCmd && e.key.toLowerCase() === "g") {
        e.preventDefault();
        e.stopPropagation();
        state.isWaitingForColorKey = true;
        state.targetLineIdForTextColorChange = lineId;
        return; // Entered color mode, wait for next key
      }
      if (
        state.isWaitingForColorKey &&
        state.targetLineIdForTextColorChange === lineId
      ) {
        e.stopPropagation(); // Important to prevent other actions while in this "mode"
        const keyPressed = e.key.toLowerCase();

        // Check if the pressed key is a defined color shortcut
        if (
          SCHEMA_LINE_VISUAL_COLORS &&
          SCHEMA_LINE_VISUAL_COLORS[keyPressed]
        ) {
          e.preventDefault();
          if (currentLine) {
            const newColorName = SCHEMA_LINE_VISUAL_COLORS[keyPressed];
            currentLine.textColor = newColorName;
            textEl.style.color =
              newColorName === "default"
                ? DEFAULT_SCHEMA_TEXT_COLOR_VAR
                : `var(--${newColorName})`;
            // Visual cue can be removed here if one was added
            // textEl.style.outline = "";
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          // console.log("Text color change cancelled by Escape.");
          // Visual cue can be removed here
          // textEl.style.outline = "";
        } else {
          // Any other key pressed cancels the mode.
          // Optionally, you could choose to only let Escape cancel, and ignore other keys.
          // But cancelling on any other key press is often more user-friendly.
          e.preventDefault(); // Prevent the default action of the unexpected key
          // console.log("Text color change cancelled by other key.");
          // Visual cue can be removed here
          // textEl.style.outline = "";
        }

        // Reset the waiting state regardless of what key (color, Escape, other) was pressed
        state.isWaitingForColorKey = false;
        state.targetLineIdForTextColorChange = null;
        return; // Exit onKeydown after handling the modal key press
      }
      if (e.ctrlKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          textEl.blur();
          showlinkModal(lineId);
          return;
        }
        if (e.key === "," || e.key === "<") {
          e.preventDefault();
          let newSize = (currentLine.fontSize || 16) - 2;
          if (newSize < 4) newSize = 4;
          currentLine.fontSize = newSize;
          textEl.style.fontSize = `${newSize}px`;
        } else if (e.key === "." || e.key === ">") {
          e.preventDefault();
          let newSize = (currentLine.fontSize || 16) + 2;
          currentLine.fontSize = newSize;
          textEl.style.fontSize = `${newSize}px`;
        } else if (e.key.toLowerCase() === "b" && e.shiftKey) {
          e.preventDefault();
          currentLine.isBold = !currentLine.isBold;
          textEl.style.fontWeight = currentLine.isBold ? "bold" : "normal";
        } else if (e.key.toLowerCase() === "c" && e.shiftKey) {
          e.preventDefault();
          currentLine.isCentered = !currentLine.isCentered;
          textEl.style.textAlign = currentLine.isCentered ? "center" : "left";
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey && itemType === "line") {
      e.preventDefault();
      textEl.blur();
    } else if (e.key === "Escape") {
      if (itemId && itemType === "line" && state.linesStore[itemId]) {
        textEl.textContent = state.linesStore[itemId].text;
        textEl.style.fontSize = `${state.linesStore[itemId].fontSize || 16}px`;
        textEl.style.fontWeight = state.linesStore[itemId].isBold
          ? "bold"
          : "normal";
        textEl.style.textAlign = state.linesStore[itemId].isCentered
          ? "center"
          : "left";
      } else if (
        itemId &&
        itemType === "postit" &&
        state.postItsStore[itemId]
      ) {
        textEl.innerHTML = state.postItsStore[itemId].content;
      }
      textEl.blur();
    }
  };

  textEl.addEventListener("blur", onBlur);
  textEl.addEventListener("keydown", onKeydown);
}

function initializelinkModal() {
  state.linkModal = document.getElementById("linkModal");
  state.linkUrlInput = document.getElementById("linkUrlInput");
  state.saveLinkButton = document.getElementById("saveLinkButton");
  state.removeLinkButton = document.getElementById("removeLinkButton");
  state.cancelLinkModalButton = document.getElementById(
    "cancelLinkModalButton",
  );

  state.saveLinkButton.onclick = () => {
    if (
      state.currentLineEditIdForModal &&
      state.linesStore[state.currentLineEditIdForModal]
    ) {
      const newUrl = state.linkUrlInput.value.trim();
      state.linesStore[state.currentLineEditIdForModal].linkUrl = newUrl
        ? newUrl
        : null;
      renderLine(state.linesStore[state.currentLineEditIdForModal], true);
    }
    hidelinkModal();
  };

  state.removeLinkButton.onclick = () => {
    if (
      state.currentLineEditIdForModal &&
      state.linesStore[state.currentLineEditIdForModal]
    ) {
      state.linesStore[state.currentLineEditIdForModal].linkUrl = null;
      renderLine(state.linesStore[state.currentLineEditIdForModal], true);
    }
    hidelinkModal();
  };

  state.cancelLinkModalButton.onclick = hidelinkModal;

  state.linkUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.saveLinkButton.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hidelinkModal();
    }
  });
}

function showlinkModal(lineId) {
  state.currentLineEditIdForModal = lineId;
  const line = state.linesStore[lineId];
  if (line) {
    state.linkUrlInput.value = line.linkUrl || "";
    state.removeLinkButton.style.display = line.linkUrl
      ? "inline-block"
      : "none";
    state.linkModal.style.display = "flex";
    state.linkUrlInput.focus();
    state.linkUrlInput.select();
  }
}

function hidelinkModal() {
  state.linkModal.style.display = "none";
  state.currentLineEditIdForModal = null;
}
