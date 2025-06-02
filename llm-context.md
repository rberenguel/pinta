# Pinta Project Summary

## 1. Goal of the Project

The primary goal of Pinta is to create a dynamic, web-based graphical editor for visualizing hierarchical information. It's inspired by an on-paper method using a main diagonal line for a central topic and perpendicular branching lines for sub-topics. Pinta aims to be an interactive tool to build, modify, and annotate these schemas, designed as a versatile Progressive Web Application (PWA) for creating, saving, and loading these diagrams with annotations and basic drawing features.

## 2. How it Works

Pinta's functionality, primarily managed in `pinta.js` and `style.css`, revolves around several core components:

* **Core Structure (Schema Lines):**
    * Initializes with a main diagonal line scaled to the viewport.
    * Clicking a line creates a child line oriented perpendicularly.
    * Line labels are editable, support multiline input, dynamic styling (font size, bold, alignment, color), hyperlink support, and can be marked as tasks with checkboxes.
    * Child lines are resizable, and their base can be dragged along the parent line. Line color and thickness can be changed with keyboard shortcuts while hovering.

* **Annotation Tools:**
    * **Post-it Notes:** Can be created (Alt+Click or Hold Click), dragged, edited (rich text, links), deleted, and their color/font size changed. Positions are saved relative to the main line.
    * **SVG Drawings:** An SVG layer supports drawing rectangles, highlights, and arrows. These can be selected, dragged, deleted, and their colors changed via keyboard shortcuts.

* **User Interface & Interaction:**
    * Uses a Solarized-inspired dark theme (with a toggle for a light theme, `q` key).
    * Extensive keyboard shortcuts for many operations (Help via `?` key).
    * `interact.js` manages drag-and-drop and resizing.
    * Custom HTML modals for confirmations and link editing.

* **Data Management:**
    * Diagram state is saved as a single JSON file (`.pnt`) or a Markdown-like format (`.md`).
    * On load, elements are scaled/positioned relative to the main line, which adapts to the current viewport.
    * Supports PWA file handling for `.pnt` files and remembers the last opened `.pnt` file for quick reloading.

* **Output & Print:**
    * Can export diagrams to static, self-contained HTML (which also embeds the diagram data for re-import).
    * Includes CSS for clean black-and-white printing.

## 3. What We Have Been Doing Recently

Recent development has focused on enhancing data portability, editing flexibility, and refining the positioning logic of diagram elements, particularly for responsiveness to viewport changes:

1.  **Relative Positioning for Annotations and Drawings:**
    * **Post-it Notes:** Modified to save and load their positions relative to the main schema line (using `offsetRatioOnMainLine` and `perpDistRatioFromMainLine` normalized by the main line's length, along with `savedWidth` and `savedHeight`) rather than absolute or editor-percentage-based coordinates. This ensures they maintain their intended placement relative to the core diagram structure when the viewport size changes between sessions. The window resize handler in `pinta.js` was updated to correctly reposition Post-its using this relative data.
    * **Arrows:** Similar to Post-its, arrow start and end points (`x1, y1, x2, y2`) are now saved and loaded using `x1OffsetRatio`, `y1PerpDistRatio`, `x2OffsetRatio`, and `y2PerpDistRatio` relative to the main line. The loading logic in `js/files.js` and the resize handler in `pinta.js` were updated to calculate absolute positions from these ratios based on the current main line's geometry.
    * **Rectangles and Highlights:** These drawing elements also had their `toSaveData` methods (in `js/drawing.js`) and corresponding loading/resizing logic (in `js/files.js` and `pinta.js`) updated. Their top-left corner (`x`, `y`) is stored as relative offsets (`xOffsetRatio`, `yPerpDistRatio`), and their dimensions (`width`, `height`) are stored as ratios (`widthRatio`, `heightRatio`) of the main line's length.

2.  **Markdown Import/Export Functionality:**
    * Implemented functions (`pintaJsonToMarkdown` and `pintaMarkdownToJson` in `js/files.js`) to convert Pinta's internal JSON diagram data to a human-readable, Markdown/YAML-like format and vice-versa.
    * The Markdown format uses headings for lines (e.g., `# Main Topic`, `## Sub-Topic`) to imply hierarchy, and lists properties as `- key: value`. Drawings and Post-its are in separate sections delineated by `---`.
    * Saving and loading logic in `js/files.js` was updated to dispatch based on file extension (`.pnt` for JSON, `.md` for the new Markdown format).

3.  **Improved Loading of "Bare-bones" Markdown:**
    * Enhanced the `pintaMarkdownToJson` parser and the `_processLoadedDiagramData` function to handle Markdown files that only define line titles (headings) without explicit properties like `length`.
    * Child lines created from such minimal Markdown now receive a default length calculated based on their parent line's current length and their depth in the hierarchy (similar to the logic in `addNewChildLine`). The sign of this default length is determined by the `relativeDirection` (which the parser defaults to alternating).
    * A new `autoPositionHint` was added by the Markdown parser to flag implicitly positioned children. The loading logic (`adjustChildrenLayoutForEvenSplit` in `js/files.js`) uses this hint to evenly distribute children along their parent line if *all* children of that parent were implicitly positioned.

4.  **Bug Fixes and Refinements:**
    * Addressed issues in the window resize handler in `pinta.js` to ensure arrows, rectangles, and highlights (along with post-its) correctly re-calculate their absolute positions based on their new relative-to-mainline data, preventing them from disappearing or being misplaced on resize.
    * Corrected depth calculation for lines being loaded from Markdown to ensure default lengths are based on the accurate depth of the line being processed.