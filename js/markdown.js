export { pintaJsonToMarkdown, pintaMarkdownToJson };

import {
  MAIN_LINE_DEFAULT_THICKNESS,
  CHILD_LINE_DEFAULT_THICKNESS,
  SCHEMA_LINE_VISUAL_COLORS,
} from "./lines.js";

/**
 * Converts Pinta JSON diagram data to a Markdown-like string.
 * @param {object} jsonData The Pinta diagram data.
 * @returns {string} A string in a Markdown/YAML-hybrid format.
 */
function pintaJsonToMarkdown(jsonData) {
  let mdString = "";

  // Helper to format properties
  const formatProps = (obj, excludeKeys = []) => {
    let propsMd = "";
    for (const key in obj) {
      if (excludeKeys.includes(key) || typeof obj[key] === "function") continue;
      if (
        obj.hasOwnProperty("parentId") &&
        (key === "checkboxState" ||
          key === "linkUrl" ||
          key === "text" ||
          key === "isBold" ||
          key === "isCentered" ||
          key === "fontSize" ||
          key === "textColor" ||
          key === "angle" ||
          key === "startX" ||
          key === "startY")
      ) {
        continue;
      }
      // Specifically handle children for lines later if needed, for now, basic stringify
      if (key === "children" && Array.isArray(obj[key])) {
        // Optionally, list child IDs if needed, or skip if hierarchy is enough
        // propsMd += `- ${key}: [${obj[key].join(', ')}]\n`;
      } else {
        propsMd += `- ${key}: ${JSON.stringify(obj[key])}\n`;
      }
    }
    return propsMd;
  };

  // 1. Process Lines (Hierarchically)
  const processLine = (lineId, depth) => {
    const line = jsonData.lines[lineId];
    if (!line) return;

    let titlePrefix = "";
    if (line.checkboxState === "checked") {
      titlePrefix = "[x] ";
    } else if (line.checkboxState === "unchecked") {
      titlePrefix = "[ ] ";
    }
    const escapedLineText = (line.text || "Untitled Line").replace(
      /\n/g,
      "\\n",
    );
    let lineTitleContent = escapedLineText;
    if (line.linkUrl) {
      // Use a default link text if actual text is empty but URL exists
      const linkText = line.text || "Link";
      lineTitleContent = `[${linkText}](${line.linkUrl})`;
    }
    const newLine = depth > 1 ? "\n" : "";
    mdString += `${newLine}${"#".repeat(
      depth,
    )} ${titlePrefix}${lineTitleContent}\n`;
    let formatParts = [];
    if (line.isBold === true) {
      // Default is false
      formatParts.push("bold");
    }
    if (line.isCentered === false) {
      // Default is true, so only add if explicitly false
      formatParts.push("left-aligned"); // Or a similar keyword for non-centered
    } else if (
      line.isCentered === true &&
      jsonData.lines[line.parentId] !== undefined
    ) {
      // Only add "centered" if it's not the root and it's true (to override potential inheritance if that was a feature)
      // For now, let's be explicit if it's true and not a root-level default style for clarity
      // Or, better: only add "centered" if true. Absence will mean use Pinta default (which is true).
      // If user wants left-aligned, they'd omit "centered" OR we introduce "left-aligned".
      // Let's go with: "centered" means true. Absence means Pinta default (true).
      // To make it *not* centered, we'll need a "left" or "left-aligned" keyword.
      // Given the prompt "centered (or not)", let's assume "centered" means true.
      // If the user wants to explicitly make it left, they would omit "centered" from format string,
      // and the parser would default to false.
      // To make this robust: If isCentered is true (Pinta default), we only *need* to write it if it's different from an implied "false" when format is present.
      // Simpler: if isCentered is true, write "centered".
      formatParts.push("centered");
    }

    if (line.fontSize !== undefined && line.fontSize !== 16) {
      // Default is 16
      formatParts.push(String(line.fontSize));
    }
    if (line.textColor && line.textColor !== "default") {
      // Default is "default"
      formatParts.push(line.textColor);
    }

    if (formatParts.length > 0) {
      mdString += `- format: ${formatParts.join(", ")}\n`;
    }
    // Line visual property (color and thickness)
    const isMainLine = line.parentId === null;
    const defaultThickness = isMainLine
      ? MAIN_LINE_DEFAULT_THICKNESS
      : CHILD_LINE_DEFAULT_THICKNESS;
    const lineColor = line.color || "default";
    const lineThickness =
      line.thickness === undefined
        ? defaultThickness
        : parseFloat(line.thickness);

    if (lineColor !== "default" || lineThickness !== defaultThickness) {
      mdString += `- line: ${lineColor}, ${lineThickness.toFixed(2)}\n`;
    }

    // Exclude properties now handled in the heading or specific format/line props for lines
    mdString += formatProps(line, [
      "id",
      "parentId",
      "children",
      "text",
      "checkboxState",
      "linkUrl",
      "isBold",
      "isCentered",
      "fontSize",
      "textColor",
      "color",
      "thickness",
      "angle",
      "startX",
      "startY",
      "hasCheckbox", // Avoid rewriting legacy fields
      "isCheckboxChecked", // Avoid rewriting legacy fields
    ]);

    if (line.children && line.children.length > 0) {
      line.children.forEach((childId) => processLine(childId, depth + 1));
    }
  };

  const rootLineId = Object.keys(jsonData.lines).find(
    (id) => jsonData.lines[id] && jsonData.lines[id].parentId === null,
  );

  if (rootLineId) {
    processLine(rootLineId, 1);
  } else {
    // Fallback if no single root (should not happen with current Pinta logic)
    Object.keys(jsonData.lines).forEach((lineId) => {
      if (jsonData.lines[lineId] && jsonData.lines[lineId].parentId === null) {
        processLine(lineId, 1);
      }
    });
  }
  mdString += "\n";

  // 2. Process Drawings
  if (jsonData.drawings && jsonData.drawings.length > 0) {
    mdString += "---\n";
    mdString += "# Drawings\n\n";
    jsonData.drawings.forEach((drawing) => {
      mdString += `## ${drawing.kind || "Unnamed Drawing"} ${drawing.id}\n`;
      mdString += formatProps(drawing, ["kind", "id"]);
      mdString += "\n";
    });
  }

  // 3. Process Post-its
  if (jsonData.postIts && Object.keys(jsonData.postIts).length > 0) {
    mdString += "---\n";
    mdString += "# Post its\n\n";
    for (const postItId in jsonData.postIts) {
      const postIt = jsonData.postIts[postItId];
      mdString += `## ${postIt.title || postIt.id}\n`;
      // Decide how to handle content. For now, treating as a prop.
      // For better readability, you might want a block for content:
      // mdString += `\n\`\`\`\n${postIt.content}\n\`\`\`\n`;
      mdString += formatProps(postIt, ["id", "title"]); // if title used in header
      mdString += "\n";
    }
  }
  // 4. Process and append the dataUrls store
  if (jsonData.dataUrls && Object.keys(jsonData.dataUrls).length > 0) {
    mdString += "\n---\n";
    mdString += "# Data URLs\n\n";
    for (const key in jsonData.dataUrls) {
      const data = jsonData.dataUrls[key];
      // Store the original URL as a comment for human reference
      mdString += `## ${key} // ${data.originalUrl}\n`;
      // Store the base64 content in a fenced code block
      mdString += "```\n";
      mdString += data.base64 + "\n";
      mdString += "```\n\n";
    }
  }
  return mdString.trim();
}

/**
 * Converts a Markdown-like string back to Pinta JSON diagram data.
 * @param {string} markdownString The Markdown/YAML-hybrid string.
 * @returns {object} The Pinta diagram data object.
 */
function pintaMarkdownToJson(markdownString) {
  const jsonData = {
    lines: {},
    postIts: {},
    drawings: [],
    mainLineReference: null,
    dataUrls: {},
    dataUrlCounter: 0,
  };
  let lineIdCounter = 0;
  let drawingIdCounter = 0; // Keep track for drawings if IDs are not in MD
  let postItIdCounter = 0; // Keep track for post-its if IDs are not in MD
  let currentDataUrlKey = null;
  let isReadingBase64 = false;

  const lines = markdownString.split("\n");
  let currentSection = "lines"; // 'lines', 'drawings', 'postits'
  let currentLineParentStack = [];
  let currentObject = null; // For drawings or postits

  // Helper to parse "prop: value" lines
  const parsePropLine = (line) => {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let valueString = match[2].trim();
      try {
        // Attempt to parse as JSON (handles numbers, booleans, null, strings in quotes)
        return { key, value: JSON.parse(valueString) };
      } catch (e) {
        // If JSON.parse fails, it's likely an unquoted string or malformed
        return { key, value: valueString };
      }
    }
    return null;
  };

  const linkRegex = /\[(.*?)\]\((.*?)\)/;

  for (const line of lines) {
    if (line.trim() === "---") {
      currentSection = "unknown"; // Use a temporary state to wait for the next section heading
      // Reset flags for different sections
      isReadingBase64 = false;
      currentDataUrlKey = null;
      currentObject = null;
      continue;
    }
    const trimmedLine = line.trim().toLowerCase();
    if (currentSection === "unknown" || trimmedLine.startsWith("# ")) {
      if (trimmedLine === "# drawings") {
        currentSection = "drawings";
        continue;
      }
      if (trimmedLine === "# post its") {
        currentSection = "postits";
        continue;
      }
      if (trimmedLine === "# data urls") {
        currentSection = "dataurls";
        continue;
      }
      // If it's another heading, assume we're back in the lines section
      if (trimmedLine.startsWith("#")) currentSection = "lines";
    }
    if (currentSection === "dataurls") {
      if (line.startsWith("## ")) {
        const match = line.match(/^##\s+([^ ]+)(?:\s*\/\/\s*(.*))?/);
        if (match) {
          currentDataUrlKey = match[1];
          const originalUrl = match[2] || "";
          jsonData.dataUrls[currentDataUrlKey] = {
            base64: "",
            originalUrl: originalUrl,
          };

          // Also update the counter to avoid reusing keys
          const num = parseInt(currentDataUrlKey.split("-")[1]);
          if (!isNaN(num)) {
            jsonData.dataUrlCounter = Math.max(jsonData.dataUrlCounter, num);
          }
        }
      } else if (line.trim() === "```") {
        isReadingBase64 = !isReadingBase64; // Toggle reading mode
      } else if (isReadingBase64 && currentDataUrlKey) {
        jsonData.dataUrls[currentDataUrlKey].base64 += line.trim(); // Append base64 content
      }
    } else if (currentSection === "lines") {
      const headingMatch = line.match(/^(#+)\s+(.*)/);
      if (headingMatch) {
        const depth = headingMatch[1].length;
        let titleText = headingMatch[2].trim();
        let lineCheckboxState = null;

        if (titleText.startsWith("[ ] ")) {
          lineCheckboxState = "unchecked";
          titleText = titleText.substring(4);
        } else if (
          titleText.startsWith("[x] ") ||
          titleText.startsWith("[X] ")
        ) {
          lineCheckboxState = "checked";
          titleText = titleText.substring(4);
        }
        let lineText = titleText;
        let linkUrl = null;
        const linkMatch = titleText.match(linkRegex);

        if (
          linkMatch &&
          linkMatch[1] !== undefined &&
          linkMatch[2] !== undefined
        ) {
          lineText = linkMatch[1].trim();
          linkUrl = linkMatch[2].trim();
          if (!lineText && linkUrl) {
            // Handle empty link text like [](<url>)
            lineText = "Link";
          }
        }
        const lineId = `line-${lineIdCounter++}`;
        lineText = lineText.replace(/\\n/g, "\n");
        currentObject = {
          id: lineId,
          text: lineText,
          children: [],
          parentId: null,
          // Initialize with some defaults that might be overridden by props
          textPosRatio: 0.5,
          textPerpOffset: -15,
          thickness:
            depth === 1
              ? MAIN_LINE_DEFAULT_THICKNESS
              : CHILD_LINE_DEFAULT_THICKNESS,
          visualColor: "default",
          textColor: "default",
          fontSize: 16,
          isBold: false,
          isCentered: true,
          linkUrl: linkUrl,
          checkboxState: lineCheckboxState,
        };

        if (depth === 1) {
          if (!jsonData.mainLineReference) {
            // Assuming the first H1 is the main line
            jsonData.mainLineReference = { id: lineId, length: 0 }; // Length will be updated by prop
          }
          currentLineParentStack = [
            { id: lineId, depth: 1, obj: currentObject },
          ];
        } else {
          while (
            currentLineParentStack.length > 0 &&
            currentLineParentStack[currentLineParentStack.length - 1].depth >=
              depth
          ) {
            currentLineParentStack.pop();
          }
          if (currentLineParentStack.length > 0) {
            const parent =
              currentLineParentStack[currentLineParentStack.length - 1];
            currentObject.parentId = parent.id;
            parent.obj.children.push(lineId);
            // Set default and hint for auto-distribution if not overridden by a prop later
            currentObject.relativeDirection =
              parent.obj.children.length % 2 === 0 ? -1 : 1; // Default alternation
            currentObject.offsetRatioOnParent = 0.5; // Default to middle
            currentObject.autoPositionHint = true; // Add this hint for implicit positioning
          }
          currentLineParentStack.push({
            id: lineId,
            depth: depth,
            obj: currentObject,
          });
        }
        jsonData.lines[lineId] = currentObject;
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject && currentSection === "lines") {
          if (prop.key === "format") {
            console.log(prop.value);
            const formatString = `${prop.value}` || "";
            const parts = formatString
              .split(",")
              .map((p) => p.trim().toLowerCase());

            // Apply format parts, potentially overriding defaults set above
            // If a format part is missing, the default (or prior value) holds.
            // For isCentered, absence of "centered" in a format string means left-aligned.
            let foundCenteredInFormat = false;

            parts.forEach((part) => {
              if (part === "bold") {
                currentObject.isBold = true;
              } else if (part === "centered") {
                currentObject.isCentered = true;
                foundCenteredInFormat = true;
              } else if (part === "left-aligned") {
                // Specific keyword for left-align
                currentObject.isCentered = false;
                foundCenteredInFormat = true; // A alignment choice was made
              } else if (!isNaN(parseInt(part))) {
                currentObject.fontSize = parseInt(part);
              } else if (
                Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(part)
              ) {
                currentObject.textColor = part;
              } else if (SCHEMA_LINE_VISUAL_COLORS[part]) {
                // Check if it's a short color code like 'r' for 'red'
                currentObject.textColor = SCHEMA_LINE_VISUAL_COLORS[part];
              }
            });
            // If format string exists but "centered" or "left-aligned" is NOT mentioned,
            // it should become left-aligned (isCentered: false)
            if (!foundCenteredInFormat) {
              currentObject.isCentered = false;
            }

            delete currentObject.autoPositionHint;
          } else if (prop.key === "line") {
            const lineStyleString = prop.value;
            const parts = lineStyleString
              .split(",")
              .map((p) => p.trim().toLowerCase());

            // Defaults for color/thickness are already set. Override if found in parts.
            parts.forEach((part) => {
              const numPart = parseFloat(part);
              if (!isNaN(numPart)) {
                currentObject.thickness = numPart;
              } else if (
                Object.values(SCHEMA_LINE_VISUAL_COLORS).includes(part)
              ) {
                currentObject.color = part;
              } else if (SCHEMA_LINE_VISUAL_COLORS[part]) {
                currentObject.color = SCHEMA_LINE_VISUAL_COLORS[part];
              }
            });
            delete currentObject.autoPositionHint;
          } else if (
            ![
              "text",
              "checkboxState",
              "linkUrl",
              "isBold",
              "isCentered",
              "fontSize",
              "textColor",
              "color",
              "thickness",
            ].includes(prop.key)
          ) {
            currentObject[prop.key] = prop.value;
            if (
              prop.key === "offsetRatioOnParent" ||
              prop.key === "relativeDirection" ||
              prop.key === "startX" ||
              prop.key === "startY"
            ) {
              delete currentObject.autoPositionHint;
            }
          }
          if (
            currentObject.id === jsonData.mainLineReference?.id &&
            prop.key === "length"
          ) {
            jsonData.mainLineReference.length = parseFloat(prop.value);
          }
        }
      }
    } else if (currentSection === "drawings") {
      const itemHeadingMatch = line.match(/^##\s+([^ ]+)\s+([^ ]+)/); // Matches "## kind id"
      if (itemHeadingMatch) {
        currentObject = { kind: itemHeadingMatch[1], id: itemHeadingMatch[2] };
        jsonData.drawings.push(currentObject);
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject) {
          currentObject[prop.key] = prop.value;
        }
      }
    } else if (currentSection === "postits") {
      const itemHeadingMatch = line.match(/^##\s+(.*)/); // Matches "## Title or ID"
      if (itemHeadingMatch) {
        const titleOrId = itemHeadingMatch[1].trim();
        // Attempt to extract ID if title format is "Title (id)" or just use as ID.
        // For simplicity, we'll assume the heading IS the ID or a unique title.
        // A more robust system might require explicit ID prop.
        const id = titleOrId.startsWith("postit-")
          ? titleOrId
          : `postit-${postItIdCounter++}`;
        currentObject = { id: id, title: titleOrId !== id ? titleOrId : "" };
        jsonData.postIts[id] = currentObject;
      } else {
        const prop = parsePropLine(line);
        if (prop && currentObject) {
          currentObject[prop.key] = prop.value;
        }
      }
    }

    // Switch section based on heading
    if (line.trim() === "# Drawings") {
      currentSection = "drawings";
      currentObject = null;
      currentLineParentStack = []; // Reset parent stack for lines
    } else if (line.trim() === "# Post its") {
      currentSection = "postits";
      currentObject = null;
      currentLineParentStack = []; // Reset parent stack for lines
    }
  }
  // After parsing all lines, ensure mainLineReference has length if not set by a prop for line-0
  if (
    jsonData.mainLineReference &&
    jsonData.mainLineReference.length === 0 &&
    jsonData.lines[jsonData.mainLineReference.id]
  ) {
    jsonData.mainLineReference.length =
      jsonData.lines[jsonData.mainLineReference.id].length || 0;
  }

  return jsonData;
}
