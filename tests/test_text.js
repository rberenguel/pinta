import { state } from "../js/state.js";
import { init as initPinta, createNewDiagram } from "../pinta.js";
import { renderLine } from "../js/lines.js";
import { handleTextClick } from "../js/text.js";

mocha.run();
mocha.slow(500);
const waitForTimeout = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
describe("Pinta Text Functionality", function () {
  let editorContainer;
  let mainLineId;
  let mainLineTextElement;

  beforeEach(async function () {
    editorContainer = document.getElementById("editor-container");
    if (typeof initPinta === "function") {
      initPinta();
      await waitForTimeout(200);
    } else {
      throw new Error("initPinta is not a function.");
    }
    await waitForTimeout(10);

    mainLineId = Object.keys(state.linesStore).find(
      (id) => state.linesStore[id].parentId === null,
    );
    const mainLineElementGroup = document.getElementById(mainLineId);
    mainLineTextElement = mainLineElementGroup.querySelector(".line-text");
  });

  afterEach(function () {
    state.linesStore = {};
    state.lineIdCounter = 0;
    state.activeTextEditElement = null;
    state.drawingCanvas = null;
  });

  it("should make text editable on click and allow content change", function (done) {
    chai.expect(mainLineTextElement.contentEditable).to.not.equal("true");

    mainLineTextElement.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    requestAnimationFrame(() => {
      chai.expect(mainLineTextElement.contentEditable).to.equal("true");
      chai.expect(document.activeElement).to.equal(mainLineTextElement);

      const originalText = state.linesStore[mainLineId].text;
      const newText = "New Text";
      mainLineTextElement.textContent = newText;

      mainLineTextElement.dispatchEvent(
        new FocusEvent("blur", { bubbles: true }),
      );

      requestAnimationFrame(() => {
        chai.expect(state.linesStore[mainLineId].text).to.equal(newText);

        const displayedText = mainLineTextElement.textContent;
        chai.expect(displayedText).to.equal(newText);
      });
    });
    setTimeout(done, 200);
  });

  it("should select all text if text length is less than 4 characters on click", function (done) {
    state.linesStore[mainLineId].text = "...";
    state.linesStore[mainLineId].linkUrl = null;
    renderLine(state.linesStore[mainLineId], true);

    const textElement = document
      .getElementById(mainLineId)
      .querySelector(".line-text");
    chai.expect(textElement.textContent).to.equal("...");

    textElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    requestAnimationFrame(() => {
      chai.expect(textElement.contentEditable).to.equal("true");
      const selection = window.getSelection();
      chai.expect(selection.toString()).to.equal("...");
      done();
    });
  });

  it("should NOT select all text if text length is 4 or more characters on click", function (done) {
    state.linesStore[mainLineId].text = "Longer Text";
    state.linesStore[mainLineId].linkUrl = null;
    renderLine(state.linesStore[mainLineId], true);

    const textElement = document
      .getElementById(mainLineId)
      .querySelector(".line-text");
    chai.expect(textElement.textContent).to.equal("Longer Text");

    textElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    requestAnimationFrame(() => {
      chai.expect(textElement.contentEditable).to.equal("true");
      const selection = window.getSelection();

      chai.expect(selection.toString()).to.not.equal("Longer Text");
      chai.expect(
        selection.isCollapsed ||
          selection.toString().length < "Longer Text".length,
      ).to.be.true;
      done();
    });
  });
});
