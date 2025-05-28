### 1. Goal of the Project

The primary goal of Pinta is to create a dynamic, web-based graphical editor that allows for the visual representation of hierarchical information [project description in first user turn of this session]. It's inspired by an on-paper method of drawing a main diagonal line for a central topic, with perpendicular lines branching out for sub-topics. The tool aims to provide an interactive way to build, modify, and annotate these schemas. Ultimately, Pinta is designed to be a versatile Progressive Web Application (PWA) for creating, saving, and loading these visual diagrams, complete with annotations and basic drawing capabilities [project description in first user turn of this session].

### 2. How it Works

Pinta's functionality is centered around a few core components and interaction models, primarily managed within `pinta.js` and its stylesheet `style.css`:

- **Core Structure (Schema Lines):**

  - The editor initializes with a main diagonal line whose size and position are determined by the viewport. This line acts as a reference for the diagram's scale, especially when loading [project description in first user turn of this session].
  - Clicking on any existing line creates a new child line. These child lines are oriented perpendicularly to their parent by storing a `relativeDirection` (`1` or `-1`) and dynamically calculating their display angle based on the parent's current angle. This system was a recent refactor to improve responsiveness to screen resizing.
  - Text labels can be added to each line. These labels support multiline input (Shift+Enter) and are editable. The text can be dragged along its line, and its perpendicular offset can be adjusted [project description in first user turn of this session, and subsequent feature additions].
  - Line labels now also support dynamic font sizing (Ctrl/Cmd + `.` or `,`), bolding (Ctrl/Cmd + `B`), and centering toggles (Ctrl/Cmd + `C`).
  - Hyperlinks can be associated with line labels (via Ctrl/Cmd + `K`), displaying a prefix icon (e.g., 🔗, 📜) based on the URL content. The icon is clickable, opening the link in a new tab, and the full URL appears on hover [project description in first user turn of this session, and subsequent feature additions].
  - Child lines are resizable from their outer end and their base can be dragged along their parent line [project description in first user turn of this session].

- **Annotation Tools:**

  - **Post-it Notes:** Users can create (Alt+Click or Hold on empty space), drag, edit content (including rich text like links via paste), delete, and change the color and font size of Post-it notes. Their positions are saved as percentages of the editor container [project description in first user turn of this session, and subsequent feature additions]. The Post-it functionality has been moved to its own module, `js/postit.js`.
  - **SVG Drawings:** An SVG layer (`drawingCanvas`) allows for basic freehand drawings:
    - Rectangles and Highlights (selected with 'r' or 'h' keys).
    - Arrows (selected with 'a' key).
    - These shapes can be selected, dragged, deleted, and their color can be changed using keyboard shortcuts ('c' then a color key) [project description in first user turn of this session].

- **User Interface & Interaction:**

  - The application uses a Solarized-inspired dark theme defined in `style.css`.
  - `interact.js` is used for managing drag-and-drop and resize interactions.
  - Keyboard shortcuts are central to many operations: Cmd/Ctrl+S (save), Cmd/Ctrl+O (load), and letter keys for selecting drawing tools or activating color change mode.
  - Custom HTML modals are used for confirming deletions and editing links. Deleting a parent schema line also deletes its children.

- **Data Management:**

  - The entire diagram state (schema lines, post-its, SVG drawings) is saved into a single JSON file [project description in first user turn of this session, and subsequent feature additions].
  - When loading a diagram, the main line's dimensions and angle are recalculated based on the current viewport. Other elements like child lines, SVG drawings, and Post-it notes are scaled or positioned relative to this, ensuring diagrams adapt visually to different window sizes [project description in first user turn of this session, and subsequent feature additions].

- **Output & Print:**
  - The project description mentions a "Print to HTML" option for exporting a static, self-contained HTML page [project description in first user turn of this session].
  - CSS print styles are included for printing directly from the browser, rendering a clean black-and-white version.

### 3. What We Have Been Doing Recently

Our recent work has focused on enhancing existing features, adding new capabilities (especially to line labels), and significantly refactoring the codebase for better organization and maintainability:

- **Feature Enhancements & Additions:**

  - **Line Label Improvements:**
    - Enabled multiline text input for line labels using Shift+Enter.
    - Refined click-to-edit behavior: short labels get fully selected, while for longer labels, a click now positions the cursor for easier partial edits.
    - Added dynamic styling: font size adjustment (Ctrl/Cmd + `.` or `,`), bold toggle (Ctrl/Cmd + `B`), and text alignment toggle (Ctrl/Cmd + `C`).
    - Implemented hyperlink support: Ctrl/Cmd + `K` opens a modal to add/edit/remove a URL. Linked labels display a prefix icon (e.g., 🔗, 📜 based on URL patterns), show the URL on hover, and the icon is clickable to open the link in a new tab.
  - **Core Line Logic Refactor:** A major change was made to how line orientation is handled. Instead of storing absolute angles for child lines, we now store a `relativeDirection` property. The actual display angle is calculated dynamically at render time based on the parent's angle and this relative direction. This makes the diagram more responsive to screen size changes and maintains relational integrity better. This involved creating a `getLineDisplayAngle` helper function and updating all relevant line creation, rendering, interaction (resize, drag), and save/load logic.

- **Codebase Refactoring (Modularization):**

  - We've started breaking down the monolithic `pinta.js` file into smaller, more focused ES6 modules.
  - **`js/state.js`:** Created to centralize all mutable application state. It exports a single `state` object (e.g., `state.linesStore`, `state.lineIdCounter`, `state.drawingCanvas`) that is imported and used by `pinta.js`. This file also now exports true constants (like `SVG_NS`, `LINK_SYMBOL_MAP`) and stable DOM element references (like `editorContainer`) that were previously in `pinta.js`.
  - **`js/textUtils.js`:** Created to house text-related utility functions. `getLinkPrefix` was moved here.
  - **`js/drawingUtils.js`:** Created for drawing-related utility functions. `getDrawingColorValue` was moved here.
  - **`js/postit.js`:** All functionality related to Post-it notes (creation, deletion, event handling for content, drag-and-drop, and UI listeners for creating new Post-its) has been encapsulated in this module.
  - The main `pinta.js` file now imports these modules and coordinates the application, and `index.html` loads `pinta.js` as `type="module"`.

- **Bug Fixing:**
  - Addressed an issue where grandchild lines were not rendering correctly after the line angle refactor. This was fixed by ensuring `handleVisualClick` used the correct dynamic display angle of the parent line when calculating the new child's position.

The overall aim of these recent activities has been to enhance Pinta's capabilities, improve its core rendering logic for better adaptability, and make the codebase more modular and easier to maintain for future development.
