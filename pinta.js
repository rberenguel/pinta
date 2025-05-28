import {
  state, // The main mutable state object
  SVG_NS,
  MAX_TEXT_PERP_OFFSET,
  DELETE_BUTTON_PERP_OFFSET,
  MAIN_LINE_DEFAULT_THICKNESS,
  CHILD_LINE_DEFAULT_THICKNESS,
  POSTIT_DEFAULT_COLOR,
  POSTIT_VALID_COLORS,
  drawingColorNames,
  editorContainer,
  deleteModal,
  deleteModalMessage,
  confirmDeleteButton,
  cancelDeleteButton,
  filePicker, // Newly imported stable DOM refs
} from "./js/state.js";

import { getLinkPrefix } from "./js/text.js";

import { getDrawingColorValue } from "./js/drawing.js";

import { createPostIt, deletePostIt } from "./js/postit.js";

class DrawingElement {
  constructor(svg, kind, colorName) {
    this.svg = svg;
    this.kind = kind;
    this.id = `${kind}-${state.drawingElementIdCounter++}`;
    this.colorName = colorName || "red";
    this.isSelected = false;
    this.element = null;
  }
  is(kind) {
    return kind === this.kind;
  }
  setColor(colorName) {
    this.colorName = colorName;
    if (this.element) {
      this.element.setAttribute("stroke", getDrawingColorValue(this.colorName));
      if (this.kind === "arrow") {
        this.element.setAttribute(
          "marker-end",
          `url(#arrowhead-${this.colorName})`,
        );
      }
      if (this.kind === "highlight") {
        this.element.setAttribute("fill", getDrawingColorValue(this.colorName));
        this.element.setAttribute("fill-opacity", "0.2");
      }
    }
  }
  select() {
    if (this.element) {
      this.element.setAttribute("filter", "url(#drop-shadow)");
      this.isSelected = true;
      this.svg.appendChild(this.element);
    }
  }
  deselect() {
    if (this.element) {
      this.element.removeAttribute("filter");
      this.isSelected = false;
      this.dragOff();
    }
  }
  delete() {
    if (this.element && this.element.parentNode === this.svg) {
      this.svg.removeChild(this.element);
    }
    delete state.drawingElementsStore[this.id];
  }
  dragOn() {
    if (this.element) this.element.style.cursor = "grab";
  }
  dragOff() {
    if (this.element) this.element.style.cursor = "default";
  }
}

class Rect extends DrawingElement {
  constructor(x, y, colorName, svg, type = "rect") {
    super(svg, type, colorName);
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.width = 0;
    this.height = 0;
    this.type = type;
    this.element = this.createRectElement();
    this.element.setAttribute("id", this.id);
    this.element.setAttribute("_kind", this.kind);
    this.element.style.pointerEvents = "all";
  }
  createRectElement() {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", this.x);
    rect.setAttribute("y", this.y);
    rect.setAttribute("width", this.width);
    rect.setAttribute("height", this.height);
    if (this.type === "rect") {
      rect.setAttribute("stroke", getDrawingColorValue(this.colorName));
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("fill", "none");
      rect.setAttribute("rx", "2");
    } else if (this.type === "highlight") {
      rect.setAttribute("stroke-width", "0");
      rect.setAttribute("fill", getDrawingColorValue(this.colorName));
      rect.setAttribute("fill-opacity", "0.2");
      rect.setAttribute("rx", "2");
    }
    this.svg.appendChild(rect);
    return rect;
  }
  updateShape(currentX, currentY) {
    const newWidth = currentX - this.startX;
    const newHeight = currentY - this.startY;
    this.x = newWidth < 0 ? currentX : this.startX;
    this.y = newHeight < 0 ? currentY : this.startY;
    this.width = Math.abs(newWidth);
    this.height = Math.abs(newHeight);
    requestAnimationFrame(() => {
      this.element.setAttribute("x", this.x);
      this.element.setAttribute("y", this.y);
      this.element.setAttribute("width", this.width);
      this.element.setAttribute("height", this.height);
    });
  }
  dragInit(clientX, clientY) {
    const svgRect = this.svg.getBoundingClientRect();
    this.startOffsetX = clientX - svgRect.left - this.x;
    this.startOffsetY = clientY - svgRect.top - this.y;
    this.dragOn();
  }
  drag(event) {
    const svgRect = this.svg.getBoundingClientRect();
    this.x = event.clientX - svgRect.left - this.startOffsetX;
    this.y = event.clientY - svgRect.top - this.startOffsetY;
    requestAnimationFrame(() => {
      this.element.setAttribute("x", this.x);
      this.element.setAttribute("y", this.y);
    });
  }
  toSaveData() {
    const editorRect = editorContainer.getBoundingClientRect();
    if (editorRect.width === 0 || editorRect.height === 0) return null;
    return {
      id: this.id,
      kind: this.kind,
      type: this.type,
      colorName: this.colorName,
      xPercent: (this.x / editorRect.width) * 100,
      yPercent: (this.y / editorRect.height) * 100,
      widthPercent: (this.width / editorRect.width) * 100,
      heightPercent: (this.height / editorRect.height) * 100,
    };
  }
}

class Arrow extends DrawingElement {
  constructor(x1, y1, colorName, svg) {
    super(svg, "arrow", colorName);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x1;
    this.y2 = y1;
    this.element = this.createArrowElement();
    this.element.setAttribute("id", this.id);
    this.element.setAttribute("_kind", this.kind);
    this.element.style.pointerEvents = "all";
  }
  createArrowElement() {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", this.x1);
    line.setAttribute("y1", this.y1);
    line.setAttribute("x2", this.x2);
    line.setAttribute("y2", this.y2);
    line.setAttribute("stroke", getDrawingColorValue(this.colorName));
    line.setAttribute("stroke-width", "2");
    line.setAttribute("marker-end", `url(#arrowhead-${this.colorName})`);
    this.svg.appendChild(line);
    return line;
  }
  updateShape(currentX, currentY) {
    this.x2 = currentX;
    this.y2 = currentY;
    requestAnimationFrame(() => {
      this.element.setAttribute("x2", this.x2);
      this.element.setAttribute("y2", this.y2);
    });
  }
  _length() {
    const dx = this.x2 - this.x1;
    const dy = this.y2 - this.y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  dragInit(clientX, clientY) {
    const svgRect = this.svg.getBoundingClientRect();
    this.startOffsetX = clientX - svgRect.left - this.x1;
    this.startOffsetY = clientY - svgRect.top - this.y1;
    this.endOffsetX = clientX - svgRect.left - this.x2;
    this.endOffsetY = clientY - svgRect.top - this.y2;
    this.dragOn();
  }
  drag(event) {
    const svgRect = this.svg.getBoundingClientRect();
    this.x1 = event.clientX - svgRect.left - this.startOffsetX;
    this.y1 = event.clientY - svgRect.top - this.startOffsetY;
    this.x2 = event.clientX - svgRect.left - this.endOffsetX;
    this.y2 = event.clientY - svgRect.top - this.endOffsetY;
    requestAnimationFrame(() => {
      this.element.setAttribute("x1", this.x1);
      this.element.setAttribute("y1", this.y1);
      this.element.setAttribute("x2", this.x2);
      this.element.setAttribute("y2", this.y2);
    });
  }
  deselect() {
    super.deselect();
    if (this._length() < 10 && this.element.parentNode) {
      // Check if still in DOM
      console.info("Deleting too-short-of-an-arrow");
      this.delete();
    }
  }
  toSaveData() {
    const editorRect = editorContainer.getBoundingClientRect();
    if (editorRect.width === 0 || editorRect.height === 0) return null;
    return {
      id: this.id,
      kind: this.kind,
      colorName: this.colorName,
      x1Percent: (this.x1 / editorRect.width) * 100,
      y1Percent: (this.y1 / editorRect.height) * 100,
      x2Percent: (this.x2 / editorRect.width) * 100,
      y2Percent: (this.y2 / editorRect.height) * 100,
    };
  }
}

// --- Line Functions ---
function createLineObject(params) {
  const id = `line-${state.lineIdCounter++}`; // Use state.lineIdCounter
  const defaultParams = {
    parentId: null,
    startX: 0,
    startY: 0,
    length: 100,
    relativeDirection: 1,
    text: "...",
    textPosRatio: 0.5,
    textPerpOffset: -15,
    thickness:
      params && params.parentId
        ? CHILD_LINE_DEFAULT_THICKNESS // This is a const, correctly used
        : MAIN_LINE_DEFAULT_THICKNESS, // This is a const, correctly used
    color: "var(--theme-schema-line-color)", // CORRECTED: Use the theme variable
    children: [],
    offsetRatioOnParent: 0.5,
    fontSize: 16,
    isBold: false,
    isCentered: true,
    linkUrl: null,
  };

  let lineData = { ...defaultParams, ...(params || {}), id };

  if (lineData.parentId === null) {
    // Main line: 'angle' is passed in `params` by init/loadDataFromFile,
    // representing its current absolute orientation. Keep it.
    // `relativeDirection` is not used for the main line.
    delete lineData.relativeDirection;
    // The main line's color will also default to var(--theme-schema-line-color)
    // which is what we want. If it needed a special color, it could be passed in params.
  } else {
    // Child line: `relativeDirection` is its source of truth for orientation.
    if (params && params.hasOwnProperty("relativeDirection")) {
      lineData.relativeDirection = params.relativeDirection;
    }
    delete lineData.angle; // Remove 'angle' if it came from old params for a child
  }

  state.linesStore[id] = lineData; // Use state.linesStore
  return lineData;
}
// pinta.js

function renderLine(line, isUpdate = false) {
  // line object is passed
  let group = document.getElementById(line.id);
  let textElement, visual, resizeHandle, rootDragHandle, deleteHandleInstance;

  // Calculate the current display angle for this line
  const displayAngle = getLineDisplayAngle(line.id, state.linesStore); // Use state.linesStore

  const absLength = Math.abs(line.length);
  const groupScaleX = line.length < 0 ? -1 : 1;
  const normAngleForText = ((displayAngle % 360) + 360) % 360; // Use displayAngle for text orientation
  let textInternalRotation =
    normAngleForText > 90 && normAngleForText < 270 ? 180 : 0;
  const textScaleX = groupScaleX;

  if (group && isUpdate) {
    textElement = group.querySelector(".line-text");
    visual = group.querySelector(".line-visual");
    deleteHandleInstance = group.querySelector(".delete-handle");

    group.style.left = `${line.startX}px`;
    group.style.top = `${line.startY}px`;
    group.style.width = `${absLength}px`;
    // Use calculated displayAngle for rotation
    group.style.transform = `rotate(${displayAngle}deg) scaleX(${groupScaleX})`;
    if (visual) {
      visual.style.height = `${line.thickness}px`;
      visual.style.backgroundColor = line.color;
    }
  } else {
    // ... (group creation logic as before) ...
    if (group) group.remove();
    group = document.createElement("div");
    group.id = line.id;
    group.className = "line-element-group";
    group.style.left = `${line.startX}px`;
    group.style.top = `${line.startY}px`;
    group.style.width = `${absLength}px`;
    // Use calculated displayAngle for rotation
    group.style.transform = `rotate(${displayAngle}deg) scaleX(${groupScaleX})`;
    group.style.transformOrigin = `0 0`;

    visual = document.createElement("div");
    visual.className = "line-visual";
    // ... (visual setup)
    visual.style.height = `${line.thickness}px`;
    visual.style.backgroundColor = line.color;
    visual.dataset.lineId = line.id;
    visual.addEventListener("click", handleVisualClick);

    textElement = document.createElement("div");
    textElement.className = "line-text";
    textElement.dataset.lineId = line.id;
    textElement.addEventListener("click", handleTextClick);

    if (line.parentId !== null) {
      // ... (handles creation as before) ...
      resizeHandle = document.createElement("div");
      resizeHandle.className = "handle resize-handle";
      resizeHandle.dataset.lineId = line.id;
      group.appendChild(resizeHandle);
      setupLineResizable(resizeHandle, line); // setupLineResizable will also need the displayAngle

      rootDragHandle = document.createElement("div");
      rootDragHandle.className = "handle root-drag-handle";
      rootDragHandle.dataset.lineId = line.id;
      group.appendChild(rootDragHandle);
      setupRootDraggable(rootDragHandle, line); // This relies on parent's display angle

      deleteHandleInstance = document.createElement("div");
      deleteHandleInstance.className = "handle delete-handle";
      deleteHandleInstance.textContent = "X";
      deleteHandleInstance.dataset.itemId = line.id;
      deleteHandleInstance.dataset.itemType = "line";
      deleteHandleInstance.addEventListener("click", handleDeleteItemClick); // This is fine
      group.appendChild(deleteHandleInstance);
    }

    group.appendChild(visual);
    group.appendChild(textElement);

    editorContainer.appendChild(group); // editorContainer is fine
    setupTextDraggable(textElement, line); // setupTextDraggable might need displayAngle for text pos logic
  }

  // Text element positioning and styling
  const rawText = line.text || "...";
  let displayText = rawText;
  if (line.linkUrl) {
    const prefix = getLinkPrefix(line.linkUrl); // getLinkPrefix is fine
    displayText = prefix + rawText;
  }
  textElement.textContent = displayText;

  textElement.style.left = `${line.textPosRatio * 100}%`;
  textElement.style.top = `${line.textPerpOffset}px`;
  // Use textInternalRotation (derived from displayAngle) and textScaleX
  textElement.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;

  textElement.style.fontSize = `${line.fontSize || 16}px`;
  textElement.style.fontWeight = line.isBold ? "bold" : "normal";
  textElement.style.textAlign = line.isCentered ? "center" : "left";

  if (deleteHandleInstance) {
    deleteHandleInstance.style.left = `30%`; // Position of delete 'X'
    deleteHandleInstance.style.top = `${DELETE_BUTTON_PERP_OFFSET}px`;
    deleteHandleInstance.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;
  }

  if (isUpdate) updateChildrenPositions(line.id); // updateChildrenPositions will need parent's displayAngle
}

// pinta.js

function handleVisualClick(event) {
  event.stopPropagation();
  if (state.activeTextEditElement) state.activeTextEditElement.blur(); // Use state.

  const lineId = event.target.dataset.lineId;
  const clickedLine = state.linesStore[lineId]; // Use state.
  if (!clickedLine) {
    console.warn(
      "handleVisualClick: Clicked line data not found for ID:",
      lineId,
    );
    return;
  }

  const editorRect = editorContainer.getBoundingClientRect(); // editorContainer is fine
  const clickXEditor = event.clientX - editorRect.left;
  const clickYEditor = event.clientY - editorRect.top;

  const dx = clickXEditor - clickedLine.startX;
  const dy = clickYEditor - clickedLine.startY;

  // CRITICAL FIX: Use the calculated display angle of the clicked line (L1)
  const clickedLineDisplayAngle = getLineDisplayAngle(
    clickedLine.id,
    state.linesStore,
  );
  const angleRad = (clickedLineDisplayAngle * Math.PI) / 180;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // If angleRad is NaN (e.g. if getLineDisplayAngle had an issue, though unlikely with current fix),
  // cosA and sinA would be NaN, then projectedDist would be NaN.
  if (isNaN(angleRad)) {
    console.error(
      "handleVisualClick: angleRad is NaN for line:",
      clickedLine.id,
      "Display Angle:",
      clickedLineDisplayAngle,
    );
    // Default to creating child at one end, or skip, or log more.
    // For now, let's stop to prevent creating a malformed line.
    return;
  }

  const projectedDist = dx * cosA + dy * sinA;
  let clickOffsetRatio;

  if (Math.abs(clickedLine.length) < 1e-6) {
    // Check against a small epsilon for zero length
    clickOffsetRatio = 0.5; // Default to middle if length is effectively zero
  } else {
    clickOffsetRatio = projectedDist / clickedLine.length;
  }

  // Clamp clickOffsetRatio to be between 0 and 1
  clickOffsetRatio = Math.max(0, Math.min(1, clickOffsetRatio));

  // Final check for NaN in clickOffsetRatio, which could happen if clickedLine.length was 0 and not caught by epsilon.
  if (isNaN(clickOffsetRatio)) {
    console.warn(
      "handleVisualClick: clickOffsetRatio became NaN. Defaulting to 0.5. Line ID:",
      clickedLine.id,
      "Length:",
      clickedLine.length,
      "ProjectedDist:",
      projectedDist,
    );
    clickOffsetRatio = 0.5;
  }

  addNewChildLine(clickedLine.id, clickOffsetRatio);
}
function handleTextClick(e) {
  // e.currentTarget is the .line-text div the listener is attached to
  const textElementDiv = e.currentTarget;

  // Check if the click was on the link icon
  if (
    e.target.classList &&
    e.target.classList.contains("link-icon-clickable")
  ) {
    const urlToOpen = e.target.dataset.linkUrl;
    if (urlToOpen) {
      window.open(urlToOpen, "_blank", "noopener,noreferrer");
      e.stopPropagation(); // Prevent the click from triggering edit mode
      e.preventDefault(); // Prevent any default span behavior
      return; // Action complete
    }
  }

  // If not clicking the icon, or if icon has no URL, proceed with making text editable
  e.stopPropagation(); // Original stopPropagation

  // Check for dragging state of handles to prevent editing during drag
  // This assumes .line-text is a child of .line-element-group
  const itemElement = textElementDiv.closest(".line-element-group");
  if (itemElement) {
    const rHandle = itemElement.querySelector(".resize-handle");
    const rdHandle = itemElement.querySelector(".root-drag-handle");
    const dHandle = itemElement.querySelector(".delete-handle");

    // Check if the textElementDiv itself is being dragged by interactjs (if it has a 'dragging' class)
    // or if any of its associated line handles are being dragged.
    if (
      textElementDiv.classList.contains("dragging") ||
      (rHandle && rHandle.classList.contains("dragging")) ||
      (rdHandle && rdHandle.classList.contains("dragging")) ||
      (dHandle && dHandle.classList.contains("dragging"))
    ) {
      return;
    }
  }

  // If another text element is being edited, blur it first
  if (
    state.activeTextEditElement &&
    state.activeTextEditElement !== textElementDiv
  ) {
    state.activeTextEditElement.blur();
  }

  // Make the .line-text div editable
  makeEditable(textElementDiv);
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

  // Set raw text for editing if it's a line
  if (itemType === "line" && state.linesStore[itemId]) {
    textEl.textContent = state.linesStore[itemId].text || "...";
  }
  // For post-its, innerHTML is used and handled in its onBlur

  textEl.contentEditable = "true";
  textEl.style.cursor = "auto";
  textEl.focus();

  const isLineText = textEl.classList.contains("line-text");
  const isShortText = textEl.textContent.trim().length < 4; // Check raw text length

  if (!isLineText || (isLineText && isShortText)) {
    // Post-its always select all. Short line texts also select all.
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
      : "text";
    if (itemId && itemType === "line" && state.linesStore[itemId]) {
      state.linesStore[itemId].text = textEl.textContent; // Save raw text
      // Re-render to show prefix if link exists, or just update if no link change
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
      // Shortcuts for line text elements
      if (isCtrlOrCmd) {
        const lineId = itemId;
        const currentLine = state.linesStore[lineId];

        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          textEl.blur(); // Save current text changes before opening modal
          showlinkModal(lineId);
          return; // Stop further processing for Ctrl+K
        }
        if (e.key === "," || e.key === "<") {
          e.preventDefault();
          let newSize = (currentLine.fontSize || 16) - 2;
          if (newSize < 8) newSize = 8;
          currentLine.fontSize = newSize;
          textEl.style.fontSize = `${newSize}px`;
        } else if (e.key === "." || e.key === ">") {
          e.preventDefault();
          let newSize = (currentLine.fontSize || 16) + 2;
          if (newSize > 72) newSize = 72;
          currentLine.fontSize = newSize;
          textEl.style.fontSize = `${newSize}px`;
        } else if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          currentLine.isBold = !currentLine.isBold;
          textEl.style.fontWeight = currentLine.isBold ? "bold" : "normal";
        } else if (e.key.toLowerCase() === "c") {
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
        textEl.textContent = state.linesStore[itemId].text; // Restore raw text
        // Restore styles
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
          //const angleRad = (currentLine.angle * Math.PI) / 180;
          const displayAngle = getLineDisplayAngle(
            currentLine.id,
            state.linesStore,
          ); // NEW
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

function setupLineResizable(handle, line) {
  interact(handle).draggable({
    listeners: {
      start(event) {
        event.target.classList.add("dragging");
        if (state.activeTextEditElement) state.activeTextEditElement.blur();
      },
      move(event) {
        const currentLine = state.linesStore[line.id];
        if (!currentLine) return;
        //const angleRad = (currentLine.angle * Math.PI) / 180;
        const displayAngle = getLineDisplayAngle(line.id, state.linesStore); // NEW
        const angleRad = (displayAngle * Math.PI) / 180; // NEW
        const editorRect = editorContainer.getBoundingClientRect();
        const mouseVecX = event.pageX - (editorRect.left + currentLine.startX);
        const mouseVecY = event.pageY - (editorRect.top + currentLine.startY);
        let newProjectedLength =
          mouseVecX * Math.cos(angleRad) + mouseVecY * Math.sin(angleRad);
        currentLine.length = newProjectedLength;
        renderLine(currentLine, true);
      },
      end(event) {
        event.target.classList.remove("dragging");
        updateChildrenPositions(line.id);
      },
    },
    autoScroll: { container: editorContainer },
    inertia: false,
  });
}

function setupRootDraggable(handle, childLine) {
  interact(handle).draggable({
    listeners: {
      start(event) {
        event.target.classList.add("dragging");
        if (state.activeTextEditElement) state.activeTextEditElement.blur();
      },
      move(event) {
        const parentLine = state.linesStore[childLine.parentId];
        if (!parentLine) return;
        //const parentAngleRad = (parentLine.angle * Math.PI) / 180;
        const parentDisplayAngle = getLineDisplayAngle(
          childLine.parentId,
          state.linesStore,
        ); // NEW
        const parentAngleRad = (parentDisplayAngle * Math.PI) / 180; // NEW
        const parentAbsLength = Math.abs(parentLine.length);
        if (parentAbsLength === 0) return;
        const editorRect = editorContainer.getBoundingClientRect();
        const mouseRelToParentX =
          event.pageX - (editorRect.left + parentLine.startX);
        const mouseRelToParentY =
          event.pageY - (editorRect.top + parentLine.startY);
        let projectedDistOnParent =
          mouseRelToParentX * Math.cos(parentAngleRad) +
          mouseRelToParentY * Math.sin(parentAngleRad);
        let newOffsetRatio;
        if (Math.abs(parentLine.length) < 1e-6) {
          newOffsetRatio = 0.5;
        } else {
          newOffsetRatio = projectedDistOnParent / parentLine.length;
        }
        newOffsetRatio = Math.max(0, Math.min(1, newOffsetRatio));
        childLine.offsetRatioOnParent = newOffsetRatio;
        const actualOffsetAlongParent = parentLine.length * newOffsetRatio;
        childLine.startX =
          parentLine.startX +
          actualOffsetAlongParent * Math.cos(parentAngleRad);
        childLine.startY =
          parentLine.startY +
          actualOffsetAlongParent * Math.sin(parentAngleRad);
        renderLine(childLine, true);
        updateChildrenPositions(childLine.id);
      },
      end(event) {
        event.target.classList.remove("dragging");
      },
    },
    autoScroll: { container: editorContainer },
    inertia: false,
  });
}

function addNewChildLine(parentId, clickOffsetRatioOnParent) {
  const parentLine = state.linesStore[parentId]; // Use state.linesStore
  console.log(parentLine);
  if (!parentLine) return;

  // Calculate parent's current display angle
  const parentDisplayAngle = getLineDisplayAngle(parentId, state.linesStore); // We'll define this helper next
  const parentAngleRad = (parentDisplayAngle * Math.PI) / 180;

  const offsetAlongParentAxis = parentLine.length * clickOffsetRatioOnParent;
  const childStartX =
    parentLine.startX + offsetAlongParentAxis * Math.cos(parentAngleRad);
  const childStartY =
    parentLine.startY + offsetAlongParentAxis * Math.sin(parentAngleRad);

  const depth = getLineDepth(parentId); // getLineDepth needs to use state.linesStore
  let sign = -1; // Determines initial perpendicular direction
  if (depth >= 2) {
    sign = 1;
  }

  const lengthMultiplier = 1.0 - 0.75 / depth; // Existing logic
  const childLength = parentLine.length * lengthMultiplier; // Existing logic
  const childTextPerpOffset = -15; // Existing logic

  const childLine = createLineObject({
    parentId: parentId,
    startX: childStartX,
    startY: childStartY,
    length: childLength,
    relativeDirection: sign, // STORE THIS
    text: "...",
    thickness: CHILD_LINE_DEFAULT_THICKNESS,
    color: "var(--theme-schema-line-color)",
    textPerpOffset: childTextPerpOffset,
    offsetRatioOnParent: clickOffsetRatioOnParent,
  });
  parentLine.children.push(childLine.id);
  renderLine(childLine); // renderLine will now use getLineDisplayAngle
}

// Update getLineDepth to use state.linesStore
function getLineDepth(lineId) {
  if (!state.linesStore[lineId]) {
    // Use state.linesStore
    return -1;
  }
  let depth = 0;
  let currentLine = state.linesStore[lineId]; // Use state.linesStore
  while (currentLine && currentLine.parentId !== null) {
    const parent = state.linesStore[currentLine.parentId]; // Use state.linesStore
    if (!parent) {
      break;
    }
    depth++;
    currentLine = parent;
  }
  return depth + 1;
}

function getLineDisplayAngle(lineId, lines) {
  // `lines` is expected to be state.linesStore
  const line = lines[lineId];
  if (!line) {
    console.warn(`getLineDisplayAngle: Line not found for ID ${lineId}`);
    return 0;
  }

  if (line.parentId === null) {
    // Main line: its 'angle' property IS its current absolute display angle,
    // set by init() or loadDataFromFile() based on viewport.
    return line.angle || 0; // Default to 0 if angle somehow not set
  } else {
    const parentLine = lines[line.parentId];
    if (!parentLine) {
      console.warn(
        `getLineDisplayAngle: Parent line not found for child ID ${lineId}`,
      );
      return 0; // Or handle error appropriately
    }
    const parentDisplayAngle = getLineDisplayAngle(line.parentId, lines); // Recursive call
    // Apply relative direction: 1 means +90deg, -1 means -90deg from parent's angle
    return parentDisplayAngle + line.relativeDirection * 90;
  }
}

// pinta.js
function updateChildrenPositions(parentId) {
  const parentLine = state.linesStore[parentId]; // Use state.linesStore
  if (!parentLine || !parentLine.children) return;

  const parentDisplayAngle = getLineDisplayAngle(parentId, state.linesStore); // NEW
  const parentAngleRad = (parentDisplayAngle * Math.PI) / 180; // NEW

  parentLine.children.forEach((childId) => {
    const childLine = state.linesStore[childId]; // Use state.linesStore
    if (childLine) {
      // const offsetAlongParentAxis = parentLine.length * childLine.offsetRatioOnParent; // OLD - used parentLine.angle implicitly before
      // NEW: parentLine.length is fine, childLine.offsetRatioOnParent is fine.
      // The calculation of childLine.startX, startY depends on parent's angle.
      const offsetAlongParentAxis =
        parentLine.length * childLine.offsetRatioOnParent;
      childLine.startX =
        parentLine.startX + offsetAlongParentAxis * Math.cos(parentAngleRad); // Use new parentAngleRad
      childLine.startY =
        parentLine.startY + offsetAlongParentAxis * Math.sin(parentAngleRad); // Use new parentAngleRad
      renderLine(childLine, true); // renderLine will calculate child's display angle
    }
  });
}
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
function deleteLineRecursive(lineId) {
  const line = state.linesStore[lineId];
  if (!line) return;

  // Recursively delete children first
  // Iterate over a copy of the children array because the original might be modified during recursion
  const childrenCopy = [...(line.children || [])];
  childrenCopy.forEach((childId) => deleteLineRecursive(childId));

  // Remove from DOM
  const element = document.getElementById(lineId);
  if (element) element.remove();

  // Remove from parent's children array
  if (line.parentId && state.linesStore[line.parentId]) {
    const parent = state.linesStore[line.parentId];
    parent.children = parent.children.filter((id) => id !== lineId);
  }
  // Remove from store
  delete state.linesStore[lineId];
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

function deleteDrawingElement(elementId) {
  const drawingElement = state.drawingElementsStore[elementId];
  if (drawingElement) {
    drawingElement.delete();
  }
}

// --- Save/Load ---
async function triggerSaveDiagram() {
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
    if (window.showSaveFilePicker) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: "pinta.json",
        types: [
          {
            description: "JSON Diagram Files",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    }
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log("Diagram saved.");
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "pinta.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log("Diagram download initiated.");
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error("Error saving diagram:", err);
    else console.log("Save diagram aborted.");
  }
}

async function triggerLoadDiagram() {
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "JSON Diagram Files",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });
      const file = await fileHandle.getFile();
      loadDataFromFile(file);
    } catch (err) {
      if (err.name !== "AbortError") console.error("Error opening file:", err);
    }
  } else {
    filePicker.click();
  }
}

filePicker.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) loadDataFromFile(file);
});

function loadDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const savedData = JSON.parse(event.target.result);
      if (
        typeof savedData === "object" &&
        savedData !== null &&
        savedData.lines
      ) {
        const loadedLinesPart = savedData.lines;
        const mainLineRef = savedData.mainLineReference;
        const loadedPostItsPart = savedData.postIts || {};
        const loadedDrawingsPart = savedData.drawings || [];

        editorContainer.innerHTML = "";
        const newdrawingCanvas = document.createElementNS(SVG_NS, "svg");
        newdrawingCanvas.id = "drawingCanvas";
        newdrawingCanvas.setAttribute("width", "100%");
        newdrawingCanvas.setAttribute("height", "100%");
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

        const containerRect = editorContainer.getBoundingClientRect();
        if (
          !editorContainer ||
          containerRect.width === 0 ||
          containerRect.height === 0
        ) {
          console.error("Editor container not ready during load.");
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
        const currentDisplayMainStartX = p1x;
        const currentDisplayMainStartY = p1y;
        const currentDisplayMainThickness = MAIN_LINE_DEFAULT_THICKNESS;

        const scaleFactor =
          mainLineRef &&
          mainLineRef.length !== 0 &&
          currentDisplayMainLength > 0
            ? currentDisplayMainLength / mainLineRef.length
            : 1;

        let maxLineIdNum = -1;
        const tempLinesArray = [];
        for (const id in loadedLinesPart) {
          tempLinesArray.push(loadedLinesPart[id]);
        }
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
            newLineData.length = currentDisplayMainLength;
            newLineData.angle = currentDisplayMainAngle;
            newLineData.thickness = currentDisplayMainThickness;
          } else {
            newLineData.length =
              (loadedLine.length || CHILD_LINE_DEFAULT_THICKNESS * 10) *
              scaleFactor;
            newLineData.thickness = Math.max(
              1,
              (loadedLine.thickness || CHILD_LINE_DEFAULT_THICKNESS) *
                scaleFactor,
            );
            newLineData.textPerpOffset =
              (loadedLine.textPerpOffset || -15) * scaleFactor;
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
            "Main line could not be identified, rendering all lines directly.",
          );
          for (const id in state.linesStore) renderLine(state.linesStore[id]);
        } else {
          console.log("No lines in loaded file. Initializing fresh.");
          init();
          return;
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

          const editorRect = editorContainer.getBoundingClientRect();
          let shape;
          if (shapeData.kind === "rect" || shapeData.kind === "highlight") {
            const x = (shapeData.xPercent / 100) * editorRect.width;
            const y = (shapeData.yPercent / 100) * editorRect.height;
            const w = (shapeData.widthPercent / 100) * editorRect.width;
            const h = (shapeData.heightPercent / 100) * editorRect.height;
            shape = new Rect(
              x,
              y,
              shapeData.colorName,
              state.drawingCanvas,
              shapeData.type,
            );
            shape.width = w;
            shape.height = h;
            shape.element.setAttribute("x", x);
            shape.element.setAttribute("y", y);
            shape.element.setAttribute("width", w);
            shape.element.setAttribute("height", h);
          } else if (shapeData.kind === "arrow") {
            const x1 = (shapeData.x1Percent / 100) * editorRect.width;
            const y1 = (shapeData.y1Percent / 100) * editorRect.height;
            const x2 = (shapeData.x2Percent / 100) * editorRect.width;
            const y2 = (shapeData.y2Percent / 100) * editorRect.height;
            shape = new Arrow(x1, y1, shapeData.colorName, state.drawingCanvas);
            shape.x2 = x2;
            shape.y2 = y2; // Set final points
            shape.element.setAttribute("x2", x2);
            shape.element.setAttribute("y2", y2);
          }
          // TODO: Add Ellipse loading
          if (shape) {
            shape.id = shapeData.id;
            shape.element.setAttribute("id", shape.id);
            state.drawingElementsStore[shape.id] = shape;
          }
        });
        state.drawingElementIdCounter = maxDrawingIdNum + 1;

        console.log("Diagram loaded successfully.");
      } else {
        console.error("Invalid diagram data format.");
        alert("Error: Could not load diagram. Invalid file format.");
      }
    } catch (err) {
      console.error("Error parsing diagram data:", err);
      alert(
        "Error: Could not load diagram. File may be corrupted or not a valid diagram.",
      );
    }
  };
  reader.onerror = () => {
    console.error("Error reading file.");
    alert("Error: Could not read file.");
  };
  reader.readAsText(file);
}

// pinta.js

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
    triggerSaveDiagram(); // Assuming this uses state.
    return; // Return to prevent further processing if shortcut handled
  } else if (ctrlCmd && event.key.toLowerCase() === "o") {
    event.preventDefault();
    triggerLoadDiagram(); // Assuming this uses state.
    return; // Return
  }

  // Theme switch should not happen if a modal is active or editing text in general
  // (except for the line/postit specific ctrl+key combos handled in makeEditable/handlePostItKeyDown)
  const isModalActive =
    deleteModal.style.display === "flex" ||
    state.linkModal?.style.display === "flex";

  if (
    isEditingText &&
    !event.target.classList.contains("postit-content-area")
  ) {
    // If editing line text, most global shortcuts are disabled by makeEditable's keydown,
    // but we explicitly return here to avoid 'q' or drawing tool selection.
    // Post-it keydown (handlePostItKeyDown) handles its own shortcuts.
    return;
  }

  if (event.key.toLowerCase() === "q" && !isEditingText && !isModalActive) {
    event.preventDefault();
    document.body.classList.toggle("light-theme");
    // Optional: Persist theme choice
    if (document.body.classList.contains("light-theme")) {
      localStorage.setItem("pintaTheme", "light");
    } else {
      localStorage.setItem("pintaTheme", "dark");
    }
    return;
  }

  // Drawing tool selection logic (should not run if a modal is displayed or editing text)
  if (!isEditingText && !isModalActive) {
    let toolSelected = false;
    if (event.key.toLowerCase() === "r") {
      state.currentDrawingTool = "rect"; // Use state.
      toolSelected = true;
    } else if (event.key.toLowerCase() === "h") {
      state.currentDrawingTool = "highlight"; // Use state.
      toolSelected = true;
    } else if (event.key.toLowerCase() === "a") {
      state.currentDrawingTool = "arrow"; // Use state.
      toolSelected = true;
    } else if (event.key.toLowerCase() === "s") {
      // Assuming 's' is for select/cancel drawing
      state.currentDrawingTool = null; // Use state.
      // Deselect SVG elements if any were selected for drawing
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null;
      }
      state.activeDrawingShape = null;
      if (state.drawingCanvas) {
        // Check if drawingCanvas is initialized
        state.drawingCanvas.style.pointerEvents = "none";
        state.drawingCanvas.style.cursor = "default";
      }
      state.colorChangeModeActive = false;
      // No 'toolSelected = true' here as we are cancelling.
    }

    if (toolSelected) {
      if (state.drawingCanvas) {
        // Check if drawingCanvas is initialized
        state.drawingCanvas.style.pointerEvents = "auto";
        state.drawingCanvas.style.cursor = "crosshair";
      }
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null;
      }
      state.colorChangeModeActive = false;
    } else if (event.key.toLowerCase() === "escape") {
      state.currentDrawingTool = null; // Use state.
      state.activeDrawingShape = null; // Use state.
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.deselect();
        state.selectedDrawingElement = null; // Use state.
      }
      if (state.drawingCanvas) {
        state.drawingCanvas.style.pointerEvents = "none";
        state.drawingCanvas.style.cursor = "default";
      }
      state.colorChangeModeActive = false; // Use state.
    } else if (
      event.key.toLowerCase() === "c" &&
      !state.currentDrawingTool &&
      !isEditingText &&
      !isModalActive
    ) {
      // Color change mode
      state.colorChangeModeActive = !state.colorChangeModeActive; // Use state.
      console.log(
        "Color change mode:",
        state.colorChangeModeActive
          ? "ON (select shape, then color key)"
          : "OFF",
      );
    } else if (
      state.colorChangeModeActive &&
      drawingColorNames[event.key.toLowerCase()] && // drawingColorNames is imported const
      !isEditingText &&
      !isModalActive
    ) {
      state.currentDrawingColorName =
        drawingColorNames[event.key.toLowerCase()]; // Use state.
      if (state.selectedDrawingElement) {
        state.selectedDrawingElement.setColor(state.currentDrawingColorName);
        // No direct save data update here, it's handled on deselect/drag end for shapes
      }
      state.colorChangeModeActive = false; // Use state.
    } else if (
      (event.key === "Backspace" || event.key === "Delete") &&
      state.selectedDrawingElement &&
      !isEditingText &&
      !isModalActive
    ) {
      // handleDeleteItemClick is a global function that shows a modal
      handleDeleteItemClick({
        target: {
          // Simulate event target for handleDeleteItemClick
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
  // Re-scale SVG drawings on resize
  Object.values(state.drawingElementsStore).forEach((shape) => {
    if (shape.toSaveData) {
      // Check if it's a drawing element that can be rescaled
      const saved = shape.toSaveData(); // Get its % data
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
      // Add ellipse handling here when implemented
    }
  });
});

let drawingStartX, drawingStartY;
document.addEventListener("mousedown", (event) => {
  // Only proceed if pointer-events are enabled for state.drawingCanvas
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
      state.drawingCanvas.style.cursor = "default"; // Reset cursor if no tool and not on element
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
  // TODO: Add ellipse creation

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
    state.currentDrawingTool = null; // Keep tool active for multiple drawings
    state.drawingCanvas.classList.remove("active-drawing"); // Keep if tool selected
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
