# Pinta

> #### Pinta (Catalan; noun):
>
> **Comb**: A toothed instrument for arranging hair.
>
> **Appearance/Look**: Often used in the expression _tenir bona pinta_, meaning _to look good_ or _to have a good appearance._

The name was chosen because the outline diagrams can somewhat resemble a comb and, fittingly, are designed to _tenir bona pinta_ – to look reasonably good (for my tastes).

---

Outline editor, written by me and Gemini.

---

Why? _Reasons_. Mostly I keep writing text editors and outline tools to avoid doing some writing I have to do. I think this is the 6th.

You can find an intro video (YouTube) [here](https://www.youtube.com/watch?v=KDMp6_hqPv0). Make sure to switch to HD,
otherwise it is hard to read.

## What is Pinta?

Pinta is a dynamic, web-based outlining tool that allows you to create and organize ideas visually. It combines the hierarchical structure of an outliner with the flexibility of a mind-mapper, enabling you to draw connections between concepts, add notes, and manage tasks directly on an interactive canvas. It supports keyboard-driven operations for speed and efficiency, and allows exporting your diagrams to static HTML.

It is based on a diagram I saw on the (otherwise pretty bad and not recommended at all) book [The Evelyn Wood Seven-Day Speed Reading and Learning Program](https://app.thestorygraph.com/books/ea7b3c0c-3ea2-4385-9391-3726181bbb4e). If you enjoy mind-mapping but frown curved lines or "the mess" one can become, you may like this instead.

## How it looks

This is the main "example" which also serves as feature list. This is the state of the example
as of version 0.6.2..

![](https://raw.githubusercontent.com/rberenguel/pinta/gh-pages/media/pinta-example-dark.png)

You can see how the HTML export looks (for dark mode) [here](http://mostlymaths.net/pinta/media/pinta-example-dark.html).

It also has a light mode.

![](https://raw.githubusercontent.com/rberenguel/pinta/gh-pages/media/pinta-example-light.png)

You can see how the HTML export looks (for light mode) [here](http://mostlymaths.net/pinta/media/pinta-example-light.html).

The HTML file can also be loaded and contains a valid diagram (embedded as a comment). The HTML export has a CSS-only
toggle between light and dark modes, you can export your preferred one but the reader can choose.

---

You can press `?` to get help (on how to use this, I'm a doctor
but I'm not your doctor or that kind of doctor).

## Key Features

- **Hierarchical Outlines**: Create parent-child relationships between ideas (lines).
- **Text Labels**: Add and style text labels for each line, including bold, font size, and color.
- **Checkboxes/Tasks**: Mark lines as tasks with interactive checkboxes.
- **Links**: Embed hyperlinks within line labels.
- **Post-It Notes**: Add draggable and editable post-it notes for additional information.
- **Partial Freeform Drawing**: Sketch directly on the canvas to add arrows, rectangles or highlights.
- **Themes**: Switch between light and dark themes.
- **Save & Load**: Save diagrams to your filesystem and load them back. Last opened diagram reopens when starting Pinta.
- **Static HTML Export**: Export your diagram to a fully self-contained HTML file (which has the real diagram embedded and can be opened in Pinta).
- **Keyboard Shortcuts**: Extensive keyboard support for most operations.

## How to Use Pinta

### General

- **Toggle Theme**: Press `q` (dark/light).
- **Save Diagram**: Press `Ctrl/Cmd + S`
- **Load Diagram**: Press `Ctrl/Cmd + O`
- **Export to HTML**: Press `Ctrl/Cmd + E`.
- **New Diagram (Clear Canvas)**: `Ctrl/Cmd + P` to open the command palette and select (or type) `New`.
- **Toggle Help**: Press `?` .

### Lines (Schema)

- **Create Main Line**: This is fixed and comes for free.
- **Create Child Line**: Click on an existing line's visual bar. The new child line will sprout perpendicularly.
  - The orientation (90-degree turn) and initial direction (positive/negative length) of new child lines attempt to follow the characteristics of their preceding sibling.
- **Select Line**: Hover over a line's visual bar or text.
- **Resize Line**: Drag the handle at the end of a child line.
  - Dragging the handle through the line's origin (making its length negative) will flip its direction.
- **Move Line Root**: Drag the handle at the start of a child line (where it connects to the parent).
- **Change Line Visual Color**: While hovering over a line's visual bar, press a color key (e.g., `r` for red, `b` for blue, `d` for default). See help modal or example diagram for all colors.
- **Change Line Thickness**: While hovering over a line's visual bar, press `Ctrl/Cmd + .` (increase) or `Ctrl/Cmd + ,` (decrease).
- **Toggle Checkbox**: Press `T` when hovering to convert the label into a checkbox label. Click the checkbox to toggle its checked state. The checkbox border and fill color will match the text color. Checked tasks have their text struck through.
- **Delete Line**: Click the 'X' button that appears near a child line's text when hovered, or select a line element and press `Delete` or `Backspace`.

### Line Labels (Text Editing)

- **Edit Text**: Click on a line's text label.
- **Stop Editing**: Press `Enter` (without Shift) or `Escape`, or click outside the text area.
- **Add Newline**: Press `Shift + Enter` while editing.
- **Text Styling (while editing text)**:
  - **Change Text Color**: Press `Ctrl/Cmd + G`, then a color key.
  - **Bold**: Press `Ctrl/Cmd + Shift + B`.
  - **Increase Font Size**: Press `Ctrl/Cmd + .` (period).
  - **Decrease Font Size**: Press `Ctrl/Cmd + ,` (comma).
  - **Toggle Centered Text**: Press `Ctrl/Cmd + C`.
  - **Add/Edit Link**: Press `Ctrl/Cmd + K`.
- **Move Text Label**: Drag the text label itself. It is bound to the line, it can not go too far from it.

### Post-It Notes

- **Create Post-It**: Click and hold on an empty area of the canvas.
- **Edit Post-It Content**: Click on the content area of the post-it.
- **Move Post-It**: Drag its upper area.
- **Change Post-It Color**: While editing its text, press `Ctrl/Cmd + G`, then a color key (applies to background, less options than with lines).
- **Delete Post-It**: Click the 'X' button on the post-it.

### Drawing Mode

- **Change Drawing Color**: Press `c` while the diagram has been clicked / no line is hovered, then press a color key (e.g., `r` for red, `b` for blue). The new color will affect the next drawing items.
- **Arrows**: Press `a` and drag.
- **Rectangles**: Press `r` and drag.
- **Highlight blockse**:Press `h` and drag.
- **Select drawn items**: Press `s` and click on arrows/rectangles/highlights. They will get a shadow once selected, selecting arrows is tricky (you need to click the stem, not the head). `Backspace` to delete, drag to move. Color can be changed on selected elements as above.

> [!TIP]
> If you end up with a broken arrow or something you can't edit easily in the editor, the saved file is plain JSON (extension `.pnt` is just for convenience). You can edit its content with a text editor and fix any such inconsistencies, the structure should be pretty clear to read.

---

## TODO (Next Steps)

- [ ] Better UX of shape selection (e.g. explicit selection state).
  - This is harder than it looks…
- [ ] Add the ellipse tool.
- [ ] Hover on line is a bit annoying because it does not trigger properly when hovering on the delete button or handles. This is eventually annoying.
- [ ] Subset iconoir icons

---

## Changelog

### 0.6.3

- Add icons from [iconoir](https://iconoir.com/) by adding :icon-name: at the beginning of your label

### 0.6.2

- CSS-only toggle on HTML export to switch light/dark modes
- Minor tweaks, added icons

### 0.6.1

- Bug fix with pasting
- Changed icons

### 0.6.0

- Copy and paste of pieces of the schema.
- Changed color interaction for text (no longer modal).
- Added some keyboard tools to resize and reposition without needing hover and move so often.

### 0.5.0 (internal representation changes)

- Tweaking of the markdown export/import, simplifying it
- Internal representation change. It could affect saved diagrams (there is no autoconversion):
  - Tasks may disappear (the whole checkbox and its state have changed)
  - Line colors (and default line colors, the internal representation has been changed)

### 0.4.0

- Fix positioning of drawn elements.
- Alternate saving format, markdown-like.
- Which means it can load header-only outlines just fine, like the example in `SW.md`.
  - It won't look particularly pretty on first load, but it tries to fit everything so you can drag and resize stuff

### 0.3.6 (skipped release)

- Three translucent levels (`Ctrl-g + t` in post it).
- Hover + delete on lines. Enter now confirms deletion modal.
- Cmd and Ctrl work now for all text commands (broke this at some point and only Ctrl worked).
- Fix issue with save notification.

### 0.3.5

- Post it positioning is now relative to the mainline, making it scale to different screens.

### 0.3.4

- Added tasks to lines as "color" (hover and press `t`).
- If a child line is a task, any future siblings will also be tasks.
- Try to remember last sibling orientation (WIP, currently failing the clip checks).
