/**
 * js/viewport.js
 * Handles zooming and panning functionality for the editor container.
 * Updated for smooth panning performance.
 */

// A self-invoking function to set everything up without polluting the global scope.
(() => {
  // Check if the script has already been initialized
  if (window.pintaViewportInitialized) {
    return;
  }
  window.pintaViewportInitialized = true;

  // --- State ---
  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;
  let isPanning = false;
  let isTransformDirty = false;
  let editorContainer = null;

  /**
   * Exposes the current viewport state to other modules.
   */
  window.getViewportState = () => ({
    scale: scale,
  });

  /**
   * Resets the viewport to the default scale and position.
   */
  function resetViewport() {
    scale = 1.0;
    translateX = 0;
    translateY = 0;
    isTransformDirty = true;
  }
  window.resetViewport = resetViewport;

  /**
   * Applies the current transform state to the editor container element.
   */
  function applyTransform() {
    if (!editorContainer) return;
    editorContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    isTransformDirty = false;
  }

  /**
   * The animation loop. Runs on every frame to apply transforms smoothly.
   */
  function animationLoop() {
    if (isTransformDirty) {
      applyTransform();
    }
    requestAnimationFrame(animationLoop);
  }

  /**
   * Handles the wheel event for zooming.
   */
  function handleWheelZoom(e) {
    if (!e.shiftKey) return;
    e.preventDefault();

    const editorRect = editorContainer.getBoundingClientRect();
    const oldScale = scale;

    const scaleAmount = e.deltaX * -0.001;
    let newScale = scale + scaleAmount;

    newScale = Math.max(1.0, Math.min(5, newScale));

    if (newScale <= 1.0) {
      resetViewport();
    } else {
      const mouseX = e.clientX - editorRect.left;
      const mouseY = e.clientY - editorRect.top;
      scale = newScale;
      translateX = mouseX - (mouseX - translateX) * (scale / oldScale);
      translateY = mouseY - (mouseY - translateY) * (scale / oldScale);
    }

    isTransformDirty = true;
  }

  /**
   * Starts the panning operation.
   */
  function handlePanStart(e) {
    if (e.shiftKey && scale > 1.0) {
      isPanning = true;
      editorContainer.style.cursor = "grabbing";
      // Disable transition for immediate, responsive panning
      editorContainer.style.transition = "none";
    }
  }

  /**
   * Handles the mouse movement during panning.
   */
  function handlePanMove(e) {
    if (isPanning && e.shiftKey) {
      translateX += e.movementX;
      translateY += e.movementY;
      // Mark the transform as dirty, but let the animation loop handle the update.
      isTransformDirty = true;
    } else if (isPanning) {
      isPanning = false;
      editorContainer.style.cursor = "default";
      // Re-enable transition when panning stops
      editorContainer.style.transition =
        "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    }
  }

  /**
   * Ends the panning operation.
   */
  function handlePanEnd(e) {
    if (isPanning) {
      isPanning = false;
      editorContainer.style.cursor = "default";
      // Re-enable transition when panning stops
      editorContainer.style.transition =
        "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    }
  }

  /**
   * Initializes the viewport logic once the DOM is ready.
   */
  function initialize() {
    editorContainer = document.getElementById("editor-container");
    if (editorContainer) {
      document.body.addEventListener("wheel", handleWheelZoom, {
        passive: false,
      });
      editorContainer.addEventListener("mousedown", handlePanStart);
      window.addEventListener("mousemove", handlePanMove);
      window.addEventListener("mouseup", handlePanEnd);
      // Start the animation loop
      animationLoop();
    } else {
      console.error("Pinta Viewport: #editor-container not found.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
