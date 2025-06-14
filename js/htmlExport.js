export { exportToStaticHTML };

import { getCurrentDiagramDataForSave } from "./files.js";
import { state, editorContainer, filePicker, SVG_NS } from "./state.js";
import { DEFAULT_SCHEMA_TEXT_COLOR_VAR, getLinkPrefix } from "./text.js";
import { interFont } from "./inlined.js";

const EXPORT_START_MARKER = "<!-- PINTA_DIAGRAM_DATA_START ";
const EXPORT_END_MARKER = "PINTA_DIAGRAM_DATA_END -->";

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function iconoirSubsetter(iconoirCSS, usedClasses) {
  console.log(usedClasses);
  const lines = iconoirCSS.split("\n");
  let output = [];
  let header = true;
  let klass = false;
  for (let line of lines) {
    if (!header) {
    } else {
      if (line.startsWith(".iconoir-")) {
        header = false;
      } else {
        output.push(line);
      }
    }
    if (header) {
      continue;
    } else {
      if (line.startsWith(".")) {
        const currentClass = line.slice(1).split("::")[0];
        if (usedClasses.has(currentClass)) {
          klass = true;
        }
      }
      if (klass) {
        output.push(line);
      }
      if (line.startsWith("}")) {
        klass = false;
      }
    }
  }
  return output.join("\n");
}

async function exportToStaticHTML(loadedCSSText, loadedCSSIconoir) {
  const currentThemeClass = document.body.classList.contains("light-theme")
    ? "light-theme"
    : "";
  const ldToggleHTML = `
    <input type="checkbox" id="theme-toggle-export" class="theme-toggle-checkbox">
    <label for="theme-toggle-export" class="theme-toggle-label">
      <i class="sun-light iconoir-sun-light"></i>
      <i class="half-moon iconoir-half-moon"></i>
    </label>
  `;
  let info = `Created with <a href="https://github.com/rberenguel/pinta">Pinta v${state.version}</a><br/>Pinta created by Ruben Berenguel, 2025`;
  const infoToggleHTML = `
<input type="checkbox" id="info-modal-toggle" class="info-modal-toggle-checkbox" />
<label for="info-modal-toggle" class="info-button" title="About Pinta">
  <span class="iconoir-info-circle-solid"></span>
</label>

<div class="info-modal-overlay">
    <label for="info-modal-toggle" class="info-modal-close-overlay"></label>
    <div class="info-modal-content">
        <div id="info-modal-text">${info}
            </div>
        <label for="info-modal-toggle" class="info-modal-close-button">&times;</label>
    </div>
</div>
  `;
  let diagramContentHTML = "";

  const liveEditorRectForRelativePositioning =
    editorContainer.getBoundingClientRect();
  const editorWrapperStyle = `
    position: relative;
    width: ${liveEditorRectForRelativePositioning.width}px;
    height: ${liveEditorRectForRelativePositioning.height}px;
    background-color: var(--theme-editor-background);
    border: 1px solid var(--theme-border-color);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    border-radius: 0.5rem;
    margin: 15px;
  `;

  const pintaSaveData = getCurrentDiagramDataForSave();
  const pintaJsonString = JSON.stringify(pintaSaveData);

  const jsonComment = `\n${EXPORT_START_MARKER}\n${pintaJsonString}\n${EXPORT_END_MARKER}\n`;

  const replaceImageMacros = (text) => {
    if (!text) return "";

    const imageRegex = /!([^!]+)!/g;

    return text.replace(imageRegex, (match, content) => {
      let src = content; // Default to the content itself (e.g., a URL)

      // Check if the content is a data-key and resolve it from our store
      if (
        content.startsWith("data-") &&
        state.dataUrls &&
        state.dataUrls[content]
      ) {
        src = state.dataUrls[content].base64;
      }
      // The rest of this function's logic for other cases (like base64ImageCache) can remain
      // or be merged depending on your final desired priority. For this task,
      // the key is adding the dataUrls check. The below is from your existing code.
      else {
        const cachedDataUrl = state.base64ImageCache.get(content);
        if (cachedDataUrl) {
          src = cachedDataUrl;
        } else if (state.manuallyDownloadedUrls.has(content)) {
          const fileName =
            content.substring(content.lastIndexOf("/") + 1).split("?")[0] ||
            "image.png";
          src = `pinta-resources/${fileName}`;
        }
      }

      return `<span class="inlined-image-wrapper"><img class="inlined-image" src="${src}" style="height: 1em; vertical-align: middle;"></span>`;
    });
  };

  const linesHtml = Object.values(state.linesStore)
    .map((line) => {
      const lineElementGroup = document.getElementById(line.id);
      if (!lineElementGroup) return "";

      const groupClassAttr = lineElementGroup.className
        ? `class="${lineElementGroup.className}"`
        : "";
      const groupStyle = lineElementGroup.style.cssText || "";

      let visualHtml = "";
      let whiteSpaceStyle = "";
      const visualElement = lineElementGroup.querySelector(".line-visual");
      if (visualElement) {
        const visualClassAttr = visualElement.className
          ? `class="${visualElement.className}"`
          : "";
        const visualStyle = visualElement.style.cssText || "";
        visualHtml = `<div ${visualClassAttr} style="${visualStyle}"></div>`;
      }

      let textHtml = "";
      const textElement = lineElementGroup.querySelector(".line-text");
      if (textElement && textElement.style) {
        if (textElement.style.whiteSpace) {
          whiteSpaceStyle = `white-space: ${textElement.style.whiteSpace};`;
          whiteSpaceStyle = "white-space: pre-wrap;";
        } else {
          whiteSpaceStyle = "white-space: pre-wrap;";
          textHtml = escapeHtml(rawLineText);
        }
        const textClassAttr = textElement.className
          ? `class="${textElement.className}"`
          : "";
        const hasExplicitNewlinesFallback =
          line.text && line.text.includes("\n");
        whiteSpaceStyle = "white-space: pre-wrap;"; // Ignores the new lines part. We always seem to use pre-wrap in live
        const textStyle = textElement.style.cssText + whiteSpaceStyle || "";

        let textContentHtml;
        let rawLineText = line.text || "...";
        let prefixSymbol = undefined;
        let prefix = "";
        if (rawLineText.startsWith(":")) {
          const maybeIcon = rawLineText.slice(1).split(":");
          if (maybeIcon.length > 1) {
            const icon = maybeIcon[0];
            if (icon) {
              prefixSymbol = `<div class="iconoir-${icon}"></div>`;
              if (!line.linkUrl) {
                prefix = `<span class="link-icon-nonclickable">${prefixSymbol}</span>`;
              }
              rawLineText = rawLineText
                .slice(1)
                .split(":")
                .slice(1)
                .join(":")
                .trim();
            }
          }
        }
        let appending = [];
        if (rawLineText.startsWith("[")) {
          const maybeDate = rawLineText.slice(1).split("]");
          if (maybeDate.length > 1) {
            const content = maybeDate[0];
            const yearMonthPattern =
              /^(19\d{2}|20\d{2}|2100)(0[1-9]|1[0-2])?(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/;
            const match = content.match(yearMonthPattern);

            if (match) {
              console.info("Found year and optional month");
              const yearPart = match[1];
              const monthPart = match[2];
              const dayPart = match[3];

              const yearSpan = `<span class="year">${yearPart}</span>`;
              appending.push(yearSpan);

              if (monthPart) {
                console.info("Found month");
                const monthSpan = `<span class="month">${monthPart}</span>`;
                appending.push(monthSpan);
              }
              if (dayPart) {
                console.info("Found day");
                const daySpan = `<span class="day">${dayPart}</span>`;
                appending.push(daySpan);
              }

              rawLineText = rawLineText
                .slice(1)
                .split("]")
                .slice(1)
                .join("]")
                .trim();
            }
          }
        }
        //rawLineText = prefix + rawLineText;
        let title = null;
        if (
          line.textRenderLength &&
          rawLineText.length > line.textRenderLength
        ) {
          title = rawLineText;
          rawLineText = rawLineText.substring(0, line.textRenderLength) + "…";
        }

        // Handle markdown-like formatting for the static export
        rawLineText = rawLineText.replace(
          /`([a-zA-Z][^`]*[a-zA-Z]|[a-zA-Z])`/g,
          "<code>$1</code>",
        );
        rawLineText = rawLineText.replace(
          /_([a-zA-Z][^_]*[a-zA-Z]|[a-zA-Z])_/g,
          "<em>$1</em>",
        );
        rawLineText = rawLineText.replace(
          /\*([a-zA-Z][^*]*[a-zA-Z]|[a-zA-Z])\*/g,
          "<strong>$1</strong>",
        );
        rawLineText = rawLineText.replace(
          /:([\w-]+):/g,
          '<span class="link-icon-nonclickable"><div class="iconoir-$1"></div> </span>',
        );
        rawLineText = replaceImageMacros(rawLineText);

        let lineText = `${prefix}<div class="line-text-wrapper" title="${title}">${rawLineText}</div>${appending.join(
          " ",
        )}`;

        if (line.linkUrl) {
          prefixSymbol = prefixSymbol || getLinkPrefix(line.linkUrl);
          const prefix = `<span class="link-icon-clickable">${prefixSymbol}</span>`;
          textContentHtml = `<a href="${escapeHtml(
            line.linkUrl,
          )}" target="_blank" style="text-decoration:none; color:inherit;">${prefix}</a>${lineText}`;
        } else {
          textContentHtml = lineText;
        }

        if (
          line.checkboxState === "checked" ||
          line.checkboxState === "unchecked"
        ) {
          const isCheckboxChecked = line.checkboxState === "checked";
          const currentLineTextColorValue =
            line.textColor && line.textColor !== "default"
              ? `var(--${line.textColor})`
              : DEFAULT_SCHEMA_TEXT_COLOR_VAR;
          const checkedAttr = isCheckboxChecked ? " checked" : "";
          let checkboxInlineStyle = `border-color: ${currentLineTextColorValue};`;
          if (isCheckboxChecked) {
            checkboxInlineStyle += ` background-color: ${currentLineTextColorValue};`;
          } else {
            checkboxInlineStyle += ` background-color: var(--theme-main-background);`;
          }
          textContentHtml = `<input type="checkbox" class="line-label-checkbox" style="${checkboxInlineStyle}"${checkedAttr} disabled>${textContentHtml}`;
        }
        textHtml = `<div ${textClassAttr} style="${textStyle}">${textContentHtml}</div>`;
      }
      return `<div ${groupClassAttr} style="${groupStyle}">${visualHtml}${textHtml}</div>`;
    })
    .join("");
  diagramContentHTML += linesHtml;

  const postItsHtml = Object.values(state.postItsStore)
    .map((postIt) => {
      const postItElement = document.getElementById(postIt.id);
      if (!postItElement) return "";

      const elemRect = postItElement.getBoundingClientRect();
      const exportLeft =
        elemRect.left - liveEditorRectForRelativePositioning.left;
      const exportTop = elemRect.top - liveEditorRectForRelativePositioning.top;

      let postItGeneratedStyle = `position:absolute; left:${exportLeft}px; top:${exportTop}px; width:${elemRect.width}px;`;

      if (postItElement.style.transform) {
        postItGeneratedStyle += ` transform: ${postItElement.style.transform};`;
      }

      const classAttr = postItElement.className
        ? `class="${postItElement.className}"`
        : "";

      let titleHtml = "";
      const titleHandle = postItElement.querySelector(".postit-drag-handle");
      if (titleHandle) {
        const titleClass = titleHandle.className
          ? `class="${titleHandle.className}"`
          : "";
        const titleStyle = titleHandle.style.cssText
          ? `style="${titleHandle.style.cssText}"`
          : "";
        titleHtml = `<div ${titleClass} ${titleStyle}>${escapeHtml(
          postIt.title || "",
        )}</div>`;
      }

      let contentAreaHtml = "";
      const contentArea = postItElement.querySelector(".postit-content-area");
      if (contentArea) {
        const contentClass = contentArea.className
          ? `class="${contentArea.className}"`
          : "";
        // For some reason we need to add the white-space: normal to handle new lines in post its
        const contentStyle = contentArea.style.cssText
          ? `style="${contentArea.style.cssText} white-space: normal;"`
          : "";
        contentAreaHtml = `<div ${contentClass} ${contentStyle}>${postIt.content}</div>`; // postIt.content is already HTML
      }

      return `<div ${classAttr} style="${postItGeneratedStyle}">${titleHtml}${contentAreaHtml}</div>`;
    })
    .join("");
  diagramContentHTML += postItsHtml;

  if (state.drawingCanvas) {
    const svgClone = state.drawingCanvas.cloneNode(true);
    svgClone.setAttribute(
      "style",
      "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;",
    );
    diagramContentHTML += svgClone.outerHTML;
  }
  const usedIconoirClasses = new Set(
    Array.from(document.querySelectorAll('[class*="iconoir-"]'))
      .map((e) => e.classList[0])
      .concat([
        "iconoir-half-moon",
        "iconoir-sun-light",
        "iconoir-info-circle-solid",
      ]),
  );
  const subsetIconoirCSS = iconoirSubsetter(
    loadedCSSIconoir,
    usedIconoirClasses,
  );
  console.info(subsetIconoirCSS);
  const fullCSS = loadedCSSText + "\n" + subsetIconoirCSS;

  const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinta Diagram Export</title>
  <style>
    /* Fonts */
    ${interFont}
  </style>
  <style>
    /* Embedded CSS from style.css */
    ${fullCSS}
    /* Additional styles for static export if needed */
    body {
        margin: 0;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--theme-main-background);
        color: var(--theme-primary-text);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
    }
    .postit-content-area a { color: var(--blue); text-decoration: underline; }
    .postit-content-area a:hover { color: var(--cyan); }
  </style>
</head>
<body class="${currentThemeClass}">
${infoToggleHTML}
${ldToggleHTML}
  <div class="pinta-static-container">
  <div id="editor-container-export" style="${editorWrapperStyle}">
    ${diagramContentHTML}
  </div>
  </div>
  ${jsonComment}
</body>
</html>`;

  const blob = new Blob([finalHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);

  let title =
    Object.values(state.linesStore).filter((l) => !l.parentId)[0].text || "...";
  if (title.startsWith(":")) {
    const maybeIcon = title.slice(1).split(":");
    if (maybeIcon.length > 1) {
      const icon = maybeIcon[0];
      if (icon) {
        title = title.slice(1).split(":").slice(1).join(":").trim();
      }
    }
  }
  title = title.replace(/[: ]/g, "-");
  const suggestedName = `${title}.html`;

  try {
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: "HTML Document",
            accept: { "text/html": [".html", ".htm"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log("Pinta: Diagram exported to HTML.");
    } else {
      // Fallback for browsers that don't support showSaveFilePicker
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log("Pinta: Diagram download initiated (fallback).");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Pinta: Error exporting to HTML:", err);
    } else {
      console.log("Pinta: HTML export aborted by user.");
    }
  }
}
