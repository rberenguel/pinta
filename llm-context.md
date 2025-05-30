# Pinta Project Summary

## 1. Goal of the Project

The primary goal of Pinta is to create a dynamic, web-based graphical editor. It enables the visual representation of hierarchical information, inspired by an on-paper method of drawing a main diagonal line for a central topic with perpendicular lines branching out for sub-topics. The tool aims to provide an interactive way to build, modify, and annotate these schemas. Pinta is designed as a versatile Progressive Web Application (PWA) for creating, saving, and loading these visual diagrams, complete with annotations and basic drawing capabilities.

## 2. How it Works

Pinta's functionality is centered around a few core components and interaction models:

- **Core Structure (Schema Lines):**

  - The editor initializes with a main diagonal line whose size and position are determined by the viewport. This line acts as a reference for the diagram's scale.
  - Clicking on any existing line creates a new child line. These child lines are oriented perpendicularly to their parent by storing a `relativeDirection` and dynamically calculating their display angle.
  - Text labels can be added to each line, supporting multiline input, click-to-edit, and drag-to-move functionality.
  - Line labels support dynamic font sizing, bolding, centering, and hyperlink association with prefix icons.
  - Child lines are resizable from their outer end, and their base can be dragged along the parent line.
  - The width of line text boxes is proportional to the line's length, unless the user formats with explicit newlines (Shift+Enter).

- **Annotation Tools:**

  - **Post-it Notes:** Users can create (Alt+Click or Hold on empty space), drag, edit content (including rich text like links via paste), delete, and change the color and font size of Post-it notes. Their positions are saved as percentages. This functionality is in `js/postit.js`.
  - **SVG Drawings:** An SVG layer (`drawingCanvas`) allows for drawing rectangles, highlights (selected with 'r' or 'h' keys), and arrows (selected with 'a' key). These shapes can be selected, dragged, deleted, and their color changed via keyboard shortcuts. Rectangles and highlights now automatically slope to align with the main line's inclination.

- **User Interface & Interaction:**

  - The application features a Solarized-inspired dark theme (defined in `style.css`) with a light theme toggle ('q' key).
  - `interact.js` manages drag-and-drop and resize interactions.
  - Keyboard shortcuts are central to many operations (e.g., Cmd/Ctrl+S for save, Cmd/Ctrl+O for open, Cmd/Ctrl+N for new diagram, Cmd/Ctrl+E to export to HTML).
  - Custom HTML modals are used for confirming deletions and editing links.

- **Data Management:**

  - The diagram state (lines, Post-its, SVG drawings) is saved into a single JSON file.
  - Pinta now uses IndexedDB (via `idb-keyval`) to store a handle to the last opened/saved file, allowing it to reopen the last session automatically.
  - It supports PWA file handling, allowing Pinta to open `.pnt` (custom JSON format) files directly when the PWA is launched via a file association.
  - When loading, the main line's dimensions and angle are recalculated based on the current viewport, and other elements are scaled relative to this or the editor container. Post-it and SVG drawing positions/dimensions are saved and loaded as percentages of the editor container. Child schema line properties are scaled using a `scaleFactor` derived from the main line's length change.
  - A function `openExample` allows loading a predefined example file (e.g., `example.pnt`) from the application's source, bypassing file pickers and permissions.

- **Output & Export:**
  - Diagrams can be exported to a static, self-contained HTML page. The export logic now fetches text block styles (width, white-space) from the live DOM to ensure consistency with the editor view.
  - CSS print styles are included for a black-and-white version when printing from the browser.

## 3. What We Have Been Doing Recently

Recent work has focused on enhancing features, significant refactoring for better organization, and improving file handling:

- **Feature Enhancements & Additions:**

  - **Line Label Improvements:** Enhanced with multiline text, refined click-to-edit, dynamic styling (font size, bold, alignment), and hyperlink support with prefix icons and hover/click functionality.
  - **Line Text Box Sizing:** Implemented dynamic width for line text boxes, making them proportional to the line length unless manually formatted with newlines.
  - **SVG Rect/Highlight Rotation:** Rectangles and highlights now automatically rotate to align with the main line's slope.
  - **Child Line Clipping:** New child lines are now clipped to prevent their default length from extending beyond screen boundaries and to avoid intersecting other existing lines (with a small padding).

- **File Handling Overhaul:**

  - Integrated `idb-keyval` to store the last used file handle in IndexedDB, enabling automatic reopening of the last session.
  - Implemented PWA launch queue handling to open associated files (e.g., `.pnt`) when the PWA is launched with a file.
  - Added a `Cmd/Ctrl + N` shortcut for creating a new diagram, which also clears the last saved file handle.
  - Developed an `openExample` function to load a bundled example file directly.
  - Refined file type definitions for `showOpenFilePicker` to correctly handle custom `.pnt` extensions for JSON content.

- **Codebase Refactoring (Modularization):**

  - Broke down the monolithic `pinta.js` into smaller ES6 modules (`js/state.js`, `js/text.js`, `js/drawing.js`, `js/postit.js`, `js/lines.js`, `js/files.js`, `js/delete.js`).
  - Centralized application state into `js/state.js`.

- **Core Line Logic Refactor:**

  - Changed how child line orientation is handled to use a `relativeDirection` property, with the display angle calculated dynamically. This improves responsiveness to screen size changes.

- **Bug Fixing & Robustness:**
  - Improved error handling around asynchronous operations and in the application's startup sequence.
  - Corrected issues in the segment intersection logic for line collision detection.
  - Ensured HTML export reflects dynamic text block widths accurately by fetching styles from the live DOM.
