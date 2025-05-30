import { state, SVG_NS, editorContainer } from "./state.js";

export { deleteDrawingElement, Rect, Arrow };

function getDrawingColorValue(name) {
  return `var(--${name})`;
}

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
  _applyRotation() {
    if (!this.element) return;

    const mainAngle = state.currentMainLineAngle || 0; // Get main line's angle from global state

    if (this.width > 0 || this.height > 0) {
      // Only apply if shape has dimensions
      if (Math.abs(mainAngle) > 0.1) {
        // Apply only if angle is non-trivial (e.g. > 0.1 degrees)
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        this.element.setAttribute(
          "transform",
          `rotate(${mainAngle} ${centerX} ${centerY})`,
        );
      } else {
        this.element.removeAttribute("transform"); // Remove transform if angle is zero
      }
    } else {
      this.element.removeAttribute("transform"); // No rotation for zero-size rect
    }
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
      this._applyRotation();
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
      this._applyRotation();
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

function deleteDrawingElement(elementId) {
  const drawingElement = state.drawingElementsStore[elementId];
  if (drawingElement) {
    drawingElement.delete();
  }
}
