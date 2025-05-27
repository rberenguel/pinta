const editorContainer = document.getElementById("editor-container");
let drawingCanvas = document.getElementById("drawingCanvas");
const SVG_NS = "http://www.w3.org/2000/svg";

let linesStore = {};
let postItsStore = {};
let drawingElementsStore = {};

let lineIdCounter = 0;
let postItIdCounter = 0;
let drawingElementIdCounter = 0;

let activeTextEditElement = null;
const MAX_TEXT_PERP_OFFSET = 30;
const DELETE_BUTTON_PERP_OFFSET = 0;
const MAIN_LINE_DEFAULT_THICKNESS = 4;
const CHILD_LINE_DEFAULT_THICKNESS = 2;
const POSTIT_DEFAULT_COLOR = "yellow";
const POSTIT_VALID_COLORS = ["yellow", "red", "green", "blue", "white"];

let currentDrawingTool = null;
let currentDrawingColorName = "red";
let activeDrawingShape = null;
let selectedDrawingElement = null;
let isDrawingModeActive = false;
let colorChangeModeActive = false;

const drawingColorNames = {
  r: "red",
  o: "orange",
  y: "yellow",
  g: "green",
  c: "cyan",
  b: "blue",
  v: "violet",
  m: "magenta",
};
const getDrawingColorValue = (name) => `var(--${name})`;

const deleteModal = document.getElementById("deleteConfirmationModal");
const deleteModalMessage = document.getElementById("deleteModalMessage");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
let itemToDeleteId = null;
let itemTypeToDelete = "";

const filePicker = document.getElementById("filePicker");

class DrawingElement {
  constructor(svg, kind, colorName) {
    this.svg = svg;
    this.kind = kind;
    this.id = `${kind}-${drawingElementIdCounter++}`;
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
    delete drawingElementsStore[this.id];
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
  const id = `line-${lineIdCounter++}`;
  const defaultParams = {
    parentId: null,
    startX: 0,
    startY: 0,
    length: 100,
    angle: 0,
    text: "...",
    textPosRatio: 0.5,
    textPerpOffset: -15,
    thickness: params.parentId
      ? CHILD_LINE_DEFAULT_THICKNESS
      : MAIN_LINE_DEFAULT_THICKNESS,
    color: "var(--orange)",
    children: [],
    offsetRatioOnParent: 0.5,
  };
  const line = { ...defaultParams, ...params, id };
  linesStore[id] = line;
  return line;
}

function renderLine(line, isUpdate = false) {
  let group = document.getElementById(line.id);
  let textElement, visual, resizeHandle, rootDragHandle, deleteHandleInstance;

  const absLength = Math.abs(line.length);
  const groupScaleX = line.length < 0 ? -1 : 1;
  const normAngle = ((line.angle % 360) + 360) % 360;
  let textInternalRotation = normAngle > 90 && normAngle < 270 ? 180 : 0;
  const textScaleX = groupScaleX;

  if (group && isUpdate) {
    textElement = group.querySelector(".line-text");
    visual = group.querySelector(".line-visual");
    deleteHandleInstance = group.querySelector(".delete-handle");

    group.style.left = `${line.startX}px`;
    group.style.top = `${line.startY}px`;
    group.style.width = `${absLength}px`;
    group.style.transform = `rotate(${line.angle}deg) scaleX(${groupScaleX})`;
    if (visual) {
      visual.style.height = `${line.thickness}px`;
      visual.style.backgroundColor = line.color;
    }
  } else {
    if (group) group.remove();
    group = document.createElement("div");
    group.id = line.id;
    group.className = "line-element-group";
    group.style.left = `${line.startX}px`;
    group.style.top = `${line.startY}px`;
    group.style.width = `${absLength}px`;
    group.style.transform = `rotate(${line.angle}deg) scaleX(${groupScaleX})`;
    group.style.transformOrigin = `0 0`;

    visual = document.createElement("div");
    visual.className = "line-visual";
    visual.style.height = `${line.thickness}px`;
    visual.style.backgroundColor = line.color;
    visual.dataset.lineId = line.id;
    visual.addEventListener("click", handleVisualClick);

    textElement = document.createElement("div");
    textElement.className = "line-text";
    textElement.dataset.lineId = line.id;
    textElement.addEventListener("click", handleTextClick);

    if (line.parentId !== null) {
      resizeHandle = document.createElement("div");
      resizeHandle.className = "handle resize-handle";
      resizeHandle.dataset.lineId = line.id;
      group.appendChild(resizeHandle);
      setupLineResizable(resizeHandle, line);

      rootDragHandle = document.createElement("div");
      rootDragHandle.className = "handle root-drag-handle";
      rootDragHandle.dataset.lineId = line.id;
      group.appendChild(rootDragHandle);
      setupRootDraggable(rootDragHandle, line);

      deleteHandleInstance = document.createElement("div");
      deleteHandleInstance.className = "handle delete-handle";
      deleteHandleInstance.textContent = "X";
      deleteHandleInstance.dataset.itemId = line.id;
      deleteHandleInstance.dataset.itemType = "line";
      deleteHandleInstance.addEventListener("click", handleDeleteItemClick);
      group.appendChild(deleteHandleInstance);
    }

    group.appendChild(visual);
    group.appendChild(textElement);

    editorContainer.appendChild(group);
    setupTextDraggable(textElement, line);
  }

  textElement.textContent = line.text || "...";
  textElement.style.left = `${line.textPosRatio * 100}%`;
  textElement.style.top = `${line.textPerpOffset}px`;
  textElement.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;

  if (deleteHandleInstance) {
    deleteHandleInstance.style.left = `30%`;
    deleteHandleInstance.style.top = `${DELETE_BUTTON_PERP_OFFSET}px`;
    deleteHandleInstance.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;
  }

  if (isUpdate) updateChildrenPositions(line.id);
}

function handleVisualClick(event) {
  event.stopPropagation();
  if (activeTextEditElement) activeTextEditElement.blur();
  const clickedLine = linesStore[event.target.dataset.lineId];
  if (!clickedLine) return;
  const editorRect = editorContainer.getBoundingClientRect();
  const clickXEditor = event.clientX - editorRect.left;
  const clickYEditor = event.clientY - editorRect.top;
  const dx = clickXEditor - clickedLine.startX;
  const dy = clickYEditor - clickedLine.startY;
  const angleRad = (clickedLine.angle * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const projectedDist = dx * cosA + dy * sinA;
  let clickOffsetRatio;
  if (Math.abs(clickedLine.length) < 1e-6) {
    clickOffsetRatio = 0.5;
  } else {
    clickOffsetRatio = projectedDist / clickedLine.length;
  }
  clickOffsetRatio = Math.max(0, Math.min(1, clickOffsetRatio));
  addNewChildLine(clickedLine.id, clickOffsetRatio);
}

function handleTextClick(e) {
  e.stopPropagation();
  const itemElement =
    e.target.closest(".line-element-group") || e.target.closest(".post-it");
  if (!itemElement) return;

  const rHandle = itemElement.querySelector(".resize-handle");
  const rdHandle = itemElement.querySelector(".root-drag-handle");
  const dHandle =
    itemElement.querySelector(".delete-handle") ||
    itemElement.querySelector(".postit-delete-button");

  if (
    e.target.classList.contains("dragging") ||
    (rHandle && rHandle.classList.contains("dragging")) ||
    (rdHandle && rdHandle.classList.contains("dragging")) ||
    (dHandle && dHandle.classList.contains("dragging"))
  )
    return;
  if (activeTextEditElement && activeTextEditElement !== e.target)
    activeTextEditElement.blur();
  makeEditable(e.target);
}

function makeEditable(textEl) {
  if (textEl.isContentEditable || textEl.classList.contains("dragging")) return;
  activeTextEditElement = textEl;
  textEl.contentEditable = "true";
  textEl.style.cursor = "auto";
  textEl.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  selection.removeAllRanges();
  selection.addRange(range);
  const itemId = textEl.dataset.lineId || textEl.closest(".post-it")?.id;
  const itemType = textEl.classList.contains("line-text")
    ? "line"
    : textEl.classList.contains("postit-content-area")
      ? "postit"
      : null;

  const onBlur = () => {
    textEl.contentEditable = "false";
    textEl.style.cursor = textEl.classList.contains("line-text")
      ? "grab"
      : "text";
    if (itemId && itemType === "line" && linesStore[itemId]) {
      linesStore[itemId].text = textEl.textContent;
    } else if (itemId && itemType === "postit" && postItsStore[itemId]) {
      postItsStore[itemId].content = textEl.innerHTML;
    }
    textEl.removeEventListener("blur", onBlur);
    textEl.removeEventListener("keydown", onKeydown);
    activeTextEditElement = null;
  };
  const onKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && itemType === "line") {
      e.preventDefault();
      textEl.blur();
    } else if (e.key === "Escape") {
      if (itemId && itemType === "line" && linesStore[itemId]) {
        textEl.textContent = linesStore[itemId].text;
      } else if (itemId && itemType === "postit" && postItsStore[itemId]) {
        textEl.innerHTML = postItsStore[itemId].content;
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
          if (activeTextEditElement === event.target) event.target.blur();
        },
        move(event) {
          const target = event.target;
          const lineId = target.dataset.lineId;
          const currentLine = linesStore[lineId];
          if (!currentLine) return;
          const absLineLength = Math.abs(currentLine.length);
          const angleRad = (currentLine.angle * Math.PI) / 180;
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
        if (activeTextEditElement && activeTextEditElement !== event.target)
          activeTextEditElement.blur();
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
        if (activeTextEditElement) activeTextEditElement.blur();
      },
      move(event) {
        const currentLine = linesStore[line.id];
        if (!currentLine) return;
        const angleRad = (currentLine.angle * Math.PI) / 180;
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
        if (activeTextEditElement) activeTextEditElement.blur();
      },
      move(event) {
        const parentLine = linesStore[childLine.parentId];
        if (!parentLine) return;
        const parentAngleRad = (parentLine.angle * Math.PI) / 180;
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
  const parentLine = linesStore[parentId];
  if (!parentLine) return;
  const parentAngleRad = (parentLine.angle * Math.PI) / 180;
  const offsetAlongParentAxis = parentLine.length * clickOffsetRatioOnParent;
  const childStartX =
    parentLine.startX + offsetAlongParentAxis * Math.cos(parentAngleRad);
  const childStartY =
    parentLine.startY + offsetAlongParentAxis * Math.sin(parentAngleRad);
  const childAngle = parentLine.angle - 90;
  const childLength = 60;
  const childTextPerpOffset = -15;
  const childLine = createLineObject({
    parentId: parentId,
    startX: childStartX,
    startY: childStartY,
    length: childLength,
    angle: childAngle,
    text: "...",
    thickness: CHILD_LINE_DEFAULT_THICKNESS,
    color: "var(--orange)",
    textPerpOffset: childTextPerpOffset,
    offsetRatioOnParent: clickOffsetRatioOnParent,
  });
  parentLine.children.push(childLine.id);
  renderLine(childLine);
}

function updateChildrenPositions(parentId) {
  const parentLine = linesStore[parentId];
  if (!parentLine || !parentLine.children) return;
  parentLine.children.forEach((childId) => {
    const childLine = linesStore[childId];
    if (childLine) {
      const parentAngleRad = (parentLine.angle * Math.PI) / 180;
      const offsetAlongParentAxis =
        parentLine.length * childLine.offsetRatioOnParent;
      childLine.startX =
        parentLine.startX + offsetAlongParentAxis * Math.cos(parentAngleRad);
      childLine.startY =
        parentLine.startY + offsetAlongParentAxis * Math.sin(parentAngleRad);
      renderLine(childLine, true);
    }
  });
}

function getDescendantIds(lineId, visited = new Set()) {
  if (visited.has(lineId)) return [];
  visited.add(lineId);
  const line = linesStore[lineId];
  if (!line || !line.children || line.children.length === 0) return [];
  let descendants = [...line.children];
  line.children.forEach((childId) => {
    descendants = descendants.concat(getDescendantIds(childId, visited));
  });
  return descendants;
}
function deleteLineRecursive(lineId) {
  const line = linesStore[lineId];
  if (!line) return;

  // Recursively delete children first
  // Iterate over a copy of the children array because the original might be modified during recursion
  const childrenCopy = [...(line.children || [])];
  childrenCopy.forEach((childId) => deleteLineRecursive(childId));

  // Remove from DOM
  const element = document.getElementById(lineId);
  if (element) element.remove();

  // Remove from parent's children array
  if (line.parentId && linesStore[line.parentId]) {
    const parent = linesStore[line.parentId];
    parent.children = parent.children.filter((id) => id !== lineId);
  }
  // Remove from store
  delete linesStore[lineId];
}
// --- Post-it Functions ---
function createPostIt(noteData = {}) {
  const id = noteData.id || `postit-${postItIdCounter++}`;
  const postItElement = document.createElement("div");
  postItElement.id = id;
  postItElement.classList.add("post-it");

  const initialColor =
    noteData.color && POSTIT_VALID_COLORS.includes(noteData.color)
      ? noteData.color
      : POSTIT_DEFAULT_COLOR;
  postItElement.classList.add(`postit-color-${initialColor}`);
  postItElement.dataset.color = initialColor;

  const editorRect = editorContainer.getBoundingClientRect();
  if (noteData.xPercent !== undefined && editorRect.width > 0) {
    postItElement.style.left = `${(noteData.xPercent / 100) * editorRect.width}px`;
  } else {
    postItElement.style.left = noteData.left || "10px";
  }
  if (noteData.yPercent !== undefined && editorRect.height > 0) {
    postItElement.style.top = `${(noteData.yPercent / 100) * editorRect.height}px`;
  } else {
    postItElement.style.top = noteData.top || "10px";
  }

  postItElement.setAttribute("data-x", "0");
  postItElement.setAttribute("data-y", "0");
  postItElement.style.transform = `translate(0px, 0px)`;

  const dragHandle = document.createElement("div");
  dragHandle.classList.add("postit-drag-handle");
  dragHandle.textContent = noteData.title || "";
  postItElement.appendChild(dragHandle);

  const deleteBtn = document.createElement("button");
  deleteBtn.classList.add("postit-delete-button");
  deleteBtn.innerHTML = "&times;";
  deleteBtn.dataset.itemId = id;
  deleteBtn.dataset.itemType = "postit";
  deleteBtn.addEventListener("click", handleDeleteItemClick);
  postItElement.appendChild(deleteBtn);

  const contentArea = document.createElement("div");
  contentArea.classList.add("postit-content-area");
  contentArea.innerHTML = noteData.content || "";
  contentArea.contentEditable = "true";
  const fontSizePercent = noteData.fontSizePercent || 100;
  contentArea.style.fontSize = `${fontSizePercent}%`;
  contentArea.dataset.fontSizePercent = fontSizePercent;

  contentArea.addEventListener("blur", () => {
    if (postItsStore[id]) postItsStore[id].content = contentArea.innerHTML;
  });
  contentArea.addEventListener("click", (e) => handleTextClick(e));
  contentArea.addEventListener("keydown", (e) =>
    handlePostItKeyDown(e, postItElement, contentArea),
  );
  contentArea.addEventListener("paste", (e) =>
    handlePostItPaste(e, contentArea),
  );

  postItElement.appendChild(contentArea);
  editorContainer.appendChild(postItElement);

  interact(postItElement).draggable({
    allowFrom: ".postit-drag-handle",
    inertia: true,
    modifiers: [
      interact.modifiers.restrictRect({ restriction: "parent", endOnly: true }),
    ],
    listeners: {
      move: (event) => {
        const target = event.target;
        const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute("data-x", x);
        target.setAttribute("data-y", y);
      },
      end: (event) => {
        const target = event.target;
        let currentX = parseFloat(target.getAttribute("data-x")) || 0;
        let currentY = parseFloat(target.getAttribute("data-y")) || 0;
        let baseLeft = parseFloat(target.style.left) || 0;
        let baseTop = parseFloat(target.style.top) || 0;
        target.style.left = baseLeft + currentX + "px";
        target.style.top = baseTop + currentY + "px";
        target.style.transform = "translate(0px, 0px)";
        target.setAttribute("data-x", "0");
        target.setAttribute("data-y", "0");
        const noteId = target.id;
        if (postItsStore[noteId]) {
          const currentEditorRect = editorContainer.getBoundingClientRect();
          if (currentEditorRect.width > 0)
            postItsStore[noteId].xPercent =
              (parseFloat(target.style.left) / currentEditorRect.width) * 100;
          if (currentEditorRect.height > 0)
            postItsStore[noteId].yPercent =
              (parseFloat(target.style.top) / currentEditorRect.height) * 100;
        }
      },
    },
  });

  if (!postItsStore[id]) {
    const editorRectForStore = editorContainer.getBoundingClientRect();
    postItsStore[id] = {
      id: id,
      title: noteData.title || "",
      content: contentArea.innerHTML,
      xPercent:
        editorRectForStore.width > 0
          ? (parseFloat(postItElement.style.left) / editorRectForStore.width) *
            100
          : 0,
      yPercent:
        editorRectForStore.height > 0
          ? (parseFloat(postItElement.style.top) / editorRectForStore.height) *
            100
          : 0,
      color: initialColor,
      fontSizePercent: fontSizePercent,
    };
  }
  const numId = parseInt(id.split("-")[1]);
  if (!isNaN(numId) && numId >= postItIdCounter) {
    postItIdCounter = numId + 1;
  }
  return postItElement;
}

function handlePostItKeyDown(e, postItElement, contentArea) {
  let preventDefault = false;
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    const colorMap = {
      y: "yellow",
      r: "red",
      g: "green",
      b: "blue",
      w: "white",
    };
    if (colorMap[e.key.toLowerCase()]) {
      preventDefault = true;
      const newColor = colorMap[e.key.toLowerCase()];
      POSTIT_VALID_COLORS.forEach((c) =>
        postItElement.classList.remove(`postit-color-${c}`),
      );
      postItElement.classList.add(`postit-color-${newColor}`);
      postItElement.dataset.color = newColor;
      if (postItsStore[postItElement.id])
        postItsStore[postItElement.id].color = newColor;
    } else if (e.key === "." || e.key === ",") {
      preventDefault = true;
      let currentPercent =
        parseFloat(contentArea.dataset.fontSizePercent) || 100;
      let increment = 10;
      let newPercent =
        e.key === "." ? currentPercent + increment : currentPercent - increment;
      newPercent = Math.max(50, Math.min(200, newPercent));
      contentArea.style.fontSize = newPercent + "%";
      contentArea.dataset.fontSizePercent = newPercent;
      if (postItsStore[postItElement.id])
        postItsStore[postItElement.id].fontSizePercent = newPercent;
    }
  }
  if (preventDefault) e.preventDefault();
}

function handlePostItPaste(e, contentArea) {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !contentArea.contains(selection.getRangeAt(0).commonAncestorContainer)
  )
    return;
  const range = selection.getRangeAt(0);
  let pastedText = (e.clipboardData || window.clipboardData)?.getData(
    "text/plain",
  );
  if (!pastedText) return;
  let isValidUrl = false;
  let url = "";
  try {
    if (pastedText.startsWith("http://") || pastedText.startsWith("https://")) {
      url = new URL(pastedText).href;
      isValidUrl = true;
    }
  } catch (_) {
    isValidUrl = false;
  }
  if (isValidUrl && !selection.isCollapsed) {
    e.preventDefault();
    try {
      const selectedText = selection.toString();
      const link = document.createElement("a");
      link.href = url;
      link.textContent = selectedText.trim() || url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      range.deleteContents();
      range.insertNode(link);
      range.setStartAfter(link);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      if (postItsStore[contentArea.closest(".post-it").id]) {
        postItsStore[contentArea.closest(".post-it").id].content =
          contentArea.innerHTML;
      }
    } catch (domError) {
      console.error("Error creating link on paste:", domError);
    }
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
  if (event.target === editorContainer) {
    const editorRect = editorContainer.getBoundingClientRect();
    const xPercent = ((event.pageX - editorRect.left) / editorRect.width) * 100;
    const yPercent = ((event.pageY - editorRect.top) / editorRect.height) * 100;
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

function handleDeleteItemClick(event) {
  //event.stopPropagation();
  itemToDeleteId = event.target.dataset.itemId;
  itemTypeToDelete = event.target.dataset.itemType;
  let itemName = "this item";
  let descendantCount = 0;
  if (itemTypeToDelete === "line") {
    const line = linesStore[itemToDeleteId];
    if (!line) return;
    itemName = `the line "${line.text || "untitled"}"`;
    descendantCount = getDescendantIds(itemToDeleteId).length;
  } else if (itemTypeToDelete === "postit") {
    const postIt = postItsStore[itemToDeleteId];
    if (!postIt) return;
    itemName = `the note "${postIt.title || "untitled"}"`;
  } else if (itemTypeToDelete === "drawing") {
    const drawing = drawingElementsStore[itemToDeleteId];
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
  currentDrawingTool = null;
  activeDrawingShape = null;
  selectedDrawingElement?.deselect();
  selectedDrawingElement = null;
  drawingCanvas.style.pointerEvents = "none";
  drawingCanvas.style.cursor = "default";
  colorChangeModeActive = false;
}
confirmDeleteButton.onclick = () => {
  if (itemToDeleteId && itemTypeToDelete === "line")
    deleteLineRecursive(itemToDeleteId);
  else if (itemToDeleteId && itemTypeToDelete === "postit")
    deletePostIt(itemToDeleteId);
  else if (itemToDeleteId && itemTypeToDelete === "drawing")
    deleteDrawingElement(itemToDeleteId);
  itemToDeleteId = null;
  itemTypeToDelete = "";
  deleteModal.style.display = "none";
};
cancelDeleteButton.onclick = () => {
  itemToDeleteId = null;
  itemTypeToDelete = "";
  deleteModal.style.display = "none";
};
function deletePostIt(postItId) {
  const postItElement = document.getElementById(postItId);
  if (postItElement) postItElement.remove();
  delete postItsStore[postItId];
}
function deleteDrawingElement(elementId) {
  const drawingElement = drawingElementsStore[elementId];
  if (drawingElement) {
    drawingElement.delete();
  }
}

// --- Save/Load ---
async function triggerSaveDiagram() {
  const mainLineId = Object.keys(linesStore).find(
    (id) => linesStore[id].parentId === null,
  );
  for (const id in postItsStore) {
    const postItElement = document.getElementById(id);
    if (postItElement) {
      const editorRect = editorContainer.getBoundingClientRect();
      if (editorRect.width > 0)
        postItsStore[id].xPercent =
          (parseFloat(postItElement.style.left) / editorRect.width) * 100;
      if (editorRect.height > 0)
        postItsStore[id].yPercent =
          (parseFloat(postItElement.style.top) / editorRect.height) * 100;
      postItsStore[id].content =
        postItElement.querySelector(".postit-content-area")?.innerHTML || "";
      postItsStore[id].title =
        postItElement.querySelector(".postit-drag-handle")?.textContent || "";
    }
  }
  const drawingsToSave = Object.values(drawingElementsStore)
    .map((el) => el.toSaveData())
    .filter((d) => d !== null);

  const dataToSave = {
    lines: linesStore,
    postIts: postItsStore,
    drawings: drawingsToSave,
    mainLineReference:
      mainLineId && linesStore[mainLineId]
        ? {
            id: mainLineId,
            length: linesStore[mainLineId].length,
          }
        : null,
  };
  const diagramData = JSON.stringify(dataToSave, null, 2);
  const blob = new Blob([diagramData], { type: "application/json" });
  let fileHandle = null;
  try {
    if (window.showSaveFilePicker) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: "diagram_v5_drawing.json",
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
      link.download = "diagram_v5_drawing.json";
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
        const newDrawingCanvas = document.createElementNS(SVG_NS, "svg");
        newDrawingCanvas.id = "drawingCanvas";
        newDrawingCanvas.setAttribute("width", "100%");
        newDrawingCanvas.setAttribute("height", "100%");
        newDrawingCanvas.innerHTML = `<defs>
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
        editorContainer.appendChild(newDrawingCanvas);
        drawingCanvas = newDrawingCanvas;

        linesStore = {};
        postItsStore = {};
        drawingElementsStore = {};
        lineIdCounter = 0;
        postItIdCounter = 0;
        drawingElementIdCounter = 0;

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
          linesStore[newLineData.id] = newLineData;
        });
        lineIdCounter = maxLineIdNum + 1;

        const mainLineToRender = mainLineLoadedId
          ? linesStore[mainLineLoadedId]
          : null;
        if (mainLineToRender) {
          renderLine(mainLineToRender);
          updateChildrenPositions(mainLineLoadedId);
        } else if (Object.keys(linesStore).length > 0) {
          console.warn(
            "Main line could not be identified, rendering all lines directly.",
          );
          for (const id in linesStore) renderLine(linesStore[id]);
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
        postItIdCounter = maxPostItIdNum + 1;

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
              drawingCanvas,
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
            shape = new Arrow(x1, y1, shapeData.colorName, drawingCanvas);
            shape.x2 = x2;
            shape.y2 = y2; // Set final points
            shape.element.setAttribute("x2", x2);
            shape.element.setAttribute("y2", y2);
          }
          // TODO: Add Ellipse loading
          if (shape) {
            shape.id = shapeData.id;
            shape.element.setAttribute("id", shape.id);
            drawingElementsStore[shape.id] = shape;
          }
        });
        drawingElementIdCounter = maxDrawingIdNum + 1;

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
  } else if (ctrlCmd && event.key.toLowerCase() === "o") {
    event.preventDefault();
    triggerLoadDiagram();
  }

  if (isEditingText && !event.target.classList.contains("postit-content-area"))
    return;

  if (
    !isEditingText ||
    event.target === drawingCanvas ||
    event.target === document.body ||
    event.target === editorContainer
  ) {
    let toolSelected = false;
    if (event.key.toLowerCase() === "r") {
      currentDrawingTool = "rect";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "h") {
      currentDrawingTool = "highlight";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "a") {
      currentDrawingTool = "arrow";
      toolSelected = true;
    } else if (event.key.toLowerCase() === "s") {
      toolSelected = true; // tool is select
    }
    // TODO: Add 'e' for ellipse

    if (toolSelected) {
      drawingCanvas.style.pointerEvents = "auto";
      drawingCanvas.style.cursor = "crosshair";
      selectedDrawingElement?.deselect();
      selectedDrawingElement = null;
      colorChangeModeActive = false;
    } else if (event.key.toLowerCase() === "escape") {
      currentDrawingTool = null;
      activeDrawingShape = null;
      selectedDrawingElement?.deselect();
      selectedDrawingElement = null;
      drawingCanvas.style.pointerEvents = "none";
      drawingCanvas.style.cursor = "default";
      colorChangeModeActive = false;
    } else if (event.key.toLowerCase() === "c" && !currentDrawingTool) {
      colorChangeModeActive = !colorChangeModeActive;
      console.log(
        "Color change mode:",
        colorChangeModeActive ? "ON (select shape, then color key)" : "OFF",
      );
    } else if (
      colorChangeModeActive &&
      drawingColorNames[event.key.toLowerCase()]
    ) {
      currentDrawingColorName = drawingColorNames[event.key.toLowerCase()];
      if (selectedDrawingElement) {
        selectedDrawingElement.setColor(currentDrawingColorName);
        // Update save data for the element after color change
        if (
          drawingElementsStore[selectedDrawingElement.id] &&
          selectedDrawingElement.toSaveData
        ) {
          drawingElementsStore[selectedDrawingElement.id].saveData =
            selectedDrawingElement.toSaveData();
        }
      }
      colorChangeModeActive = false;
    } else if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selectedDrawingElement
    ) {
      handleDeleteItemClick({
        target: {
          dataset: { itemId: selectedDrawingElement.id, itemType: "drawing" },
        },
      });
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("keydown", handleKeyDown);
  init();
});

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  Object.values(postItsStore).forEach((noteData) => {
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
  Object.values(drawingElementsStore).forEach((shape) => {
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
  // Only proceed if pointer-events are enabled for drawingCanvas
  if (
    drawingCanvas.style.pointerEvents !== "auto" &&
    !drawingCanvas.classList.contains("active-drawing") &&
    !drawingCanvas.classList.contains("tool-selected")
  ) {
    return;
  }

  const rect = drawingCanvas.getBoundingClientRect();
  const svgX = event.clientX - rect.left;
  const svgY = event.clientY - rect.top;

  if (!currentDrawingTool) {
    const targetElement = event.target.closest("rect, ellipse, line");
    if (
      targetElement &&
      targetElement.id &&
      drawingElementsStore[targetElement.id]
    ) {
      selectedDrawingElement?.deselect();
      selectedDrawingElement = drawingElementsStore[targetElement.id];
      selectedDrawingElement.select();
      selectedDrawingElement.dragInit(event.clientX, event.clientY);
      drawingCanvas.style.cursor = "grabbing";
    } else {
      selectedDrawingElement?.deselect();
      selectedDrawingElement = null;
      drawingCanvas.style.cursor = "default"; // Reset cursor if no tool and not on element
    }
    return;
  }

  drawingStartX = svgX;
  drawingStartY = svgY;

  if (currentDrawingTool === "rect" || currentDrawingTool === "highlight") {
    activeDrawingShape = new Rect(
      drawingStartX,
      drawingStartY,
      currentDrawingColorName,
      drawingCanvas,
      currentDrawingTool,
    );
  } else if (currentDrawingTool === "arrow") {
    console.log("drawn arrow");
    activeDrawingShape = new Arrow(
      drawingStartX,
      drawingStartY,
      currentDrawingColorName,
      drawingCanvas,
    );
  }
  // TODO: Add ellipse creation

  if (activeDrawingShape) {
    drawingElementsStore[activeDrawingShape.id] = activeDrawingShape;
    isDrawingModeActive = true;
  }
});

document.addEventListener("mousemove", (event) => {
  if (isDrawingModeActive && activeDrawingShape) {
    const rect = drawingCanvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    activeDrawingShape.updateShape(currentX, currentY);
  } else if (
    selectedDrawingElement &&
    selectedDrawingElement.isSelected &&
    event.buttons === 1
  ) {
    selectedDrawingElement.drag(event);
  }
});

document.addEventListener("mouseup", (event) => {
  if (isDrawingModeActive && activeDrawingShape) {
    if (activeDrawingShape._length && activeDrawingShape._length() < 1) {
      activeDrawingShape.delete();
      activeDrawingShape = null;
    } else {
      if (activeDrawingShape.toSaveData) {
        drawingElementsStore[activeDrawingShape.id].saveData =
          activeDrawingShape.toSaveData();
      }
    }

    activeDrawingShape = null;
    // currentDrawingTool = null; // Keep tool active for multiple drawings
    // drawingCanvas.classList.remove('active-drawing'); // Keep if tool selected
  }
  if (selectedDrawingElement && event.button === 0) {
    selectedDrawingElement.dragOff();
    if (
      drawingElementsStore[selectedDrawingElement.id] &&
      drawingElementsStore[selectedDrawingElement.id].toSaveData
    ) {
      drawingElementsStore[selectedDrawingElement.id].saveData =
        drawingElementsStore[selectedDrawingElement.id].toSaveData();
    }
    drawingCanvas.style.cursor = currentDrawingTool ? "crosshair" : "default";
  }
  isDrawingModeActive = false;
});

function init() {
  editorContainer.innerHTML = "";
  const newDrawingCanvas = document.createElementNS(SVG_NS, "svg");
  newDrawingCanvas.id = "drawingCanvas";
  newDrawingCanvas.setAttribute("width", "100%");
  newDrawingCanvas.setAttribute("height", "100%");
  newDrawingCanvas.innerHTML = `<defs>
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
  editorContainer.appendChild(newDrawingCanvas);
  drawingCanvas = newDrawingCanvas;

  linesStore = {};
  postItsStore = {};
  drawingElementsStore = {};
  lineIdCounter = 0;
  postItIdCounter = 0;
  drawingElementIdCounter = 0;
  activeTextEditElement = null;

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
    color: "var(--orange)",
  });
  renderLine(mainLine);
}
