import { LINK_SYMBOL_MAP, DEFAULT_LINK_SYMBOL } from "./state.js";

export { getLinkPrefix };

function getLinkPrefix(url) {
  if (!url) return "";
  for (const mapping of LINK_SYMBOL_MAP) {
    if (mapping.regex.test(url)) {
      return mapping.symbol;
    }
  }
  return DEFAULT_LINK_SYMBOL;
}
