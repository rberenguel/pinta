export {
  deleteLineRecursive,
  createLineObject,
  renderLine,
  updateChildrenPositions,
  getLineDisplayAngle,
  getLineDepth,
  highlightBranch,
  increaseAllLinesFontSize,
  decreaseAllLinesFontSize,
  isEditingLineText,
  showLinkInIframe,
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
import { deleteItem, handleDeleteItemClick } from "./delete.js";

export const placeholderStyle = `
          display: inline-block;
          width: 1em;
          height: 1em;
          vertical-align: middle;
          border-radius: 2px;
          background-color: var(--theme-main-background);
          background-image: repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 4px,
              var(--theme-border-color) 4px,
              var(--theme-border-color) 5px
          );
      `
  .replace(/\s\s+/g, " ")
  .trim(); // Minify for style attribute
const DELETE_BUTTON_PERP_OFFSET = 0;
let zIndexCounter = 1000;

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
    color: "default",
    textColor: "default",
    textShadow: false,
    children: [],
    offsetRatioOnParent: 0.5,
    // TODO this should match line-text
    fontSize: 13,
    isBold: false,
    isCentered: true,
    linkUrl: null,
    checkboxState: null,
    textRenderLength: null,
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

function changeAllLinesFontSize(delta) {
  for (const lineId in state.linesStore) {
    const line = state.linesStore[lineId];
    if (!line.fontSize) {
      line.fontSize = 16;
    }
    line.fontSize += delta;
    renderLine(line, { updating: true });
  }
}

function increaseAllLinesFontSize() {
  changeAllLinesFontSize(1);
}

function decreaseAllLinesFontSize() {
  changeAllLinesFontSize(-1);
}

function renderLine(line, opts = {}) {
  const isUpdate = opts.updating;
  const isMoving = opts.moving;
  const fromText = opts.fromText; // Text move should not affect children
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
      let currentColor = line.color || "default";
      currentColor = Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(
        currentColor,
      )
        ? currentColor
        : "default";
      line.color = currentColor;
      visual.style.backgroundColor =
        currentColor === "default"
          ? DEFAULT_SCHEMA_LINE_VISUAL_COLOR_VAR
          : `var(--${currentColor})`;

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
    let currentColor = line.color || "default";
    currentColor = Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(
      currentColor,
    )
      ? currentColor
      : "default";
    line.color = currentColor;
    visual.style.backgroundColor =
      currentColor === "default"
        ? DEFAULT_SCHEMA_LINE_VISUAL_COLOR_VAR
        : `var(--${currentColor})`;
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

  if (state.selectedLines.has(line.id)) {
    group.classList.add("line-selected");
  } else {
    group.classList.remove("line-selected");
  }

  if (textElement) {
    textElement.innerHTML = "";
    if (
      line.checkboxState === "checked" ||
      line.checkboxState === "unchecked"
    ) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "line-label-checkbox";
      checkbox.checked = line.checkboxState === "checked";
      checkbox.style.marginRight = "5px";
      const currentLineTextColorValue =
        line.textColor && line.textColor !== "default"
          ? `var(--${line.textColor})`
          : DEFAULT_SCHEMA_TEXT_COLOR_VAR;
      checkbox.style.borderColor = currentLineTextColorValue;
      if (checkbox.checked) {
        checkbox.style.backgroundColor = currentLineTextColorValue;
      } else {
        checkbox.style.backgroundColor = "var(--theme-main-background)";
      }
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentLineData = state.linesStore[line.id];
        if (currentLineData) {
          currentLineData.checkboxState = e.target.checked
            ? "checked"
            : "unchecked";
          if (e.target.checked) {
            textElement.classList.add("checkbox-checked");
          } else {
            textElement.classList.remove("checkbox-checked");
          }
          const currentLineTextColorValue =
            line.textColor && line.textColor !== "default"
              ? `var(--${line.textColor})`
              : DEFAULT_SCHEMA_TEXT_COLOR_VAR;
          checkbox.style.borderColor = currentLineTextColorValue;
          if (checkbox.checked) {
            checkbox.style.backgroundColor = currentLineTextColorValue;
          } else {
            checkbox.style.backgroundColor = "var(--theme-main-background)";
          }
        }
      });

      checkbox.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      textElement.appendChild(checkbox);
    }
    if (line.textShadow) {
      textElement.classList.add("shadow");
    } else {
      textElement.classList.remove("shadow");
    }
    let prefixSymbol = undefined;
    let lineText = line.text || "...";
    if (lineText.startsWith(":")) {
      const maybeIcon = lineText.slice(1).split(":");
      if (maybeIcon.length > 1) {
        const icon = maybeIcon[0];
        if (icon) {
          prefixSymbol = `<div class="iconoir-${icon}"></div>`;
          // TODO this will be better if I use some sort of reduced set of icons instead
          if (!line.linkUrl) {
            const linkIconSpan = document.createElement("span");
            linkIconSpan.className = "link-icon-nonclickable";
            linkIconSpan.innerHTML = prefixSymbol + " ";
            textElement.appendChild(linkIconSpan);
          }
          lineText = lineText.slice(1).split(":").slice(1).join(":").trim();
        }
      }
    }

    if (lineText.startsWith("!")) {
      const maybeIcon = lineText.slice(1).split("!");
      if (maybeIcon.length > 1) {
        let imageUrl = maybeIcon[0];
        if (imageUrl) {
          // If the content is a data key, look up the base64 string from our store
          if (
            imageUrl.startsWith("data-") &&
            state.dataUrls &&
            state.dataUrls[imageUrl]
          ) {
            imageUrl = state.dataUrls[imageUrl].base64;
          }

          prefixSymbol = `<span class="inlined-image-wrapper"><img class="inlined-image" src="${imageUrl}" style="height: 1.2em; vertical-align: middle;"></span>`;

          lineText = lineText.slice(1).split("!").slice(1).join("!").trim();
        }
      }
    }
    let appending = [];
    if (lineText.startsWith("[")) {
      const maybeYear = lineText.slice(1).split("]");
      if (maybeYear.length > 1) {
        const year = maybeYear[0];
        const yearMonthPattern =
          /^(19\d{2}|20\d{2}|2100)(0[1-9]|1[0-2])?(0[1-9]|1[0-9]|2[0-9]|3[0-1])?$/;
        const match = year.match(yearMonthPattern);
        if (match) {
          console.info("Found year and optional month");
          const yearPart = match[1];
          const monthPart = match[2];
          const dayPart = match[3];

          const yearSpan = document.createElement("span");
          yearSpan.className = "year";
          yearSpan.innerHTML = yearPart;
          appending.push(yearSpan);

          if (monthPart) {
            console.info("Found month");
            const monthSpan = document.createElement("span");
            monthSpan.className = "month";
            monthSpan.innerHTML = monthPart;
            appending.push(monthSpan);
          }
          if (dayPart) {
            console.info("Found month");
            const daySpan = document.createElement("span");
            daySpan.className = "day";
            daySpan.innerHTML = dayPart;
            appending.push(daySpan);
          }
        }
        lineText = lineText.slice(1).split("]").slice(1).join("]").trim();
      }
    }

    if (line.linkUrl) {
      prefixSymbol = prefixSymbol || getLinkPrefix(line.linkUrl);
      const linkIconSpan = document.createElement("span");
      linkIconSpan.className = "link-icon-clickable";
      linkIconSpan.innerHTML = prefixSymbol + " ";
      linkIconSpan.dataset.linkUrl = line.linkUrl;
      linkIconSpan.title = line.linkUrl;
      linkIconSpan.style.cursor = "pointer";
      textElement.appendChild(linkIconSpan);
    }

    if (line.checkboxState === "checked") {
      // Strikethrough logic
      textElement.classList.add("checkbox-checked");
    } else {
      textElement.classList.remove("checkbox-checked");
    }
    let displayText = lineText;
    if (line.textRenderLength && lineText.length > line.textRenderLength) {
      displayText = lineText.substring(0, line.textRenderLength) + "…";
      textElement.title = lineText;
    } else {
      textElement.removeAttribute("title");
    }
    // Handle inline images: !url! -> <img ...>
    // URLs can have underscores
    const imageUrlRegex = /!([^!]+)!/g;
    const placeholders = [];
    displayText = displayText.replace(imageUrlRegex, (match, content) => {
      const placeholder = `PINTA.IMAGE.PLACEHOLDER.${placeholders.length}`;
      placeholders.push(content);
      return placeholder;
    });

    // Markdown-ish italicizer
    displayText = displayText.replace(
      /_([a-zA-Z][^_]*[a-zA-Z]|[a-zA-Z])_/g,
      "<em>$1</em>",
    );
    // Markdown-ish strongifier
    displayText = displayText.replace(
      /\*([a-zA-Z][^*]*[a-zA-Z]|[a-zA-Z])\*/g,
      "<strong>$1</strong>",
    );
    // Markdown-ish code
    displayText = displayText.replace(
      /`([a-zA-Z][^`]*[a-zA-Z]|[a-zA-Z])`/g,
      "<code>$1</code>",
    );
    // Markdown-ish highlight
    displayText = displayText.replace(
      /=([a-zA-Z][^=]*[a-zA-Z]|[a-zA-Z])=/g,
      `<span class="highlight">$1</span>`,
    );
    // Handle inline icons: :icon-name: -> <icon>
    displayText = displayText.replace(
      /:([\w-]+):/g,
      '<span class="link-icon-nonclickable"><div class="iconoir-$1"></div> </span>',
    );
    if (!isMoving) {
      displayText = displayText.replace(
        /PINTA\.IMAGE\.PLACEHOLDER\.(\d+)/g,
        (match, index) => {
          const originalContent = placeholders[parseInt(index)];
          let imageUrl = originalContent;

          // If the content is a data key, look up the base64 string from our store
          if (
            originalContent.startsWith("data-") &&
            state.dataUrls &&
            state.dataUrls[originalContent]
          ) {
            imageUrl = state.dataUrls[originalContent].base64;
          }

          return `<span class="inlined-image-wrapper"><img class="inlined-image" src="${imageUrl}" style="height: 1.2em; vertical-align: middle;"></span>`;
        },
      );
    } else {
      // If moving, just replace the tokens with a simple placeholder style
      displayText = displayText.replace(
        /__PINTA_IMAGE_PLACEHOLDER_(\d+)__/g,
        `<span style="${placeholderStyle}"></span>`,
      );
    }
    const textNodeWrapper = document.createElement("DIV");
    textNodeWrapper.classList.add("line-text-wrapper");
    textNodeWrapper.innerHTML = displayText;
    textElement.appendChild(textNodeWrapper);
    for (let el of appending) {
      textElement.appendChild(el);
    }

    const hasExplicitNewlines = line.text && line.text.includes("\n");

    if (hasExplicitNewlines) {
      textElement.style.whiteSpace = "pre-wrap";
    } else {
      textElement.style.removeProperty("max-width");
      textElement.style.removeProperty("width");
      textElement.style.whiteSpace = "pre-wrap";

      const proportionalityFactor = 0.85;
      const minPixelWidth = 50;
      const maxPixelWidthConsideration = 1000; // What was this for?

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

  if (!fromText) updateChildrenPositions(line.id, opts);
}

function updateChildrenPositions(parentId, opts = {}) {
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

      renderLine(childLine, opts);
    }
  });
}

function highlightBranch(lineId, isHighlighted) {
  const line = state.linesStore[lineId];
  if (!line) return;

  const element = document.getElementById(lineId);
  if (element) {
    if (isHighlighted) {
      element.classList.add("line-selected");
    } else {
      element.classList.remove("line-selected");
    }
  }

  if (line.children) {
    line.children.forEach((childId) => highlightBranch(childId, isHighlighted));
  }
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
          renderLine(currentLine, { updating: true, moving: true });
        },
        end(event) {
          event.target.classList.remove("dragging");
          updateChildrenPositions(line.id);
          renderLine(line, { updating: true, moving: false });
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
          renderLine(childLine, { updating: true, moving: true });
          updateChildrenPositions(childLine.id, {
            updating: true,
            moving: true,
          });
        },
        end(event) {
          event.target.classList.remove("dragging");
          renderLine(childLine, { updating: true, moving: false });
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
  let newSign = 1;
  let sibling = undefined;
  let hasCheckbox = false;
  if (parentLine.children && parentLine.children.length > 0) {
    sibling =
      state.linesStore[parentLine.children[parentLine.children.length - 1]];
  }
  if (sibling) {
    newSign = Math.sign(
      state.linesStore[parentLine.children[parentLine.children.length - 1]]
        .length,
    );
    initialSignedChildLength *= newSign;
  }
  if (sibling) {
    if (
      sibling.checkboxState == "checked" ||
      sibling.checkboxState == "unchecked"
    ) {
      hasCheckbox = true;
    }
  }
  const childTextPerpOffset = -15;

  const initialSign = Math.sign(initialSignedChildLength) || 1;
  let absLenAfterScreenClip = Math.abs(initialSignedChildLength);

  const childDisplayAngle = parentDisplayAngle + sign * 90;
  const childDisplayAngleRad = (childDisplayAngle * Math.PI) / 180;
  const cosA = Math.cos(childDisplayAngleRad);
  const sinA = Math.sin(childDisplayAngleRad);
  const editorRect = editorContainer.getBoundingClientRect();
  const screenPadding = 25;
  // TODO clipping after preferred sign direction is broken
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
    color: "default",
    textPerpOffset: childTextPerpOffset,
    offsetRatioOnParent: clickOffsetRatioOnParent,
    checkboxState: hasCheckbox ? "unchecked" : null,
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

const isEditingLineText = () => {
  return Array.from(document.querySelectorAll(".line-text")).some(
    (l) => l.contentEditable === "true",
  );
};

function handleLineVisualColorKeydown(event) {
  if (
    !state.hoveredLineIdForVisualColorChange ||
    isEditingLineText() ||
    event.metaKey ||
    event.ctrlKey
  ) {
    return;
  }
  const key = event.key.toLowerCase();
  const lineId = state.hoveredLineIdForVisualColorChange;
  const lineToUpdate = state.linesStore[lineId];
  if (SCHEMA_LINE_VISUAL_COLORS[key]) {
    event.preventDefault();
    event.stopPropagation();

    if (lineToUpdate) {
      const newColorName = SCHEMA_LINE_VISUAL_COLORS[key];
      lineToUpdate.color = newColorName;
      renderLine(lineToUpdate, { updating: true });
    }
    return;
  } else if (key === "t") {
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      if (
        lineToUpdate.checkboxState === "checked" ||
        lineToUpdate.checkboxState === "unchecked"
      ) {
        lineToUpdate.checkboxState = null; // Remove checkbox
      } else {
        lineToUpdate.checkboxState = "unchecked"; // Add checkbox, default to unchecked
      }
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "i") {
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      lineToUpdate.length *= -1;
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "/") {
    if (!lineToUpdate.parentId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      lineToUpdate.length /= 2;
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "*") {
    if (!lineToUpdate.parentId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      lineToUpdate.length *= 2;
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "]" || key === "}") {
    if (!lineToUpdate.parentId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      lineToUpdate.length += 20;
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "[" || key === "{") {
    if (!lineToUpdate.parentId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate) {
      lineToUpdate.length -= 20;
      renderLine(lineToUpdate, { updating: true });
    }
  } else if (key === "0" || key === "9") {
    event.preventDefault();
    event.stopPropagation();
    if (lineToUpdate && lineToUpdate.parentId) {
      lineToUpdate.offsetRatioOnParent = key === "0" ? 0.05 : 0.95;
      updateChildrenPositions(lineToUpdate.parentId);
    }
  } else if (key === "=") {
    event.preventDefault();
    event.stopPropagation();

    if (!lineToUpdate || !lineToUpdate.parentId) {
      return;
    }

    const siblings = state.linesStore[lineToUpdate.parentId].children.filter(
      (c) => c !== lineToUpdate.id,
    );

    if (siblings.length > 0) {
      const siblingToCopyFrom = state.linesStore[siblings[0]];
      if (siblingToCopyFrom) {
        lineToUpdate.length = siblingToCopyFrom.length;
        lineToUpdate.thickness = siblingToCopyFrom.thickness;
        renderLine(lineToUpdate, { updating: true });
      }
    }
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
    renderLine(lineToUpdate, { updating: true });
  } else if (key === "," || key === "<") {
    event.preventDefault();
    event.stopPropagation();
    let newThickness =
      (lineToUpdate.thickness || CHILD_LINE_DEFAULT_THICKNESS) - step;
    lineToUpdate.thickness = Math.min(
      maxThickness,
      Math.max(minThickness, newThickness),
    );
    renderLine(lineToUpdate, { updating: true });
  }
  if (key === "backspace") {
    event.preventDefault();
    event.stopPropagation();
    state.itemToDeleteId = state.hoveredLineIdForVisualColorChange;
    state.itemTypeToDelete = "line";
    deleteItem(event);
  }
}

function showLinkInIframe(url) {
  const container = document.createElement("div");
  container.className = "iframe-preview-container";
  container.style.zIndex = ++zIndexCounter;

  const placeholder = document.createElement("div");
  placeholder.className = "iframe-resize-placeholder";

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.className = "iframe-preview-content";
  iframe.sandbox = "allow-scripts allow-forms allow-popups allow-same-origin";

  const closeButton = document.createElement("button");
  closeButton.className = "iframe-preview-close";
  closeButton.innerHTML = "&times;";
  closeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    interact(container).unset();
    container.remove();
  });

  container.appendChild(placeholder);
  container.appendChild(iframe);
  container.appendChild(closeButton);
  editorContainer.appendChild(container);

  interact(container)
    .draggable({
      allowFrom: container,
      inertia: true,
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
          endOnly: true,
        }),
      ],
      listeners: {
        start(event) {
          iframe.style.visibility = "hidden";
          placeholder.style.display = "block";
        },
        move(event) {
          const target = event.target;
          const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
          const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute("data-x", x);
          target.setAttribute("data-y", y);
        },
        end(event) {
          placeholder.style.display = "none";
          iframe.style.visibility = "visible";
        },
      },
    })
    .resizable({
      edges: { top: true, left: true, bottom: true, right: true },
      listeners: {
        start(event) {
          iframe.style.visibility = "hidden";
          placeholder.style.display = "block";
        },
        move(event) {
          const target = event.target;

          // Get the current position from the data attributes
          let x = parseFloat(target.getAttribute("data-x")) || 0;
          let y = parseFloat(target.getAttribute("data-y")) || 0;

          // Update the element's width and height style
          target.style.width = `${event.rect.width}px`;
          target.style.height = `${event.rect.height}px`;

          // This is the crucial part: apply the change in position.
          // event.deltaRect contains the difference in position since the last event.
          x += event.deltaRect.left;
          y += event.deltaRect.top;

          // Apply the new position via transform
          target.style.transform = `translate(${x}px, ${y}px)`;

          // And finally, update the data attributes for the next move event
          target.setAttribute("data-x", x);
          target.setAttribute("data-y", y);
        },
        end(event) {
          placeholder.style.display = "none";
          iframe.style.visibility = "visible";
          iframe.src = iframe.src; // Reload
        },
      },
      modifiers: [
        interact.modifiers.restrictSize({
          min: { width: 200, height: 150 },
        }),
      ],
    })
    .on("down", (event) => {
      event.currentTarget.style.zIndex = ++zIndexCounter;
    });
}
