import { state } from "../js/state.js";
import { init as initPinta } from "../pinta.js";

describe("Pinta Line Functionality", function () {
  let editorContainer;

  beforeEach(function () {
    editorContainer = document.getElementById("editor-container");
    initPinta();
  });

  afterEach(function () {
    state.linesStore = {};
    state.lineIdCounter = 0;
    state.drawingCanvas = null;
  });

  it("should create a main line on initialization", function () {
    chai.expect(Object.keys(state.linesStore).length).to.equal(1);
    const mainLineId = Object.keys(state.linesStore).find(
      (id) => state.linesStore[id].parentId === null,
    );
    chai.expect(mainLineId).to.not.be.undefined;
    chai.expect(state.linesStore[mainLineId]).to.exist;

    const mainLineElement = document.getElementById(mainLineId);
    chai.expect(mainLineElement).to.exist;
    chai.expect(mainLineElement.classList.contains("line-element-group")).to.be
      .true;
  });

  it("should create a child line when the main line is clicked", function () {
    const mainLineId = Object.keys(state.linesStore).find(
      (id) => state.linesStore[id].parentId === null,
    );
    chai.expect(mainLineId).to.not.be.undefined;
    const mainLineObject = state.linesStore[mainLineId];
    chai.expect(mainLineObject.children.length).to.equal(0);

    const mainLineElement = document.getElementById(mainLineId);
    const visualElement = mainLineElement.querySelector(".line-visual");
    chai.expect(visualElement).to.exist;

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(clickEvent, "target", {
      writable: false,
      value: visualElement,
    });

    visualElement.dispatchEvent(clickEvent);

    chai.expect(mainLineObject.children.length).to.be.greaterThan(0);
    const childLineId = mainLineObject.children[0];
    chai.expect(state.linesStore[childLineId]).to.exist;
    chai.expect(state.linesStore[childLineId].parentId).to.equal(mainLineId);

    const childLineElement = document.getElementById(childLineId);
    chai.expect(childLineElement).to.exist;
    chai.expect(childLineElement.classList.contains("line-element-group")).to.be
      .true;
  });
}).slow(500);

const waitForTimeout = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

describe("Pinta Child Line Behavior", function () {
  let editorContainerElement;
  let mainLineId;
  let mainLineVisualElement;
  let childLineId;
  let childLineGroupElement;
  let childLineVisualElement;
  let rootDragHandleElement;
  let resizeHandleElement;

  const dispatchKeyboardEvent = (targetElement, key, eventOptions = {}) => {
    const fullEventOptions = {
      key: key,
      bubbles: true,
      cancelable: true,
      ...eventOptions,
    };
    if (fullEventOptions.ctrlOrCmd) {
      if (navigator.platform.toUpperCase().indexOf("MAC") >= 0) {
        fullEventOptions.metaKey = true;
      } else {
        fullEventOptions.ctrlKey = true;
      }
      delete fullEventOptions.ctrlOrCmd;
    }
    targetElement.dispatchEvent(new KeyboardEvent("keydown", fullEventOptions));
  };

  const simulatePintaClick = (element, editorEl, datasetLineId) => {
    const elRect = element.getBoundingClientRect();
    const editorRect = editorEl.getBoundingClientRect();
    if (datasetLineId) {
      element.dataset.lineId = datasetLineId;
    }
    const clientX = elRect.left + elRect.width / 2;
    const clientY = elRect.top + elRect.height / 2;
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      clientX: clientX,
      clientY: clientY,
    });
    element.dispatchEvent(clickEvent);
  };

  beforeEach(async function () {
    if (typeof initPinta === "function") {
      initPinta();
      await waitForTimeout(200);
    } else {
      throw new Error("initPinta is not a function.");
    }
    await waitForTimeout(10);

    editorContainerElement = document.getElementById("editor-container");
    mainLineId = Object.keys(state.linesStore).find(
      (id) => state.linesStore[id] && state.linesStore[id].parentId === null,
    );
    if (!mainLineId) throw new Error("Main line ID not found after initPinta.");

    const mainLineGroupEl = document.getElementById(mainLineId);
    if (!mainLineGroupEl)
      throw new Error(`Main line DOM element for ID ${mainLineId} not found.`);
    mainLineVisualElement = mainLineGroupEl.querySelector(".line-visual");
    chai.expect(mainLineVisualElement, "Main line visual element should exist")
      .to.exist;

    simulatePintaClick(
      mainLineVisualElement,
      editorContainerElement,
      mainLineId,
    );
    await waitForTimeout(50);

    const mainLineObject = state.linesStore[mainLineId];
    if (!mainLineObject.children || mainLineObject.children.length === 0) {
      throw new Error(
        "Child line ID was not added to parent's children array after click & wait.",
      );
    }
    childLineId = mainLineObject.children[0];

    if (!state.linesStore[childLineId]) {
      throw new Error(
        `Child line object for ID ${childLineId} not found in state.linesStore after click & wait.`,
      );
    }

    childLineGroupElement = document.getElementById(childLineId);
    if (!childLineGroupElement) {
      throw new Error(
        `Child line DOM element for ID ${childLineId} not rendered after click & wait.`,
      );
    }
    childLineVisualElement =
      childLineGroupElement.querySelector(".line-visual");
    rootDragHandleElement =
      childLineGroupElement.querySelector(".root-drag-handle");
    resizeHandleElement = childLineGroupElement.querySelector(".resize-handle");

    chai.expect(
      childLineVisualElement,
      "Child line visual element should exist in DOM",
    ).to.exist;
    if (childLineVisualElement) {
      childLineVisualElement.dataset.lineId = childLineId;
    }
  });

  it("should have successfully created a main line and a child line in beforeEach", function () {
    chai.expect(mainLineId, "mainLineId should be set").to.exist;
    chai.expect(childLineId, "childLineId should be set").to.exist;
    chai.expect(state.linesStore[mainLineId], "Main line should be in store").to
      .exist;
    chai.expect(state.linesStore[childLineId], "Child line should be in store")
      .to.exist;
    chai.expect(
      document.getElementById(mainLineId),
      "Main line DOM should exist",
    ).to.exist;
    chai.expect(
      document.getElementById(childLineId),
      "Child line DOM should exist",
    ).to.exist;
  });

  it("should change child line visualColor on hover and key press ('b' then 'd')", async function () {
    chai.expect(
      childLineVisualElement,
      "Child line visual element must be available from beforeEach",
    ).to.exist;
    chai.expect(childLineId, "childLineId must be available from beforeEach").to
      .exist;
    chai.expect(
      state.linesStore[childLineId],
      `state.linesStore['${childLineId}'] must exist at test start`,
    ).to.exist;

    const initialMainLineVisualColor =
      state.linesStore[mainLineId].color || "default";
    const defaultColorVar = "var(--theme-schema-line-color)";
    const blueColorVar = "var(--blue)";

    childLineVisualElement.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: true }),
    );
    await waitForTimeout(20);

    chai
      .expect(
        state.hoveredLineIdForVisualColorChange,
        "hoveredLineIdForVisualColorChange should be set to childLineId",
      )
      .to.equal(childLineId);

    dispatchKeyboardEvent(document, "b");
    await waitForTimeout(50);

    chai.expect(
      state.linesStore[childLineId],
      `Child line ${childLineId} should still exist in store`,
    ).to.exist;
    chai
      .expect(
        state.linesStore[childLineId].color,
        "Child line state color should be blue",
      )
      .to.equal("blue");

    chai
      .expect(
        childLineVisualElement.style.backgroundColor,
        "Child line element background style should be blue var",
      )
      .to.equal(blueColorVar);

    chai
      .expect(
        state.linesStore[mainLineId].color,
        "Main line state color should remain unchanged",
      )
      .to.equal(initialMainLineVisualColor);
    const mainLineVisualActualColor = document
      .getElementById(mainLineId)
      .querySelector(".line-visual").style.backgroundColor;
    chai
      .expect(
        mainLineVisualActualColor,
        "Main line visual style should remain unchanged",
      )
      .to.equal(
        initialMainLineVisualColor === "default"
          ? defaultColorVar
          : `var(--${initialMainLineVisualColor})`,
      );

    dispatchKeyboardEvent(document, "d");
    await waitForTimeout(50);

    chai
      .expect(
        state.linesStore[childLineId].color,
        "Child line state color should revert to default",
      )
      .to.equal("default");
    chai
      .expect(
        childLineVisualElement.style.backgroundColor,
        "Child line element background style should be default var",
      )
      .to.equal(defaultColorVar);

    chai
      .expect(
        state.linesStore[mainLineId].color,
        "Main line state color should still be unchanged",
      )
      .to.equal(initialMainLineVisualColor);
    chai
      .expect(
        document.getElementById(mainLineId).querySelector(".line-visual").style
          .backgroundColor,
        "Main line visual style should still be unchanged",
      )
      .to.equal(
        initialMainLineVisualColor === "default"
          ? defaultColorVar
          : `var(--${initialMainLineVisualColor})`,
      );

    childLineVisualElement.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: true }),
    );
    await waitForTimeout(20);

    chai.expect(
      state.hoveredLineIdForVisualColorChange,
      "hoveredLineIdForVisualColorChange should be null after mouseleave",
    ).to.be.null;
  });

  it("should move the child line along the parent when dragging its root handle", async function () {
    chai.expect(
      rootDragHandleElement,
      "rootDragHandleElement must be set from beforeEach",
    ).to.exist;
    chai.expect(childLineId, "childLineId must be set from beforeEach").to
      .exist;
    const childLineInitial = state.linesStore[childLineId];
    chai.expect(childLineInitial, "Child line initial state must exist").to
      .exist;

    const initialOffsetRatio = childLineInitial.offsetRatioOnParent;
    const initialStartX = childLineInitial.startX;
    const initialStartY = childLineInitial.startY;

    await waitForTimeout(20);
    console.log(childLineGroupElement);

    childLineGroupElement.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: true, cancelable: true }),
    );
    console.log("Root Drag Test: Dispatched mouseenter on line group.");

    await waitForTimeout(100);

    const computedStyleAfterHover = getComputedStyle(rootDragHandleElement);
    console.log(
      `Root Drag Test: After group hover & wait, handle display: ${computedStyleAfterHover.display}`,
    );

    let handleRect = rootDragHandleElement.getBoundingClientRect();
    console.log(
      "Root Drag Test: Handle Rect after group hover:",
      JSON.stringify(handleRect),
    );

    if (
      computedStyleAfterHover.display === "none" ||
      handleRect.width === 0 ||
      handleRect.height === 0
    ) {
      console.warn(
        "Root Drag Test: Handle not visible after group hover simulation. Attempting to force display via '.dragging' class for test.",
      );
      rootDragHandleElement.classList.add("dragging");
      await waitForTimeout(10);
      handleRect = rootDragHandleElement.getBoundingClientRect();
      console.log(
        "Root Drag Test: Handle Rect after adding .dragging class:",
        JSON.stringify(handleRect),
      );
    }

    if (handleRect.width === 0 && handleRect.height === 0) {
      console.error(
        "Root Drag Test: Handle still has zero dimensions. Check CSS and hover simulation.",
      );
      throw new Error(
        "Root drag handle has zero dimensions after attempts to make it visible. Cannot simulate drag accurately.",
      );
    }
    const dragStartX = handleRect.left + handleRect.width / 2;
    const dragStartY = handleRect.top + handleRect.height / 2;

    console.log(dragStartX, dragStartY);
    console.log(rootDragHandleElement);

    rootDragHandleElement.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: dragStartX,
        clientY: dragStartY,
        buttons: 1,
      }),
    );
    await waitForTimeout(50);

    const pointerId = 1;
    const dragDx = 200;
    const dragDy = -100;

    rootDragHandleElement.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX,
        clientY: dragStartY,
        buttons: 1,
        isPrimary: true,
      }),
    );
    console.log("Root Drag Test: Dispatched pointerdown");

    await waitForTimeout(50);
    chai.expect(
      rootDragHandleElement.classList.contains("dragging"),
      "Handle should have '.dragging' class after pointerdown and interact start",
    ).to.be.true;
    console.log(
      "Root Drag Test: Handle display after interact start (should be flex due to .dragging):",
      getComputedStyle(rootDragHandleElement).display,
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX + dragDx,
        clientY: dragStartY + dragDy,
        buttons: 1,
        isPrimary: true,
      }),
    );
    console.log("Root Drag Test: Dispatched pointermove");
    await waitForTimeout(100);

    document.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX + dragDx,
        clientY: dragStartY + dragDy,
        isPrimary: true,
      }),
    );
    console.log("Root Drag Test: Dispatched pointerup");
    await waitForTimeout(50);

    const childLineAfterDrag = state.linesStore[childLineId];
    chai.expect(
      childLineAfterDrag,
      "Child line state should still exist after drag",
    ).to.exist;
    chai
      .expect(
        childLineAfterDrag.offsetRatioOnParent,
        "offsetRatioOnParent should change after drag",
      )
      .to.not.equal(initialOffsetRatio);

    const positionChanged =
      childLineAfterDrag.startX !== initialStartX ||
      childLineAfterDrag.startY !== initialStartY;
    chai.expect(
      positionChanged,
      "startX or startY should change after root handle drag",
    ).to.be.true;

    chai.expect(childLineAfterDrag.offsetRatioOnParent).to.be.at.least(0);
    chai.expect(childLineAfterDrag.offsetRatioOnParent).to.be.at.most(1);
  });

  it("should resize the child line when dragging its head (resize) handle", async function () {
    chai.expect(
      resizeHandleElement,
      "resizeHandleElement must be set from beforeEach",
    ).to.exist;
    chai.expect(
      childLineGroupElement,
      "childLineGroupElement must be set from beforeEach",
    ).to.exist;
    chai.expect(childLineId, "childLineId must be set from beforeEach").to
      .exist;
    const childLineInitial = state.linesStore[childLineId];
    chai.expect(childLineInitial, "Child line initial state must exist").to
      .exist;

    const initialLength = childLineInitial.length;
    console.log(`Resize Test: Initial length: ${initialLength}`);

    console.log(
      "Resize Test: Before hover, handle display:",
      getComputedStyle(resizeHandleElement).display,
    );

    childLineGroupElement.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: true, cancelable: true }),
    );
    console.log("Resize Test: Dispatched mouseenter on line group.");

    await waitForTimeout(100);

    const computedStyleAfterHover = getComputedStyle(resizeHandleElement);
    console.log(
      `Resize Test: After group hover & wait, handle display: ${computedStyleAfterHover.display}`,
    );

    let handleRect = resizeHandleElement.getBoundingClientRect();
    console.log(
      "Resize Test: Handle Rect after group hover:",
      JSON.stringify(handleRect),
    );

    if (
      computedStyleAfterHover.display === "none" ||
      handleRect.width === 0 ||
      handleRect.height === 0
    ) {
      console.warn(
        "Resize Test: Handle not visible after group hover simulation. Attempting to force display via '.dragging' class for test.",
      );
      resizeHandleElement.classList.add("dragging");
      await waitForTimeout(10);
      handleRect = resizeHandleElement.getBoundingClientRect();
      console.log(
        "Resize Test: Handle Rect after adding .dragging class:",
        JSON.stringify(handleRect),
      );
    }

    if (handleRect.width === 0 && handleRect.height === 0) {
      console.error(
        "Resize Test: Handle still has zero dimensions. Check CSS and hover simulation.",
      );
      throw new Error(
        "Resize handle has zero dimensions after attempts to make it visible. Cannot simulate drag accurately.",
      );
    }

    const dragStartX = handleRect.left + handleRect.width / 2;
    const dragStartY = handleRect.top + handleRect.height / 2;
    console.log(
      `Resize Test: Dragging resize handle from viewport clientX: ${dragStartX}, clientY: ${dragStartY}`,
    );

    const pointerId = 2;
    const dragDx = 150;
    const dragDy = 0;

    resizeHandleElement.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX,
        clientY: dragStartY,
        buttons: 1,
        isPrimary: true,
      }),
    );
    console.log("Resize Test: Dispatched pointerdown");
    await waitForTimeout(50);

    chai.expect(
      resizeHandleElement.classList.contains("dragging"),
      "Resize handle should have '.dragging' class after pointerdown and interact start",
    ).to.be.true;
    console.log(
      "Resize Test: Handle display after interact start (should be flex due to .dragging):",
      getComputedStyle(resizeHandleElement).display,
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX + dragDx,
        clientY: dragStartY + dragDy,
        buttons: 1,
        isPrimary: true,
      }),
    );
    console.log("Resize Test: Dispatched pointermove");
    await waitForTimeout(100);

    document.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: pointerId,
        bubbles: true,
        cancelable: true,
        clientX: dragStartX + dragDx,
        clientY: dragStartY + dragDy,
        isPrimary: true,
      }),
    );
    console.log("Resize Test: Dispatched pointerup");
    await waitForTimeout(50);

    const childLineAfterResize = state.linesStore[childLineId];
    chai.expect(
      childLineAfterResize,
      "Child line state should still exist after resize",
    ).to.exist;

    console.log(`Resize Test: Final length: ${childLineAfterResize.length}`);

    chai
      .expect(
        childLineAfterResize.length,
        "Line length should change after resize drag",
      )
      .to.not.equal(initialLength);
    if (
      Math.abs(initialLength) > 1e-5 &&
      Math.abs(childLineAfterResize.length) > 1e-5
    ) {
      chai
        .expect(
          Math.abs(childLineAfterResize.length),
          "Absolute line length should typically change if initial length was not near zero",
        )
        .to.not.equal(Math.abs(initialLength));
    } else if (
      Math.abs(initialLength) <= 1e-5 &&
      Math.abs(childLineAfterResize.length) > 1e-5
    ) {
      chai
        .expect(
          Math.abs(childLineAfterResize.length),
          "Absolute line length should increase if initial was near zero",
        )
        .to.be.greaterThan(Math.abs(initialLength));
    }
    chai.expect(Math.abs(childLineAfterResize.length)).to.be.greaterThan(0);

    childLineGroupElement.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: true }),
    );
    if (resizeHandleElement.classList.contains("dragging")) {
      resizeHandleElement.classList.remove("dragging");
    }
    await waitForTimeout(20);
  });
}).slow(2500);
mocha.run();
