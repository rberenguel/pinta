# Pinta Project Summary

## 1. Goal of the Project

The primary goal of Pinta is to create a dynamic, web-based graphical editor for visualizing hierarchical information. It's inspired by an on-paper method using a main diagonal line for a central topic and perpendicular branching lines for sub-topics. Pinta aims to be an interactive tool to build, modify, and annotate these schemas, designed as a versatile Progressive Web Application (PWA) for creating, saving, and loading these diagrams with annotations and basic drawing features.

## 2. How it Works

Pinta's functionality, primarily managed in `pinta.js` and `style.css`, revolves around several core components:

- **Core Structure (Schema Lines):**

  - Initializes with a main diagonal line scaled to the viewport, serving as a reference.
  - Clicking a line creates a child line oriented perpendicularly, using a `relativeDirection` property and dynamic angle calculation.
  - Line labels are editable, support multiline input, can be dragged, and their perpendicular offset adjusted. They also feature dynamic font sizing, bolding, centering, and hyperlink support with prefix icons.
  - Child lines are resizable and their base can be dragged along the parent line.

- **Annotation Tools:**

  - **Post-it Notes:** Can be created, dragged, edited (with rich text), deleted, and their color/font size changed. Positions are saved as percentages. Functionality is in `js/postit.js`.
  - **SVG Drawings:** An SVG layer supports drawing rectangles, highlights, and arrows. These can be selected, dragged, deleted, and their colors changed via keyboard shortcuts.

- **User Interface & Interaction:**

  - Uses a Solarized-inspired dark theme with keyboard shortcuts for many operations.
  - `interact.js` manages drag-and-drop and resizing.
  - Custom HTML modals are used for confirmations and link editing.

- **Data Management:**

  - The entire diagram state is saved as a single JSON file.
  - On load, elements are scaled/positioned relative to the main line, which adapts to the current viewport.

- **Output & Print:**
  - Can export diagrams to static, self-contained HTML.
  - Includes CSS for clean black-and-white printing from the browser.

## 3. What We Have Been Doing Recently

To make Post-it note positions relative to the main line, the following changes were implemented:

### 1. Data Storage for Post-it Notes:

- **Previous method:** Post-it positions were stored as `xPercent` and `yPercent`, representing their top-left corner's percentage-based offset within the main editor container.
- **New method (on save):**
  - The Post-it's center coordinates are now calculated relative to the main line's start point and orientation.
  - Two new ratios are stored in the `postIts` object within the saved JSON data:
    - `offsetRatioOnMainLine`: The projected distance of the Post-it's center along the main line's axis, normalized by the main line's current length.
    - `perpDistRatioFromMainLine`: The perpendicular distance of the Post-it's center from the main line, also normalized by the main line's current length.
  - The Post-it's actual `offsetWidth` and `offsetHeight` at the time of saving are stored as `savedWidth` and `savedHeight`.
  - The old `xPercent` and `yPercent` properties are removed from the saved data for Post-its if the new relative positioning is successful.

### 2. Saving Process (`js/files.js` - `getCurrentDiagramDataForSave`):

- When a diagram is saved, for each Post-it note:
  1.  Its current absolute center pixel coordinates (cx, cy) are determined, taking into account its `style.left`, `style.top`, `offsetWidth`, `offsetHeight`, and any active drag translations (`data-x`, `data-y`).
  2.  The main line's current geometry (start coordinates, angle, and length) is retrieved from `state.linesStore`.
  3.  A vector from the main line's start to the Post-it's center is calculated.
  4.  This vector is projected onto the main line's axis and its perpendicular axis.
  5.  These projected distances are then divided by the main line's length to get `offsetRatioOnMainLine` and `perpDistRatioFromMainLine`.
  6.  The Post-it's current `offsetWidth` and `offsetHeight` are also saved.

### 3. Loading Process (`js/files.js` - `_processLoadedDiagramData`):

- When a diagram is loaded:
  1.  The main line is reconstructed first, based on the current viewport dimensions. Its new `startX`, `startY`, `length`, and `angle` are determined.
  2.  For each Post-it note from the saved data:
      - The saved `offsetRatioOnMainLine`, `perpDistRatioFromMainLine`, `savedWidth`, and `savedHeight` are used.
      - The absolute distance along the _current_ main line and the perpendicular distance are calculated by multiplying the ratios with the _current_ main line's length.
      - These distances are used to determine the target center coordinates (`targetCenterX`, `targetCenterY`) of the Post-it relative to the current main line.
      - The top-left coordinates (`styleLeft`, `styleTop`) for the Post-it are then calculated using `targetCenterX - savedWidth / 2` and `targetCenterY - savedHeight / 2`.
      - This `noteData` (now including `styleLeft` and `styleTop`) is passed to `createPostIt`.

### 4. Post-it Creation (`js/postit.js` - `createPostIt`):

- The `createPostIt` function was updated to prioritize using `noteData.styleLeft` and `noteData.styleTop` (pixel values) for positioning if they are provided (which they will be during the loading process).
- If these direct style properties are not available (e.g., when a new Post-it is created via user interaction, or for backward compatibility with old files), it falls back to using `noteData.xPercent`/`yPercent` or default pixel values.
- When a Post-it is loaded, `_processLoadedDiagramData` populates `state.postItsStore` with the original loaded data (including the relative ratios and saved dimensions) before `createPostIt` is called. `createPostIt` then uses the calculated `styleLeft`/`styleTop` for DOM positioning but ensures the core data in `state.postItsStore` retains the relative positioning information for subsequent saves.

This ensures that Post-it notes maintain their position relative to the diagram's main structural element (the main line) when a file is saved and reloaded, regardless of changes in viewport size between sessions.

- **Feature Enhancements & Additions:**

  - **Line Label Improvements:** Added multiline input, refined click-to-edit, dynamic styling (font size, bold, alignment), and hyperlink support with clickable prefix icons.
  - **Core Line Logic Refactor:** Changed line orientation to use a `relativeDirection` property with dynamic angle calculation at render time for better responsiveness. This involved creating `getLineDisplayAngle` and updating relevant logic.

- **Codebase Refactoring (Modularization):**

  - Began breaking down the main `pinta.js` into smaller ES6 modules.
  - **`js/state.js`:** Centralizes mutable application state, constants, and stable DOM references.
  - **`js/textUtils.js` (now `js/text.js` based on other files):** For text-related utilities like `getLinkPrefix`.
  - **`js/drawingUtils.js` (now `js/drawing.js`):** For drawing utilities.
  - **`js/postit.js`:** Encapsulates all Post-it note functionality.
  - `pinta.js` now imports these modules, and `index.html` loads it as a module.

- **Bug Fixing:**
  - Resolved an issue with grandchild line rendering after the line angle refactor.
