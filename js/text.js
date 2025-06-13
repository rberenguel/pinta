export {
  getLinkPrefix,
  setupTextDraggable,
  initializelinkModal,
  handleTextClick,
};
export const MAX_TEXT_PERP_OFFSET = 60;
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
  showLinkInIframe,
} from "./lines.js";

let previewIframe = null,
  previewWrapper = null;
let PREVIEW_IFRAME_WIDTH;
let PREVIEW_IFRAME_HEIGHT;

function getLinkPrefix(url) {
  if (!url) return "";
  for (const mapping of LINK_SYMBOL_MAP) {
    if (mapping.regex.test(url)) {
      return mapping.symbol;
    }
  }
  return DEFAULT_LINK_SYMBOL;
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
  if (
    !state.hoveredLineIdForTextColorChange ||
    state.activeTextEditElement ||
    (isCtrlOrCmd && key != "k")
  ) {
    return;
  }

  const lineId = state.hoveredLineIdForTextColorChange;
  const lineToUpdate = state.linesStore[lineId];
  if (!lineToUpdate) return;
  if (key === "/") {
    console.log("updating text display length");
    event.preventDefault();
    event.stopPropagation();
    const currentText = lineToUpdate.text || "";
    if (!lineToUpdate.textRenderLength) {
      lineToUpdate.textRenderLength = currentText.length;
    }
    lineToUpdate.textRenderLength = Math.max(
      1,
      lineToUpdate.textRenderLength - 5,
    );
    renderLine(lineToUpdate, { updating: true });
    return;
  }

  if (key === "*") {
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate.textRenderLength !== null) {
      const currentText = lineToUpdate.text || "";
      lineToUpdate.textRenderLength += 5;
      if (lineToUpdate.textRenderLength >= currentText.length) {
        lineToUpdate.textRenderLength = null;
      }
      renderLine(lineToUpdate, { updating: true });
    }
    return;
  }

  if (
    SCHEMA_LINE_VISUAL_COLORS[key] &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (lineToUpdate) {
      const newColorName = SCHEMA_LINE_VISUAL_COLORS[key];
      lineToUpdate.textColor = newColorName;
      renderLine(lineToUpdate, { updating: true });
    }
  }

  if (key === "," || key === "<") {
    event.preventDefault();
    let newSize = (lineToUpdate.fontSize || 16) - 2;
    if (newSize < 4) newSize = 4;
    lineToUpdate.fontSize = newSize;
    renderLine(lineToUpdate, { updating: true });
  } else if (key === "." || key === ">") {
    event.preventDefault();
    let newSize = (lineToUpdate.fontSize || 16) + 2;
    lineToUpdate.fontSize = newSize;
    renderLine(lineToUpdate, { updating: true });
  } else if (key.toLowerCase() === "b" && event.shiftKey) {
    event.preventDefault();
    lineToUpdate.isBold = !lineToUpdate.isBold;
    renderLine(lineToUpdate, { updating: true });
  } else if (key.toLowerCase() === "c" && event.shiftKey) {
    event.preventDefault();
    lineToUpdate.isCentered = !lineToUpdate.isCentered;
    renderLine(lineToUpdate, { updating: true });
  } else if (key.toLowerCase() === "k" && isCtrlOrCmd) {
    event.preventDefault();
    showlinkModal(lineId);
    return;
  } else if (key.toLowerCase() === "=") {
    event.preventDefault();
    const siblings = state.linesStore[lineToUpdate.parentId].children.filter(
      (c) => c !== lineToUpdate.id,
    );
    if (siblings.length > 0) {
      const siblingToCopyFrom = state.linesStore[siblings[0]];
      if (siblingToCopyFrom) {
        lineToUpdate.fontSize = siblingToCopyFrom.fontSize;
        lineToUpdate.textPosRatio = siblingToCopyFrom.textPosRatio;
        lineToUpdate.textPerpOffset = siblingToCopyFrom.textPerpOffset;
        lineToUpdate.isCentered = siblingToCopyFrom.isCentered;
        renderLine(lineToUpdate, { updating: true });
      }
    }
  }
}

function handleTextMouseEnter(event) {
  const lineId = event.target.dataset.lineId;
  if (lineId) {
    state.hoveredLineIdForTextColorChange = lineId;
    document.addEventListener("keydown", handleKeydown);
  }
}

function handleTextMouseLeave(event) {
  state.hoveredLineIdForTextColorChange = null;
  document.removeEventListener("keydown", handleKeydown);
}

function handleTextClick(e) {
  const textElementDiv = e.currentTarget;
  if (
    e.target.closest("SPAN")?.classList &&
    e.target.closest("SPAN").classList.contains("link-icon-clickable")
  ) {
    const urlToOpen = e.target.closest("SPAN").dataset.linkUrl;
    if (urlToOpen && !e.shiftKey) {
      window.open(urlToOpen, "_blank", "noopener,noreferrer");

      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (urlToOpen && e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      textElementDiv.style.cursor = textElementDiv.classList.contains(
        "line-text",
      )
        ? "grab"
        : "auto";
      showLinkInIframe(urlToOpen);

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
  textElement.addEventListener("mouseenter", handleTextMouseEnter);
  textElement.addEventListener("mouseleave", handleTextMouseLeave);

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
          renderLine(currentLine, {
            updating: true,
            moving: true,
            fromText: true,
          });
        },
        end(event) {
          event.target.classList.remove("dragging");
          const target = event.target;
          const lineId = target.dataset.lineId;
          const currentLine = state.linesStore[lineId];
          renderLine(currentLine, {
            updating: true,
            moving: false,
            fromText: true,
          });
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
  if (textEl.classList && textEl.classList[0]?.startsWith("iconoir")) {
    return;
  }
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
    textEl.contentEditable = "false";
    textEl.style.cursor = textEl.classList.contains("line-text")
      ? "grab"
      : "auto";
    if (itemId && itemType === "line" && state.linesStore[itemId]) {
      state.linesStore[itemId].text = textEl.textContent;
      renderLine(state.linesStore[itemId], { updating: true });
    } else if (itemId && itemType === "postit" && state.postItsStore[itemId]) {
      state.postItsStore[itemId].content = textEl.innerHTML;
    }
    textEl.removeEventListener("blur", onBlur);
    textEl.removeEventListener("keydown", onKeydown);
    state.activeTextEditElement = null;
  };

  const onKeydown = (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
    if (itemType === "line") {
      const lineId = itemId;
      const currentLine = state.linesStore[lineId];
      if (isCtrlOrCmd) {
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
  PREVIEW_IFRAME_WIDTH = 1000;
  PREVIEW_IFRAME_HEIGHT = 800;
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
      renderLine(state.linesStore[state.currentLineEditIdForModal], {
        updating: true,
      });
    }
    hidelinkModal();
  };

  state.removeLinkButton.onclick = () => {
    if (
      state.currentLineEditIdForModal &&
      state.linesStore[state.currentLineEditIdForModal]
    ) {
      state.linesStore[state.currentLineEditIdForModal].linkUrl = null;
      renderLine(state.linesStore[state.currentLineEditIdForModal], {
        updating: true,
      });
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

  let currentHoveredLink = null;
  editorContainer.addEventListener("mouseover", (event) => {
    const linkIcon = event.target.closest(".link-icon-clickable");
    if (linkIcon) {
      currentHoveredLink = linkIcon;
      if (event.shiftKey) {
        showPreview(linkIcon.dataset.linkUrl);
      }
    }
  });

  editorContainer.addEventListener("mouseout", (event) => {
    const linkIcon = event.target.closest(".link-icon-clickable");
    if (linkIcon && !linkIcon.contains(event.relatedTarget)) {
      currentHoveredLink = null;
      hidePreview();
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

function createPreviewIframe() {
  if (previewWrapper) return;

  previewWrapper = document.createElement("div");
  previewWrapper.className = "link-preview-iframe-wrapper";

  previewIframe = document.createElement("iframe");
  previewIframe.className = "link-preview-iframe";
  previewIframe.sandbox =
    "allow-scripts allow-forms allow-popups allow-same-origin";

  // Set the iframe to a fixed, large resolution
  previewIframe.width = PREVIEW_IFRAME_WIDTH;
  previewIframe.height = PREVIEW_IFRAME_HEIGHT;

  previewWrapper.appendChild(previewIframe);
  editorContainer.appendChild(previewWrapper);
}

function showPreview(url) {
  createPreviewIframe();
  const vh = window.outerHeight / 100;
  const scale = Math.max(
    (vh * 30) / PREVIEW_IFRAME_WIDTH,
    (vh * 15) / PREVIEW_IFRAME_HEIGHT,
  );

  // Apply the scale transformation to the iframe
  previewIframe.style.transform = `scale(${scale})`;

  previewIframe.src = url;
  previewWrapper.style.display = "block"; // Use flex to show and center
}

function hidePreview() {
  if (previewWrapper) {
    previewWrapper.style.display = "none";
    previewIframe.src = "about:blank";
  }
}
