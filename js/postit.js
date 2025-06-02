import {
  state,
  editorContainer,
  POSTIT_VALID_COLORS,
  POSTIT_DEFAULT_COLOR,
  deleteModalMessage,
  deleteModal,
  resetDrawing,
} from "./state.js";

export { createPostIt, deletePostIt };

function createPostIt(noteData = {}) {
  const id = noteData.id || `postit-${state.postItIdCounter++}`;
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
  if (noteData.styleLeft !== undefined) {
    postItElement.style.left = noteData.styleLeft;
  } else if (noteData.xPercent !== undefined && editorRect.width > 0) {
    postItElement.style.left = `${
      (noteData.xPercent / 100) * editorRect.width
    }px`;
  } else {
    postItElement.style.left = noteData.left || "10px";
  }

  if (noteData.styleTop !== undefined) {
    postItElement.style.top = noteData.styleTop;
  } else if (noteData.yPercent !== undefined && editorRect.height > 0) {
    postItElement.style.top = `${
      (noteData.yPercent / 100) * editorRect.height
    }px`;
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
  deleteBtn.addEventListener("click", handleDeletePostIt);
  postItElement.appendChild(deleteBtn);

  const contentArea = document.createElement("div");
  contentArea.classList.add("postit-content-area");
  contentArea.innerHTML = noteData.content || "";
  contentArea.contentEditable = "true";
  const fontSizePercent = noteData.fontSizePercent || 100;
  contentArea.style.fontSize = `${fontSizePercent}%`;
  contentArea.dataset.fontSizePercent = fontSizePercent;

  contentArea.addEventListener("blur", () => {
    if (state.postItsStore[id])
      state.postItsStore[id].content = contentArea.innerHTML;
  });
  contentArea.addEventListener("keydown", (e) =>
    handlePostItKeyDown(e, postItElement, contentArea),
  );
  contentArea.addEventListener("paste", (e) =>
    handlePostItPaste(e, contentArea),
  );

  postItElement.appendChild(contentArea);
  editorContainer.appendChild(postItElement);

  interact(postItElement)
    .draggable({
      allowFrom: ".postit-drag-handle",
      inertia: true,
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
          endOnly: true,
        }),
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
          if (state.postItsStore[noteId]) {
            const currentEditorRect = editorContainer.getBoundingClientRect();
            if (currentEditorRect.width > 0) {
              state.postItsStore[noteId].xPercent =
                (parseFloat(target.style.left) / currentEditorRect.width) * 100;
            }
            if (currentEditorRect.height > 0) {
              state.postItsStore[noteId].yPercent =
                (parseFloat(target.style.top) / currentEditorRect.height) * 100;
            }
          }
        },
      },
    })
    .styleCursor(false);

  if (!state.postItsStore[id]) {
    const editorRectForStore = editorContainer.getBoundingClientRect();
    state.postItsStore[id] = {
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
  } else {
    state.postItsStore[id].title = dragHandle.textContent || "";
    state.postItsStore[id].content = contentArea.innerHTML;
    state.postItsStore[id].color = postItElement.dataset.color;
    state.postItsStore[id].fontSizePercent =
      parseFloat(contentArea.dataset.fontSizePercent) || 100;
  }

  const numId = parseInt(id.split("-")[1]);
  if (!isNaN(numId) && numId >= state.postItIdCounter) {
    state.postItIdCounter = numId + 1;
  }
  return postItElement;
}

function handlePostItKeyDown(e, postItElement, contentArea) {
  let preventDefault = false;
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.key.toLowerCase() === "g") {
    e.preventDefault();
    e.stopPropagation();
    state.isWaitingForColorKey = true;
    return;
  }
  if (state.isWaitingForColorKey) {
    if (e.key === "Escape") {
      state.isWaitingForColorKey = false;
      e.preventDefault();
      return;
    }
    const colorMap = {
      y: "yellow",
      r: "red",
      g: "green",
      b: "blue",
      w: "white",
      t: "transp-0",
      tt: "transp-1", // Dummies
      ttt: "transp-2", // Dummies
    };
    const key = e.key.toLowerCase();
    if (colorMap[key]) {
      state.isWaitingForColorKey = false;
      preventDefault = true;
      let newColor = colorMap[e.key.toLowerCase()];
      if (
        postItElement.classList.contains("postit-color-transp-0") &&
        key == "t"
      ) {
        newColor = "transp-1";
      }
      if (
        postItElement.classList.contains("postit-color-transp-1") &&
        key == "t"
      ) {
        newColor = "transp-2";
      }
      if (
        postItElement.classList.contains("postit-color-transp-2") &&
        key == "t"
      ) {
        newColor = "transp-0";
      }
      POSTIT_VALID_COLORS.forEach((c) =>
        postItElement.classList.remove(`postit-color-${c}`),
      );
      postItElement.classList.add(`postit-color-${newColor}`);
      postItElement.dataset.color = newColor;
      if (state.postItsStore[postItElement.id])
        state.postItsStore[postItElement.id].color = newColor;
    }
  }
  if (isCtrlOrCmd) {
    if (e.key === "." || e.key === ",") {
      preventDefault = true;
      let currentPercent =
        parseFloat(contentArea.dataset.fontSizePercent) || 100;
      let increment = 10;
      let newPercent =
        e.key === "." ? currentPercent + increment : currentPercent - increment;
      newPercent = Math.max(50, Math.min(200, newPercent));
      contentArea.style.fontSize = newPercent + "%";
      contentArea.dataset.fontSizePercent = newPercent;
      if (state.postItsStore[postItElement.id])
        state.postItsStore[postItElement.id].fontSizePercent = newPercent;
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
      if (state.postItsStore[contentArea.closest(".post-it").id]) {
        state.postItsStore[contentArea.closest(".post-it").id].content =
          contentArea.innerHTML;
      }
    } catch (domError) {
      console.error("Error creating link on paste:", domError);
      document.execCommand("insertText", false, pastedText);
    }
  }
}

function deletePostIt(postItId) {
  const postItElement = document.getElementById(postItId);
  if (postItElement) postItElement.remove();
  delete state.postItsStore[postItId];
}

function handleDeletePostIt(event) {
  state.itemToDeleteId = event.target.dataset.itemId;
  state.itemTypeToDelete = event.target.dataset.itemType;
  let itemName = "this item";
  if (state.itemTypeToDelete === "postit") {
    const postIt = state.postItsStore[state.itemToDeleteId];
    if (!postIt) return;
    itemName = `the note "${postIt.title || "untitled"}"`;
  } else return;
  let message = `Are you sure you want to delete ${itemName}?`;
  message += " This action cannot be undone.";
  deleteModalMessage.textContent = message;
  deleteModal.style.display = "flex";

  resetDrawing(state);
}
