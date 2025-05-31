export {
  deleteLineRecursive,
  createLineObject,
  renderLine,
  updateChildrenPositions,
  getLineDisplayAngle,
};

export const MAIN_LINE_DEFAULT_THICKNESS = 4;
export const CHILD_LINE_DEFAULT_THICKNESS = 2;
export const MIN_LINE_LENGTH = 10;
export const SCHEMA_LINE_VISUAL_COLORS = {
  b: "blue",
  c: "cyan",
  d: "default",
  g: "green",
  k: "black",
  m: "magenta",
  o: "orange",
  r: "red",
  v: "violet",
  w: "white",
  y: "yellow",
};
export const DEFAULT_SCHEMA_LINE_VISUAL_COLOR_VAR =
  "var(--theme-schema-line-color)";

export const LINE_THICKNESS_STEP = 0.5;
export const MIN_LINE_THICKNESS = 0.5;
export const MAX_LINE_THICKNESS = 20;

import { getLinkPrefix, setupTextDraggable, handleTextClick } from "./text.js";
import { DEFAULT_SCHEMA_TEXT_COLOR_VAR } from "./text.js";
import { state, editorContainer } from "./state.js";
import { handleDeleteItemClick } from "./delete.js";

const DELETE_BUTTON_PERP_OFFSET = 0;

function createLineObject(params) {
  const id = `line-${state.lineIdCounter++}`;
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
        ? CHILD_LINE_DEFAULT_THICKNESS
        : MAIN_LINE_DEFAULT_THICKNESS,
    color: "var(--theme-schema-line-color)", // Kind of deprecated with visualColor
    visualColor: "default",
    textColor: "default",
    children: [],
    offsetRatioOnParent: 0.5,
    fontSize: 16,
    isBold: false,
    isCentered: true,
    linkUrl: null,
  };

  let lineData = { ...defaultParams, ...(params || {}), id };

  if (lineData.parentId === null) {
    delete lineData.relativeDirection;
  } else {
    if (params && params.hasOwnProperty("relativeDirection")) {
      lineData.relativeDirection = params.relativeDirection;
    }
    delete lineData.angle;
  }

  state.linesStore[id] = lineData;
  return lineData;
}

function renderLine(line, isUpdate = false) {
  let group = document.getElementById(line.id);
  let textElement, visual, resizeHandle, rootDragHandle, deleteHandleInstance;

  const displayAngle = getLineDisplayAngle(line.id, state.linesStore);

  const absLength = Math.abs(line.length);
  const groupScaleX = line.length < 0 ? -1 : 1;
  const normAngleForText = ((displayAngle % 360) + 360) % 360;
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
    group.style.transform = `rotate(${displayAngle}deg) scaleX(${groupScaleX})`;
    if (visual) {
      visual.style.height = `${line.thickness}px`;
      const currentVisualColor = line.visualColor || "default";
      visual.style.backgroundColor =
        currentVisualColor === "default"
          ? DEFAULT_SCHEMA_LINE_VISUAL_COLOR_VAR
          : `var(--${currentVisualColor})`;

      visual.removeEventListener("mouseenter", handleLineVisualMouseEnter);
      visual.addEventListener("mouseenter", handleLineVisualMouseEnter);

      visual.removeEventListener("mouseleave", handleLineVisualMouseLeave);
      visual.addEventListener("mouseleave", handleLineVisualMouseLeave);
    }
  } else {
    if (group) group.remove();
    group = document.createElement("div");
    group.id = line.id;
    group.className = "line-element-group";
    group.style.left = `${line.startX}px`;
    group.style.top = `${line.startY}px`;
    group.style.width = `${absLength}px`;
    group.style.transform = `rotate(${displayAngle}deg) scaleX(${groupScaleX})`;
    group.style.transformOrigin = `0 0`;

    visual = document.createElement("div");
    visual.className = "line-visual";
    visual.style.height = `${line.thickness}px`;
    const currentVisualColor = line.visualColor || "default";
    visual.style.backgroundColor =
      currentVisualColor === "default"
        ? DEFAULT_SCHEMA_LINE_VISUAL_COLOR_VAR
        : `var(--${currentVisualColor})`;
    visual.dataset.lineId = line.id;
    visual.addEventListener("click", handleVisualClick);
    visual.removeEventListener("mouseenter", handleLineVisualMouseEnter);
    visual.addEventListener("mouseenter", handleLineVisualMouseEnter);

    visual.removeEventListener("mouseleave", handleLineVisualMouseLeave);
    visual.addEventListener("mouseleave", handleLineVisualMouseLeave);

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

  if (textElement) {
    textElement.innerHTML = "";

    if (line.linkUrl) {
      const prefixSymbol = getLinkPrefix(line.linkUrl);
      const linkIconSpan = document.createElement("span");
      linkIconSpan.className = "link-icon-clickable";
      linkIconSpan.textContent = prefixSymbol + "\u00A0";
      linkIconSpan.dataset.linkUrl = line.linkUrl;
      linkIconSpan.title = line.linkUrl;
      linkIconSpan.style.cursor = "pointer";
      textElement.appendChild(linkIconSpan);
    }

    const textNode = document.createTextNode(line.text || "...");
    textElement.appendChild(textNode);
    const hasExplicitNewlines = line.text && line.text.includes("\n");

    if (hasExplicitNewlines) {
      textElement.style.whiteSpace = "pre-wrap";
    } else {
      console.debug("Resizing proportionally to line");
      textElement.style.removeProperty("max-width");
      textElement.style.removeProperty("width");
      textElement.style.whiteSpace = "pre-wrap";

      const proportionalityFactor = 0.85;
      const minPixelWidth = 50;
      const maxPixelWidthConsideration = 400;

      let calculatedMaxWidth = absLength * proportionalityFactor;
      calculatedMaxWidth = Math.max(minPixelWidth, calculatedMaxWidth);
      calculatedMaxWidth = Math.min(
        calculatedMaxWidth,
        maxPixelWidthConsideration,
      );

      textElement.style.maxWidth = `${calculatedMaxWidth}px`;
      textElement.style.width = `${calculatedMaxWidth}px`;
    }
    const currentTextColor = line.textColor || "default";
    textElement.style.color =
      currentTextColor === "default"
        ? DEFAULT_SCHEMA_TEXT_COLOR_VAR
        : `var(--${currentTextColor})`;
  }

  textElement.style.left = `${line.textPosRatio * 100}%`;
  textElement.style.top = `${line.textPerpOffset}px`;
  textElement.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;

  textElement.style.fontSize = `${line.fontSize || 16}px`;
  textElement.style.fontWeight = line.isBold ? "bold" : "normal";
  textElement.style.textAlign = line.isCentered ? "center" : "left";

  if (deleteHandleInstance) {
    deleteHandleInstance.style.left = `30%`;
    deleteHandleInstance.style.top = `${DELETE_BUTTON_PERP_OFFSET}px`;
    deleteHandleInstance.style.transform = `translateX(-50%) translateY(-50%) scaleX(${textScaleX}) rotate(${textInternalRotation}deg)`;
  }

  if (isUpdate) updateChildrenPositions(line.id);
}

function updateChildrenPositions(parentId) {
  const parentLine = state.linesStore[parentId];
  if (!parentLine || !parentLine.children) return;

  const parentDisplayAngle = getLineDisplayAngle(parentId, state.linesStore);
  const parentAngleRad = (parentDisplayAngle * Math.PI) / 180;

  parentLine.children.forEach((childId) => {
    const childLine = state.linesStore[childId];
    if (childLine) {
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

function getLineDisplayAngle(lineId, lines) {
  const line = lines[lineId];
  if (!line) {
    console.warn(`getLineDisplayAngle: Line not found for ID ${lineId}`);
    return 0;
  }

  if (line.parentId === null) {
    return line.angle || 0;
  } else {
    const parentLine = lines[line.parentId];
    if (!parentLine) {
      console.warn(
        `getLineDisplayAngle: Parent line not found for child ID ${lineId}`,
      );
      return 0;
    }
    const parentDisplayAngle = getLineDisplayAngle(line.parentId, lines);

    return parentDisplayAngle + line.relativeDirection * 90;
  }
}

function handleVisualClick(event) {
  event.stopPropagation();
  if (state.activeTextEditElement) state.activeTextEditElement.blur();

  const lineId = event.target.dataset.lineId;
  const clickedLine = state.linesStore[lineId];
  if (!clickedLine) {
    console.warn(
      "handleVisualClick: Clicked line data not found for ID:",
      lineId,
    );
    return;
  }

  const editorRect = editorContainer.getBoundingClientRect();
  const clickXEditor = event.clientX - editorRect.left;
  const clickYEditor = event.clientY - editorRect.top;

  const dx = clickXEditor - clickedLine.startX;
  const dy = clickYEditor - clickedLine.startY;

  const clickedLineDisplayAngle = getLineDisplayAngle(
    clickedLine.id,
    state.linesStore,
  );
  const angleRad = (clickedLineDisplayAngle * Math.PI) / 180;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  if (isNaN(angleRad)) {
    console.error(
      "handleVisualClick: angleRad is NaN for line:",
      clickedLine.id,
      "Display Angle:",
      clickedLineDisplayAngle,
    );
    return;
  }

  const projectedDist = dx * cosA + dy * sinA;
  let clickOffsetRatio;

  if (Math.abs(clickedLine.length) < 1e-6) {
    clickOffsetRatio = 0.5;
  } else {
    clickOffsetRatio = projectedDist / clickedLine.length;
  }

  clickOffsetRatio = Math.max(0, Math.min(1, clickOffsetRatio));

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

function setupLineResizable(handle, line) {
  interact(handle)
    .draggable({
      listeners: {
        start(event) {
          event.target.classList.add("dragging");
          if (state.activeTextEditElement) state.activeTextEditElement.blur();
        },
        move(event) {
          const currentLine = state.linesStore[line.id];
          if (!currentLine) return;
          const displayAngle = getLineDisplayAngle(line.id, state.linesStore);
          const angleRad = (displayAngle * Math.PI) / 180;
          const editorRect = editorContainer.getBoundingClientRect();
          const mouseVecX =
            event.pageX - (editorRect.left + currentLine.startX);
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
    })
    .styleCursor(false);
}

function setupRootDraggable(handle, childLine) {
  interact(handle)
    .draggable({
      listeners: {
        start(event) {
          console.debug("Start drag event");
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
          );
          const parentAngleRad = (parentDisplayAngle * Math.PI) / 180;
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
    })
    .styleCursor(false);
}

function segmentIntersection(p1, p2, p3, p4) {
  const d12x = p2.x - p1.x;
  const d12y = p2.y - p1.y;
  const d34x = p4.x - p3.x;
  const d34y = p4.y - p3.y;

  const denominator = d12x * d34y - d12y * d34x;

  const epsilon = 1e-9;
  if (Math.abs(denominator) < epsilon) {
    return null;
  }

  const t13x = p1.x - p3.x;
  const t13y = p1.y - p3.y;

  const tNumerator = d34x * t13y - d34y * t13x;
  const t = tNumerator / denominator;

  const uNumerator = d12x * t13y - d12y * t13x;
  const u = uNumerator / denominator;

  if (
    t >= -epsilon &&
    t <= 1.0 + epsilon &&
    u >= -epsilon &&
    u <= 1.0 + epsilon
  ) {
    const intersectX = p1.x + t * d12x;
    const intersectY = p1.y + t * d12y;

    const clampedT = Math.max(0, Math.min(1, t));

    return {
      x: intersectX,
      y: intersectY,
      t_param_on_first_segment: clampedT,
    };
  }

  return null;
}

function addNewChildLine(parentId, clickOffsetRatioOnParent) {
  const parentLine = state.linesStore[parentId];
  console.log(parentLine);
  if (!parentLine) return;

  const parentDisplayAngle = getLineDisplayAngle(parentId, state.linesStore);
  const parentAngleRad = (parentDisplayAngle * Math.PI) / 180;

  const offsetAlongParentAxis = parentLine.length * clickOffsetRatioOnParent;
  const childStartX =
    parentLine.startX + offsetAlongParentAxis * Math.cos(parentAngleRad);
  const childStartY =
    parentLine.startY + offsetAlongParentAxis * Math.sin(parentAngleRad);

  const depth = getLineDepth(parentId);
  let sign = -1;
  if (depth >= 2) {
    sign = 1;
  }

  const lengthMultiplier = 1.0 - 0.75 / depth;
  let initialSignedChildLength = parentLine.length * lengthMultiplier;
  initialSignedChildLength =
    Math.sign(initialSignedChildLength) *
    Math.max(Math.abs(initialSignedChildLength), MIN_LINE_LENGTH);
  const childTextPerpOffset = -15;

  const initialSign = Math.sign(initialSignedChildLength) || 1;
  let absLenAfterScreenClip = Math.abs(initialSignedChildLength);

  const childDisplayAngle = parentDisplayAngle + sign * 90;
  const childDisplayAngleRad = (childDisplayAngle * Math.PI) / 180;
  const cosA = Math.cos(childDisplayAngleRad);
  const sinA = Math.sin(childDisplayAngleRad);
  const editorRect = editorContainer.getBoundingClientRect();
  const screenPadding = 25;

  let maxLen = absLenAfterScreenClip;
  if (cosA > 1e-6) {
    const len = (editorRect.width - screenPadding - childStartX) / cosA;
    if (len >= 0) maxLen = Math.min(maxLen, len);
  } else if (cosA < -1e-6) {
    const len = (screenPadding - childStartX) / cosA;
    if (len >= 0) maxLen = Math.min(maxLen, len);
  }
  if (sinA > 1e-6) {
    const len = (editorRect.height - screenPadding - childStartY) / sinA;
    if (len >= 0) maxLen = Math.min(maxLen, len);
  } else if (sinA < -1e-6) {
    const len = (screenPadding - childStartY) / sinA;
    if (len >= 0) maxLen = Math.min(maxLen, len);
  }
  absLenAfterScreenClip = Math.max(MIN_LINE_LENGTH, maxLen);

  let finalAbsoluteLength = absLenAfterScreenClip;
  const newChildP1 = { x: childStartX, y: childStartY };
  const collisionPadding = 10;

  for (const existingLineId in state.linesStore) {
    if (existingLineId === parentId) continue;

    const existingLine = state.linesStore[existingLineId];
    const exL_angle = getLineDisplayAngle(existingLineId, state.linesStore);
    const exL_angleRad = (exL_angle * Math.PI) / 180;

    const exL_P1 = { x: existingLine.startX, y: existingLine.startY };
    const exL_P2 = {
      x: existingLine.startX + existingLine.length * Math.cos(exL_angleRad),
      y: existingLine.startY + existingLine.length * Math.sin(exL_angleRad),
    };

    const newChildP2_candidate = {
      x: newChildP1.x + finalAbsoluteLength * cosA,
      y: newChildP1.y + finalAbsoluteLength * sinA,
    };

    const intersectData = segmentIntersection(
      newChildP1,
      newChildP2_candidate,
      exL_P1,
      exL_P2,
    );
    console.log(intersectData);
    if (intersectData) {
      let distToCollision =
        intersectData.t_param_on_first_segment * finalAbsoluteLength;

      distToCollision -= collisionPadding;

      if (distToCollision > 0 && distToCollision < finalAbsoluteLength) {
        finalAbsoluteLength = distToCollision;
      }
    }
  }
  finalAbsoluteLength = Math.max(finalAbsoluteLength, MIN_LINE_LENGTH);
  const finalSignedLength = initialSign * finalAbsoluteLength;
  const childLine = createLineObject({
    parentId: parentId,
    startX: childStartX,
    startY: childStartY,
    length: finalSignedLength,
    relativeDirection: sign,
    text: "...",
    thickness: CHILD_LINE_DEFAULT_THICKNESS,
    color: "var(--theme-schema-line-color)",
    textPerpOffset: childTextPerpOffset,
    offsetRatioOnParent: clickOffsetRatioOnParent,
  });
  parentLine.children.push(childLine.id);
  renderLine(childLine);
}

function getLineDepth(lineId) {
  if (!state.linesStore[lineId]) {
    return -1;
  }
  let depth = 0;
  let currentLine = state.linesStore[lineId];
  while (currentLine && currentLine.parentId !== null) {
    const parent = state.linesStore[currentLine.parentId];
    if (!parent) {
      break;
    }
    depth++;
    currentLine = parent;
  }
  return depth + 1;
}

function deleteLineRecursive(lineId) {
  const line = state.linesStore[lineId];
  if (!line) return;

  const childrenCopy = [...(line.children || [])];
  childrenCopy.forEach((childId) => deleteLineRecursive(childId));

  const element = document.getElementById(lineId);
  if (element) element.remove();

  if (line.parentId && state.linesStore[line.parentId]) {
    const parent = state.linesStore[line.parentId];
    parent.children = parent.children.filter((id) => id !== lineId);
  }
  delete state.linesStore[lineId];
}

function handleLineVisualMouseEnter(event) {
  const lineId = event.target.dataset.lineId;
  if (lineId) {
    state.hoveredLineIdForVisualColorChange = lineId;
    document.addEventListener("keydown", handleLineVisualColorKeydown);
  }
}

function handleLineVisualMouseLeave(event) {
  state.hoveredLineIdForVisualColorChange = null;
  document.removeEventListener("keydown", handleLineVisualColorKeydown);
}

function handleLineVisualColorKeydown(event) {
  if (!state.hoveredLineIdForVisualColorChange) return;

  const key = event.key.toLowerCase();
  const lineId = state.hoveredLineIdForVisualColorChange;
  const lineToUpdate = state.linesStore[lineId];
  if (SCHEMA_LINE_VISUAL_COLORS[key]) {
    event.preventDefault();
    event.stopPropagation();

    if (lineToUpdate) {
      const newColorName = SCHEMA_LINE_VISUAL_COLORS[key];
      lineToUpdate.visualColor = newColorName;
      renderLine(lineToUpdate, true);
    }
    return;
  }
  const step = LINE_THICKNESS_STEP;
  const minThickness = MIN_LINE_THICKNESS;
  const maxThickness = MAX_LINE_THICKNESS;

  if (key === "." || key === ">") {
    event.preventDefault();
    event.stopPropagation();
    let newThickness =
      (lineToUpdate.thickness || CHILD_LINE_DEFAULT_THICKNESS) + step;
    lineToUpdate.thickness = Math.min(
      maxThickness,
      Math.max(minThickness, newThickness),
    );
    renderLine(lineToUpdate, true);
  } else if (key === "," || key === "<") {
    event.preventDefault();
    event.stopPropagation();
    let newThickness =
      (lineToUpdate.thickness || CHILD_LINE_DEFAULT_THICKNESS) - step;
    lineToUpdate.thickness = Math.min(
      maxThickness,
      Math.max(minThickness, newThickness),
    );
    renderLine(lineToUpdate, true);
  }
}
