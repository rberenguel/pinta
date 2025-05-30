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

Recent efforts focused on feature enhancements, core logic refactoring, and codebase modularization:

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
