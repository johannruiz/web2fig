(function () {
  function splitComma(value) {
    return splitTopLevel(value, ",");
  }

  function splitSpace(value) {
    const tokens = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (const char of String(value || "")) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'") {
        current += char;
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") depth = Math.max(0, depth - 1);
      if (/\s/.test(char) && depth === 0) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }
    return tokens;
  }

  function splitTopLevel(value, separator) {
    const parts = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (const char of String(value || "")) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'") {
        current += char;
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") depth = Math.max(0, depth - 1);
      if (char === separator && depth === 0) {
        parts.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }
    return parts;
  }

  function parseFunction(value) {
    const match = String(value || "").trim().match(/^(-?[_a-zA-Z][_a-zA-Z0-9-]*)\(([\s\S]*)\)$/);
    if (!match) {
      return null;
    }
    return {
      name: match[1].toLowerCase(),
      body: match[2],
      args: splitComma(match[2]),
    };
  }

  function extractUrl(value) {
    const fn = parseFunction(String(value || "").trim());
    if (!fn || fn.name !== "url") {
      const match = String(value || "").match(/url\(([\s\S]*?)\)/);
      if (!match) return "";
      return unquote(match[1].trim());
    }
    return unquote(fn.body.trim());
  }

  function unquote(value) {
    return String(value || "").replace(/^["']|["']$/g, "");
  }

  function firstColor(value) {
    const text = String(value || "");
    const functional = text.match(/\b(?:rgba?|hsla?|color(?:-mix)?)\([^)]+\)/i);
    if (functional) return functional[0];
    const hex = text.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hex) return hex[0];
    const keyword = splitSpace(text).find((token) =>
      /^[a-zA-Z]+$/.test(token) &&
      !["inset", "to", "left", "right", "top", "bottom", "center", "solid", "dashed", "none"].includes(token.toLowerCase())
    );
    return keyword || "";
  }

  function removeColors(value) {
    return String(value || "")
      .replace(/\b(?:rgba?|hsla?|color(?:-mix)?)\([^)]+\)/gi, " ")
      .replace(/#[0-9a-fA-F]{3,8}\b/g, " ");
  }

  function numberTokens(value) {
    return removeColors(value)
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((number) => Number.isFinite(number));
  }

  window.CssValueParser = {
    extractUrl,
    firstColor,
    numberTokens,
    parseFunction,
    splitComma,
    splitSpace,
    unquote,
  };
})();
