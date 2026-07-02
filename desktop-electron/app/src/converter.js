(function () {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "TEMPLATE"]);
  async function convertDocument(doc, targetViewport = {}, options = {}) {
    const view = doc.defaultView;
    const previousScrollX = view?.scrollX || 0;
    const previousScrollY = view?.scrollY || 0;
    if (view && (previousScrollX || previousScrollY)) {
      view.scrollTo(0, 0);
      await waitForFrame(view);
    }
    try {
      return await convertDocumentAtScrollTop(doc, targetViewport, options);
    } finally {
      if (view && (previousScrollX || previousScrollY)) {
        view.scrollTo(previousScrollX, previousScrollY);
      }
    }
  }

  async function convertDocumentAtScrollTop(doc, targetViewport = {}, options = {}) {
    const body = doc.body;
    const rootRect = body.getBoundingClientRect();
    const viewportWidth = Math.ceil(targetViewport.width || Math.max(doc.documentElement.clientWidth, rootRect.width));
    const viewportHeight = Math.ceil(
      Math.max(
        targetViewport.height || 0,
        doc.documentElement.scrollHeight,
        body.scrollHeight,
        rootRect.height,
      ),
    );
    const stats = { nodes: 0, texts: 0, layoutCandidates: 0 };
    const chunks = [];
    const imageSizeCache = new Map();

    await walk(body, {
      doc,
      rootX: 0,
      rootY: 0,
      chunks,
      stats,
      options,
      imageSizeCache,
      uid: 0,
      nextId(prefix) {
        this.uid += 1;
        return `${prefix}-${this.uid}`;
      },
    });

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}" viewBox="0 0 ${viewportWidth} ${viewportHeight}">`,
      `<rect width="100%" height="100%" fill="${escapeAttr(readBackground(doc))}"/>`,
      ...chunks,
      `</svg>`,
    ].join("\n");

    return {
      svg,
      stats,
      viewport: { width: viewportWidth, height: viewportHeight },
    };
  }

  async function walk(node, context) {
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP_TAGS.has(node.tagName)) {
      return;
    }

    const element = node;
    const style = context.doc.defaultView.getComputedStyle(element);
    if (!isVisible(element, style)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      for (const child of Array.from(element.children)) {
        await walk(child, context);
      }
      return;
    }

    context.stats.nodes += 1;
    const layout = analyzeLayout(style, element, context);
    if (layout) {
      context.stats.layoutCandidates += 1;
    }

    const x = round(rect.left + context.doc.defaultView.scrollX - context.rootX);
    const y = round(rect.top + context.doc.defaultView.scrollY - context.rootY);
    const width = round(rect.width);
    const height = round(rect.height);

    if (isInlineSvg(element)) {
      const svg = serializeInlineSvg(element, style, x, y, width, height);
      if (svg) {
        context.stats.svgIcons = (context.stats.svgIcons || 0) + 1;
        context.chunks.push(svg);
      }
      return;
    }

    if (context.options.mode === "hybrid" && shouldRasterize(element, style)) {
      const raster = await rasterizeElement(element, x, y, width, height);
      if (raster) {
        context.stats.rasterized = (context.stats.rasterized || 0) + 1;
        context.chunks.push(`<image x="${x}" y="${y}" width="${width}" height="${height}" href="${escapeAttr(raster)}" preserveAspectRatio="none"/>`);
        return;
      }
    }

    const elementChunks = [];
    const elementContext = { ...context, chunks: elementChunks };

    await appendElementVisuals(elementChunks, elementContext, element, style, x, y, width, height, context);

    if (context.options.prepareAutoLayout && layout) {
      const groupedChunks = [...elementChunks];
      const childContext = { ...context, chunks: groupedChunks };
      for (const child of layoutChildren(element, layout)) {
        await walk(child, childContext);
      }
      context.chunks.push(...openGroup({ shouldGroup: true, layout }, element, style, x, y, width, height, context), ...groupedChunks, `</g>`);
      return;
    }

    const group = groupPlan(element, style, elementChunks, layout, context.options);
    if (group.shouldGroup) {
      context.chunks.push(...openGroup(group, element, style, x, y, width, height, context), ...elementChunks, `</g>`);
    } else if (elementChunks.length) {
      context.chunks.push(...elementChunks);
    }

    for (const child of Array.from(element.children)) {
      await walk(child, context);
    }
  }

  async function appendElementVisuals(chunks, elementContext, element, style, x, y, width, height, context) {
    const handledConnector = appendConnector(chunks, element, style, x, y, width, height, context);
    if (!handledConnector) {
      appendBox(chunks, element, style, x, y, width, height, context);
    }
    appendBackgroundPatterns(chunks, element, style, x, y, width, height, context);
    await appendBackgroundImage(chunks, element, style, x, y, width, height, context);
    appendPseudoElement(chunks, element, "::before", x, y, width, height, context);
    await appendImage(chunks, element, style, x, y, width, height, context);
    appendText(elementContext, element, style);
    appendPseudoElement(chunks, element, "::after", x, y, width, height, context);
  }

  function appendBox(chunks, element, style, x, y, width, height, context) {
    if (element.tagName === "BODY") {
      return;
    }

    const currentColor = rgbaToHex(style.color) || "#000000";
    const background = rgbaToHex(style.backgroundColor, currentColor);
    const backgroundLayers = backgroundLayerList(style.backgroundImage);
    const gradient = backgroundLayers.length === 1 ? parseLinearGradient(backgroundLayers[0]) : null;
    const borders = readBorders(style, currentColor);
    const outline = readOutline(style, currentColor);
    const radius = readRadius(style);
    const clipPolygon = polygonClipPath(style.clipPath, x, y, width, height);
    const shadows = parseShadows(style.boxShadow);
    const shadow = shadows.find((item) => !item.inset);
    const insetShadows = shadows.filter((item) => item.inset);

    if (!background && !gradient && !borders.hasAny && !outline && !shadow && !insetShadows.length) {
      return;
    }

    let fill = background || "none";
    if (gradient) {
      const gradientId = context.nextId("gradient");
      chunks.push(gradientDef(gradientId, gradient));
      fill = `url(#${gradientId})`;
    }

    const attrs = [`fill="${fill}"`];

    if (borders.isUniform) {
      attrs.push(`stroke="${borders.top.color}"`, `stroke-width="${round(borders.top.width)}"`);
      const dash = dashPattern(borders.top.style, borders.top.width);
      if (dash) {
        attrs.push(`stroke-dasharray="${dash}"`);
      }
    }

    if (shadow) {
      const id = context.nextId("shadow");
      chunks.push(
        `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${shadow.dx}" dy="${shadow.dy}" stdDeviation="${shadow.blur}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}"/></filter></defs>`,
      );
      attrs.push(`filter="url(#${id})"`);
    }

    chunks.push(clipPolygon ? polygonShape(clipPolygon, attrs) : boxShape(x, y, width, height, radius, attrs));
    if (clipPolygon) {
      context.stats.clipPaths = (context.stats.clipPaths || 0) + 1;
    }
    if (borders.hasAny && !borders.isUniform) {
      chunks.push(...borderLines(borders, x, y, width, height));
    }
    if (outline) {
      chunks.push(outlineShape(outline, x, y, width, height, radius));
    }
    if (insetShadows.length) {
      chunks.push(...insetShadowShapes(insetShadows, x, y, width, height, radius));
    }
  }

  function appendConnector(chunks, element, style, x, y, width, height, context) {
    if (element.tagName === "BODY" || element.tagName === "PSEUDO") {
      return false;
    }

    const currentColor = rgbaToHex(style.color) || "#000000";
    const background = rgbaToHex(style.backgroundColor, currentColor);
    const borders = readBorders(style, currentColor);
    const hasBackgroundImage = backgroundLayerList(style.backgroundImage).length > 0;
    const thinFillLine = background && isThinLine(width, height);
    const thinBorderLine = !background && !hasBackgroundImage && isThinBorderConnector(borders, width, height);
    if (!thinFillLine && !thinBorderLine) {
      return false;
    }

    const color = thinFillLine ? background : connectorBorderColor(borders);
    const strokeWidth = Math.max(0.5, thinFillLine ? Math.min(width, height) : connectorBorderWidth(borders));
    const dash = thinBorderLine ? connectorDash(borders) : "";
    const line = connectorLineFromBox(x, y, width, height, style, strokeWidth);
    const transform = line.transform ? ` transform="${line.transform}"` : "";
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";

    chunks.push(
      `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${color}" stroke-width="${round(strokeWidth)}"${dashAttr}${transform} stroke-linecap="butt"/>`,
    );
    context.stats.connectors = (context.stats.connectors || 0) + 1;
    return true;
  }

  function appendBackgroundPatterns(chunks, element, style, x, y, width, height, context) {
    const layers = backgroundLayerList(style.backgroundImage);
    const linearLayers = layers.filter((layer) => /(?:^|-)linear-gradient\(/.test(layer));
    if (linearLayers.length < 2 && !linearLayers.some((layer) => layer.includes("repeating-linear-gradient("))) {
      return;
    }

    const grid = parseGridPattern(linearLayers, style);
    if (grid) {
      const id = context.nextId("grid");
      chunks.push(
        `<defs><pattern id="${id}" width="${grid.width}" height="${grid.height}" patternUnits="userSpaceOnUse" x="${grid.x}" y="${grid.y}">${grid.lines.join("")}</pattern></defs>`,
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id})"/>`,
      );
      context.stats.cssPatterns = (context.stats.cssPatterns || 0) + 1;
      return;
    }

    const stripe = parseRepeatingStripePattern(linearLayers, style);
    if (!stripe) {
      return;
    }

    const id = context.nextId("stripe");
    chunks.push(
      `<defs><pattern id="${id}" width="${stripe.width}" height="${stripe.height}" patternUnits="userSpaceOnUse" x="${stripe.x}" y="${stripe.y}">${stripe.lines.join("")}</pattern></defs>`,
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id})"/>`,
    );
    context.stats.cssPatterns = (context.stats.cssPatterns || 0) + 1;
  }

  function appendPseudoElement(chunks, element, pseudo, parentX, parentY, parentWidth, parentHeight, context) {
    const style = element.ownerDocument.defaultView.getComputedStyle(element, pseudo);
    if (!isVisiblePseudo(style)) {
      return;
    }

    const box = pseudoBox(style, parentX, parentY, parentWidth, parentHeight);
    if (!box || box.width <= 0 || box.height <= 0) {
      return;
    }

    const pseudoChunks = [];
    appendBox(pseudoChunks, { tagName: "PSEUDO" }, style, box.x, box.y, box.width, box.height, context);
    appendPseudoText(pseudoChunks, style, box, context);

    if (!pseudoChunks.length) {
      return;
    }

    if (needsOpacity(style)) {
      chunks.push(`<g id="${escapeAttr(pseudoName(element, pseudo))}" opacity="${round(Number(style.opacity))}">`, ...pseudoChunks, `</g>`);
    } else {
      chunks.push(...pseudoChunks);
    }

    context.stats.pseudoElements = (context.stats.pseudoElements || 0) + 1;
  }

  function isVisiblePseudo(style) {
    if (!style || style.content === "none" || style.content === "normal") {
      return false;
    }
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    return true;
  }

  function pseudoBox(style, parentX, parentY, parentWidth, parentHeight) {
    const width = readCssLength(style.width, parentWidth);
    const height = readCssLength(style.height, parentHeight);
    const inset = {
      top: readCssLength(style.top, parentHeight),
      right: readCssLength(style.right, parentWidth),
      bottom: readCssLength(style.bottom, parentHeight),
      left: readCssLength(style.left, parentWidth),
    };

    let boxWidth = width;
    let boxHeight = height;
    if (!boxWidth && Number.isFinite(inset.left) && Number.isFinite(inset.right)) {
      boxWidth = Math.max(0, parentWidth - inset.left - inset.right);
    }
    if (!boxHeight && Number.isFinite(inset.top) && Number.isFinite(inset.bottom)) {
      boxHeight = Math.max(0, parentHeight - inset.top - inset.bottom);
    }

    const contentText = pseudoContent(style.content);
    if (!boxWidth && contentText) {
      boxWidth = Math.max(1, contentText.length * (parseFloat(style.fontSize) || 14) * 0.58);
    }
    if (!boxHeight && contentText) {
      boxHeight = parseLineHeight(style.lineHeight, parseFloat(style.fontSize) || 14);
    }

    if (!boxWidth || !boxHeight) {
      return null;
    }

    let x = parentX;
    let y = parentY;
    if (Number.isFinite(inset.left)) {
      x = parentX + inset.left;
    } else if (Number.isFinite(inset.right)) {
      x = parentX + parentWidth - inset.right - boxWidth;
    }

    if (Number.isFinite(inset.top)) {
      y = parentY + inset.top;
    } else if (Number.isFinite(inset.bottom)) {
      y = parentY + parentHeight - inset.bottom - boxHeight;
    }

    const offset = transformOffset(style.transform, boxWidth, boxHeight);
    return {
      x: round(x + offset.x),
      y: round(y + offset.y),
      width: round(boxWidth),
      height: round(boxHeight),
    };
  }

  function appendPseudoText(chunks, style, box, context) {
    const text = pseudoContent(style.content);
    if (!text) {
      return;
    }

    const fontSize = parseFloat(style.fontSize) || 14;
    const lineHeight = parseLineHeight(style.lineHeight, fontSize);
    const color = rgbaToHex(style.color) || "#000000";
    const fontFamily = firstFont(style.fontFamily || "Inter");
    const fontWeight = style.fontWeight || "400";
    const textAnchor = style.textAlign === "center" ? "middle" : style.textAlign === "right" ? "end" : "start";
    const x = textAnchor === "middle" ? box.x + box.width / 2 : textAnchor === "end" ? box.x + box.width : box.x;
    const y = box.y + Math.max(fontSize, (box.height - lineHeight) / 2 + fontSize);

    chunks.push(
      `<text x="${round(x)}" y="${round(y)}" fill="${color}" font-family="${escapeAttr(fontFamily)}" font-size="${round(fontSize)}" font-weight="${escapeAttr(fontWeight)}" text-anchor="${textAnchor}">${escapeText(text)}</text>`,
    );
    context.stats.texts += 1;
  }

  async function appendBackgroundImage(chunks, element, style, x, y, width, height, context) {
    const url = cssUrl(style.backgroundImage);
    if (!url) {
      return;
    }

    const stats = context.stats;
    const resolved = resolveUrl(element.ownerDocument, url);

    if (isSvgSource(resolved)) {
      const svg = await loadSvgSource(resolved, element.ownerDocument);
      if (svg) {
        const placement = backgroundImagePlacement(style, x, y, width, height, svgNaturalSize(svg, width, height));
        chunks.push(svgImageFrame({
          id: context.nextId("svg-bg"),
          svg: applySvgCurrentColor(svg, rgbaToHex(style.color) || "#000000"),
          frame: { x, y, width, height },
          image: placement,
          radius: parseFloat(style.borderTopLeftRadius) || 0,
        }));
        stats.svgIcons = (stats.svgIcons || 0) + 1;
        return;
      }
    }

    const natural = await imageNaturalSize(resolved, context);
    const placement = backgroundImagePlacement(style, x, y, width, height, natural || { width, height });
    const embedded = await embedImage(resolved);
    stats.images = (stats.images || 0) + 1;
    if (embedded !== resolved) {
      stats.embeddedImages = (stats.embeddedImages || 0) + 1;
    }
    chunks.push(...imageFrame({
      id: `bg-${stats.nodes}-${stats.images}`,
      href: embedded,
      frame: { x, y, width, height },
      image: placement,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
    }));
  }

  async function appendImage(chunks, element, style, x, y, width, height, context) {
    if (element.tagName !== "IMG") {
      return;
    }

    const src = element.currentSrc || element.src;
    if (!src) {
      return;
    }

    const stats = context.stats;
    stats.images = (stats.images || 0) + 1;

    if (isSvgSource(src)) {
      const svg = await loadSvgSource(src, element.ownerDocument);
      if (svg) {
        const placement = replacedImagePlacement(element, style, x, y, width, height);
        chunks.push(svgImageFrame({
          id: context.nextId("svg-img"),
          svg: applySvgCurrentColor(svg, rgbaToHex(style.color) || "#000000"),
          frame: { x, y, width, height },
          image: placement,
          radius: parseFloat(style.borderTopLeftRadius) || 0,
        }));
        stats.svgIcons = (stats.svgIcons || 0) + 1;
        return;
      }
    }

    const embedded = await embedImage(src);
    if (embedded !== src) {
      stats.embeddedImages = (stats.embeddedImages || 0) + 1;
    }
    const placement = replacedImagePlacement(element, style, x, y, width, height);
    chunks.push(...imageFrame({
      id: context.nextId("img"),
      href: embedded,
      frame: { x, y, width, height },
      image: placement,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
    }));
  }

  function appendText(context, element, style) {
    const lines = getDirectTextLines(context, element, style);
    if (!lines.length) {
      return;
    }

    const color = rgbaToHex(style.color) || "#000000";
    const fontSize = parseFloat(style.fontSize) || 16;
    const fontFamily = firstFont(style.fontFamily);
    const fontWeight = style.fontWeight;
    const letterSpacing = parseFloat(style.letterSpacing);
    const letterSpacingAttr = Number.isFinite(letterSpacing) ? ` letter-spacing="${round(letterSpacing)}"` : "";
    const textDecoration = style.textDecorationLine && style.textDecorationLine !== "none"
      ? ` text-decoration="${escapeAttr(style.textDecorationLine)}"`
      : "";
    const fontStyle = style.fontStyle && style.fontStyle !== "normal" ? ` font-style="${escapeAttr(style.fontStyle)}"` : "";
    const shadow = parseShadow(style.textShadow);
    const filterId = shadow ? context.nextId("text-shadow") : "";
    if (shadow) {
      context.chunks.push(
        `<defs><filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${shadow.dx}" dy="${shadow.dy}" stdDeviation="${shadow.blur}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}"/></filter></defs>`,
      );
    }
    const filterAttr = shadow ? ` filter="url(#${filterId})"` : "";

    lines.forEach((line) => {
      context.stats.texts += 1;
      context.chunks.push(
        `<text x="${line.x}" y="${line.y}" fill="${color}" font-family="${escapeAttr(fontFamily)}" font-size="${round(fontSize)}" font-weight="${escapeAttr(fontWeight)}"${fontStyle}${letterSpacingAttr}${textDecoration}${filterAttr} textLength="${line.width}" lengthAdjust="spacingAndGlyphs">${escapeText(line.text)}</text>`,
      );
    });
  }

  function getDirectTextLines(context, element, style) {
    const textNodes = Array.from(element.childNodes).filter(
      (node) => node.nodeType === context.doc.defaultView.Node.TEXT_NODE && normalizeText(node.textContent || ""),
    );
    if (!textNodes.length) {
      return [];
    }

    const fontSize = parseFloat(style.fontSize) || 16;
    const lineTolerance = Math.max(3, fontSize * 0.35);
    const words = [];

    textNodes.forEach((node) => {
      const value = node.textContent || "";
      const matches = value.matchAll(/\S+/g);
      for (const match of matches) {
        const range = context.doc.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        range.detach();

        if (rect.width > 0 && rect.height > 0) {
          words.push({
            text: applyTextTransform(match[0], style.textTransform),
            left: rect.left + context.doc.defaultView.scrollX - context.rootX,
            right: rect.right + context.doc.defaultView.scrollX - context.rootX,
            top: rect.top + context.doc.defaultView.scrollY - context.rootY,
            bottom: rect.bottom + context.doc.defaultView.scrollY - context.rootY,
          });
        }
      }
    });

    const lines = [];
    words.forEach((word) => {
      let line = lines.find((candidate) => Math.abs(candidate.top - word.top) <= lineTolerance);
      if (!line) {
        line = { top: word.top, bottom: word.bottom, words: [] };
        lines.push(line);
      }
      line.words.push(word);
      line.top = Math.min(line.top, word.top);
      line.bottom = Math.max(line.bottom, word.bottom);
    });

    return lines
      .map((line) => {
        const sortedWords = line.words.sort((a, b) => a.left - b.left);
        return {
          text: sortedWords.map((word) => word.text).join(" "),
          x: round(Math.min(...sortedWords.map((word) => word.left))),
          width: round(Math.max(...sortedWords.map((word) => word.right)) - Math.min(...sortedWords.map((word) => word.left))),
          y: round(line.bottom - Math.max(1, fontSize * 0.12)),
        };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function isVisible(element, style) {
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.right >= 0;
  }

  function analyzeLayout(style, element, context) {
    if (style.display.includes("flex") || style.display.includes("grid")) {
      if (element.children.length === 0) {
        return null;
      }
      const type = style.display.includes("grid") ? "grid" : "flex";
      const direction = type === "grid"
        ? dominantVisualDirection(element)
        : style.flexDirection?.startsWith("row") ? "horizontal" : "vertical";
      return {
        type,
        direction,
        gap: readGap(style, direction),
        padding: readPadding(style),
        align: style.alignItems || "",
        justify: style.justifyContent || "",
        columns: type === "grid" ? gridTrackCount(style.gridTemplateColumns) : 0,
        rows: type === "grid" ? gridTrackCount(style.gridTemplateRows) : 0,
        confidence: 1,
        order: "visual",
      };
    }

    if (element.children.length < 2) {
      return null;
    }

    const boxes = Array.from(element.children)
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (boxes.length < 2) {
      return null;
    }

    const sameLeft = boxes.every((rect) => Math.abs(rect.left - boxes[0].left) < 2);
    const sameTop = boxes.every((rect) => Math.abs(rect.top - boxes[0].top) < 2);
    if (sameLeft) {
      return {
        type: "inferred",
        direction: "vertical",
        gap: inferredGap(boxes, "vertical"),
        padding: readPadding(style),
        align: "start",
        justify: "start",
        columns: 1,
        rows: boxes.length,
        confidence: 0.72,
        order: "visual",
      };
    }
    if (sameTop) {
      return {
        type: "inferred",
        direction: "horizontal",
        gap: inferredGap(boxes, "horizontal"),
        padding: readPadding(style),
        align: "start",
        justify: "start",
        columns: boxes.length,
        rows: 1,
        confidence: 0.72,
        order: "visual",
      };
    }
    return null;
  }

  function readPadding(style) {
    return {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
  }

  function readGap(style, direction) {
    const rowGap = parseFloat(style.rowGap);
    const columnGap = parseFloat(style.columnGap);
    if (direction === "horizontal") {
      return Number.isFinite(columnGap) ? columnGap : 0;
    }
    return Number.isFinite(rowGap) ? rowGap : 0;
  }

  function gridTrackCount(value) {
    const text = String(value || "");
    if (!text || text === "none") {
      return 0;
    }
    const repeat = text.match(/repeat\((\d+)/);
    if (repeat) {
      return Number.parseInt(repeat[1], 10) || 0;
    }
    return cssParser().splitSpace(text).filter((item) => item && item !== "/").length;
  }

  function dominantVisualDirection(element) {
    const boxes = childBoxes(element);
    if (boxes.length < 2) {
      return "vertical";
    }
    const rows = clusterPositions(boxes.map((box) => box.top));
    const columns = clusterPositions(boxes.map((box) => box.left));
    return columns.length >= rows.length ? "horizontal" : "vertical";
  }

  function childBoxes(element) {
    return Array.from(element.children)
      .map((child) => ({ child, rect: child.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .map((item) => ({
        child: item.child,
        left: item.rect.left,
        top: item.rect.top,
        right: item.rect.right,
        bottom: item.rect.bottom,
      }));
  }

  function clusterPositions(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];
    sorted.forEach((value) => {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(last[last.length - 1] - value) > 3) {
        clusters.push([value]);
      } else {
        last.push(value);
      }
    });
    return clusters;
  }

  function inferredGap(boxes, direction) {
    const sorted = [...boxes].sort((a, b) => direction === "horizontal" ? a.left - b.left : a.top - b.top);
    const gaps = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      gaps.push(direction === "horizontal" ? current.left - previous.right : current.top - previous.bottom);
    }
    const usable = gaps.filter((gap) => Number.isFinite(gap) && gap >= 0);
    if (!usable.length) {
      return 0;
    }
    return round(usable.reduce((sum, gap) => sum + gap, 0) / usable.length);
  }

  function layoutChildren(element, layout) {
    const children = Array.from(element.children);
    if (!layout || layout.order !== "visual") {
      return children;
    }
    return children.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (layout.direction === "horizontal") {
        return ar.left - br.left || ar.top - br.top;
      }
      return ar.top - br.top || ar.left - br.left;
    });
  }

  function readBackground(doc) {
    const bodyBg = rgbaToHex(doc.defaultView.getComputedStyle(doc.body).backgroundColor);
    const htmlBg = rgbaToHex(doc.defaultView.getComputedStyle(doc.documentElement).backgroundColor);
    return bodyBg || htmlBg || "#ffffff";
  }

  function rgbaToHex(value, currentColor = "") {
    const color = parseCssColor(value, currentColor);
    return color ? colorToHex(color) : "";
  }

  function parseCssColor(value, currentColor = "") {
    const text = String(value || "").trim();
    if (!text || text === "none" || text === "transparent") {
      return null;
    }
    if (text === "currentColor") {
      return parseCssColor(currentColor) || { r: 0, g: 0, b: 0, a: 1 };
    }
    if (text.startsWith("#")) {
      return parseHexColor(text);
    }
    if (/^rgba?\(/i.test(text)) {
      return parseRgbColor(text);
    }
    if (/^color-mix\(/i.test(text)) {
      return parseColorMix(text, currentColor);
    }
    if (/^color\(srgb/i.test(text)) {
      return parseSrgbColor(text);
    }
    return namedColor(text);
  }

  function parseHexColor(value) {
    const hex = String(value).replace("#", "").trim();
    if (/^[0-9a-fA-F]{3,4}$/.test(hex)) {
      const parts = hex.split("").map((part) => part + part);
      return {
        r: parseInt(parts[0], 16),
        g: parseInt(parts[1], 16),
        b: parseInt(parts[2], 16),
        a: parts[3] ? round(parseInt(parts[3], 16) / 255) : 1,
      };
    }
    if (/^[0-9a-fA-F]{6,8}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? round(parseInt(hex.slice(6, 8), 16) / 255) : 1,
      };
    }
    return null;
  }

  function parseRgbColor(value) {
    const match = String(value).match(/rgba?\((.*)\)/i);
    if (!match) {
      return null;
    }
    const body = match[1].trim();
    const parts = body.includes(",")
      ? body.split(",").map((part) => part.trim())
      : body.replace(/\s*\/\s*/, " / ").split(/\s+/).filter(Boolean);
    const slashIndex = parts.indexOf("/");
    const channels = slashIndex >= 0 ? parts.slice(0, slashIndex) : parts.slice(0, 3);
    const alphaPart = slashIndex >= 0 ? parts[slashIndex + 1] : parts[3];
    if (channels.length < 3) {
      return null;
    }
    return {
      r: colorChannel(channels[0]),
      g: colorChannel(channels[1]),
      b: colorChannel(channels[2]),
      a: alphaPart === undefined ? 1 : alphaChannel(alphaPart),
    };
  }

  function parseSrgbColor(value) {
    const match = String(value).match(/color\(srgb\s+(.*)\)/i);
    if (!match) {
      return null;
    }
    const parts = match[1].replace(/\s*\/\s*/, " / ").split(/\s+/).filter(Boolean);
    const slashIndex = parts.indexOf("/");
    const channels = slashIndex >= 0 ? parts.slice(0, slashIndex) : parts.slice(0, 3);
    const alphaPart = slashIndex >= 0 ? parts[slashIndex + 1] : undefined;
    if (channels.length < 3) {
      return null;
    }
    return {
      r: clampColor(Number.parseFloat(channels[0]) * 255),
      g: clampColor(Number.parseFloat(channels[1]) * 255),
      b: clampColor(Number.parseFloat(channels[2]) * 255),
      a: alphaPart === undefined ? 1 : alphaChannel(alphaPart),
    };
  }

  function parseColorMix(value, currentColor = "") {
    const match = String(value).match(/^color-mix\(\s*in\s+[^,]+,\s*(.*)\)$/i);
    if (!match) {
      return null;
    }
    const stops = splitCssArgs(match[1]).map((part) => parseColorMixStop(part, currentColor)).filter(Boolean);
    if (stops.length < 2) {
      return stops[0]?.color || null;
    }
    const firstWeight = stops[0].weight ?? (stops[1].weight === undefined ? 50 : 100 - stops[1].weight);
    const secondWeight = stops[1].weight ?? (100 - firstWeight);
    return mixColors(stops[0].color, stops[1].color, firstWeight, secondWeight);
  }

  function parseColorMixStop(value, currentColor = "") {
    const text = String(value || "").trim();
    const percent = text.match(/(-?\d+(?:\.\d+)?)%\s*$/);
    const colorText = percent ? text.slice(0, percent.index).trim() : text;
    const color = parseCssColor(colorText, currentColor);
    if (!color) {
      return null;
    }
    return {
      color,
      weight: percent ? Number.parseFloat(percent[1]) : undefined,
    };
  }

  function mixColors(first, second, firstWeight, secondWeight) {
    const a = Math.max(0, firstWeight || 0);
    const b = Math.max(0, secondWeight || 0);
    const total = a + b || 1;
    const ratio = a / total;
    return {
      r: clampColor(first.r * ratio + second.r * (1 - ratio)),
      g: clampColor(first.g * ratio + second.g * (1 - ratio)),
      b: clampColor(first.b * ratio + second.b * (1 - ratio)),
      a: clampNumber(first.a * ratio + second.a * (1 - ratio), 0, 1),
    };
  }

  function colorChannel(value) {
    const text = String(value || "").trim();
    if (text.endsWith("%")) {
      return clampColor((Number.parseFloat(text) / 100) * 255);
    }
    return clampColor(Number.parseFloat(text));
  }

  function alphaChannel(value) {
    const text = String(value || "").trim();
    if (text.endsWith("%")) {
      return clampNumber(Number.parseFloat(text) / 100, 0, 1);
    }
    return clampNumber(Number.parseFloat(text), 0, 1);
  }

  function clampColor(value) {
    return Math.round(clampNumber(value, 0, 255));
  }

  function colorToHex(color) {
    if (!color || color.a <= 0) {
      return "";
    }
    const channels = [color.r, color.g, color.b].map((part) => clampColor(part).toString(16).padStart(2, "0"));
    if (color.a < 1) {
      channels.push(Math.round(clampNumber(color.a, 0, 1) * 255).toString(16).padStart(2, "0"));
    }
    return `#${channels.join("")}`;
  }

  function namedColor(value) {
    const colors = {
      black: { r: 0, g: 0, b: 0, a: 1 },
      white: { r: 255, g: 255, b: 255, a: 1 },
      red: { r: 255, g: 0, b: 0, a: 1 },
      green: { r: 0, g: 128, b: 0, a: 1 },
      blue: { r: 0, g: 0, b: 255, a: 1 },
      transparent: null,
    };
    return colors[String(value || "").toLowerCase()] || null;
  }

  function parseShadow(value) {
    return parseShadows(value).find((item) => !item.inset) || null;
  }

  function parseShadows(value) {
    if (!value || value === "none") {
      return [];
    }

    return splitCssArgs(value)
      .map((shadow) => {
        const colorValue = cssParser().firstColor(shadow) || "#000000";
        const color = rgbaToHex(colorValue);
        const opacity = alphaFromColor(colorValue);
        const numbers = cssParser().numberTokens(shadow);

        return {
          inset: /\binset\b/.test(shadow),
          dx: round(numbers[0] || 0),
          dy: round(numbers[1] || 0),
          blur: round(Math.max(0, (numbers[2] || 0) / 2)),
          spread: round(numbers[3] || 0),
          color,
          opacity,
        };
      })
      .filter((shadow) => shadow.color);
  }

  function alphaFromColor(value) {
    const color = parseCssColor(value);
    return color ? color.a : 1;
  }

  function cssUrl(value) {
    if (!value || value === "none") {
      return "";
    }

    return cssParser().extractUrl(value);
  }

  function backgroundLayerList(value) {
    if (!value || value === "none") {
      return [];
    }
    return splitCssArgs(value).filter(Boolean);
  }

  function resolveUrl(doc, url) {
    try {
      return new URL(url, doc.baseURI).href;
    } catch (error) {
      return url;
    }
  }

  function backgroundImagePlacement(style, x, y, width, height, natural = { width, height }) {
    const size = firstBackgroundLayer(style.backgroundSize || "auto");
    const position = firstBackgroundLayer(style.backgroundPosition || "50% 50%");

    if (/\bcover\b/i.test(size)) {
      return { ...fittedRect({ x, y, width, height }, natural, "cover", position), preserveAspectRatio: "meet" };
    }

    if (/\bcontain\b/i.test(size)) {
      return { ...fittedRect({ x, y, width, height }, natural, "contain", position), preserveAspectRatio: "meet" };
    }

    const explicit = explicitBackgroundSize(size, width, height, natural);
    if (explicit) {
      const offset = objectOffset(position, width - explicit.width, height - explicit.height);
      return {
        x: round(x + offset.x),
        y: round(y + offset.y),
        width: round(explicit.width),
        height: round(explicit.height),
        preserveAspectRatio: explicit.distorts ? "none" : "meet",
      };
    }

    return { ...fittedRect({ x, y, width, height }, natural, "none", position), preserveAspectRatio: "meet" };
  }

  function replacedImagePlacement(element, style, x, y, width, height) {
    const natural = {
      width: element.naturalWidth || width,
      height: element.naturalHeight || height,
    };
    const fit = style.objectFit || "fill";
    const placement = fittedRect({ x, y, width, height }, natural, fit, style.objectPosition || "50% 50%");
    return {
      ...placement,
      preserveAspectRatio: fit === "fill" ? "none" : "meet",
    };
  }

  function fittedRect(frame, natural, fit, position) {
    if (!natural.width || !natural.height || fit === "fill") {
      return { ...frame };
    }

    const scaleContain = Math.min(frame.width / natural.width, frame.height / natural.height);
    const scaleCover = Math.max(frame.width / natural.width, frame.height / natural.height);
    const scale = fit === "cover"
      ? scaleCover
      : fit === "none"
        ? 1
        : fit === "scale-down"
          ? Math.min(1, scaleContain)
          : scaleContain;
    const width = natural.width * scale;
    const height = natural.height * scale;
    const offset = objectOffset(position, frame.width - width, frame.height - height);

    return {
      x: round(frame.x + offset.x),
      y: round(frame.y + offset.y),
      width: round(width),
      height: round(height),
    };
  }

  function objectOffset(position, freeX, freeY) {
    const parts = String(position).toLowerCase().split(/\s+/);
    const xToken = parts.find((part) => ["left", "center", "right"].includes(part) || part.endsWith("%")) || "50%";
    const yToken = parts.find((part, index) => index > 0 && (["top", "center", "bottom"].includes(part) || part.endsWith("%"))) || "50%";

    return {
      x: round(freeX * positionRatio(xToken, "x")),
      y: round(freeY * positionRatio(yToken, "y")),
    };
  }

  function positionRatio(token, axis) {
    if (token === "left" || token === "top") {
      return 0;
    }
    if (token === "right" || token === "bottom") {
      return 1;
    }
    if (token.endsWith("%")) {
      return Number.parseFloat(token) / 100;
    }
    return 0.5;
  }

  function firstBackgroundLayer(value) {
    return splitCssArgs(value || "")[0] || value || "";
  }

  function explicitBackgroundSize(value, frameWidth, frameHeight, natural) {
    const parts = cssParser().splitSpace(value || "").filter(Boolean);
    if (!parts.length || parts.some((part) => ["cover", "contain"].includes(part))) {
      return null;
    }

    const widthAuto = !parts[0] || parts[0] === "auto";
    const heightAuto = !parts[1] || parts[1] === "auto";
    if (widthAuto && heightAuto) {
      return null;
    }

    const naturalRatio = natural.width && natural.height ? natural.width / natural.height : 1;
    let targetWidth = widthAuto ? 0 : readCssLength(parts[0], frameWidth);
    let targetHeight = heightAuto ? 0 : readCssLength(parts[1], frameHeight);

    if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
      targetWidth = targetHeight * naturalRatio;
    }
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
      targetHeight = targetWidth / naturalRatio;
    }

    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
      return null;
    }

    return {
      width: targetWidth,
      height: targetHeight,
      distorts: !widthAuto && !heightAuto && Math.abs((targetWidth / targetHeight) - naturalRatio) > 0.01,
    };
  }

  function readCssLength(value, basis) {
    const text = String(value || "").trim();
    if (!text || text === "auto" || text === "normal") {
      return Number.NaN;
    }
    if (text.endsWith("%")) {
      return (Number.parseFloat(text) || 0) * basis / 100;
    }
    return Number.parseFloat(text);
  }

  async function imageNaturalSize(src, context) {
    if (!src) {
      return null;
    }
    if (context.imageSizeCache.has(src)) {
      return context.imageSizeCache.get(src);
    }

    const promise = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => resolve(null);
      image.src = src;
    });
    context.imageSizeCache.set(src, promise);
    return promise;
  }

  function svgNaturalSize(svg, fallbackWidth, fallbackHeight) {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName.toLowerCase() !== "svg") {
      return { width: fallbackWidth, height: fallbackHeight };
    }

    const viewBox = svgElement.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number.parseFloat);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    }

    return {
      width: parseSvgLength(svgElement.getAttribute("width")) || fallbackWidth,
      height: parseSvgLength(svgElement.getAttribute("height")) || fallbackHeight,
    };
  }

  function transformOffset(value, width, height) {
    if (!value || value === "none") {
      return { x: 0, y: 0 };
    }

    const matrix = String(value).match(/matrix\(([^)]+)\)/);
    if (matrix) {
      const parts = matrix[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return {
        x: Number.isFinite(parts[4]) ? parts[4] : 0,
        y: Number.isFinite(parts[5]) ? parts[5] : 0,
      };
    }

    const translate = String(value).match(/translate(?:3d|X|Y)?\(([^)]+)\)/);
    if (!translate) {
      return { x: 0, y: 0 };
    }

    const parts = cssParser().splitComma(translate[1]);
    const x = parseTranslatePart(parts[0], width);
    const y = parseTranslatePart(parts[1] || "0", height);
    return { x, y };
  }

  function parseTranslatePart(value, basis) {
    const text = String(value || "0").trim();
    if (text.endsWith("%")) {
      return (Number.parseFloat(text) || 0) * basis / 100;
    }
    return Number.parseFloat(text) || 0;
  }

  function pseudoContent(value) {
    const text = String(value || "");
    if (!text || text === "none" || text === "normal" || text === "\"\"" || text === "''") {
      return "";
    }

    return text
      .replace(/^["']|["']$/g, "")
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'");
  }

  function pseudoName(element, pseudo) {
    return `${layerName(element)}-${pseudo.replace(/[:]/g, "")}`;
  }

  function imageFrame({ id, href, frame, image, radius }) {
    const clipId = `clip-${id}`;
    const preserveAspectRatio = image.preserveAspectRatio || "meet";
    return [
      `<defs><clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${round(radius)}"/></clipPath></defs>`,
      `<image x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" href="${escapeAttr(href)}" preserveAspectRatio="${preserveAspectRatio}" clip-path="url(#${clipId})"/>`,
    ];
  }

  function svgImageFrame({ id, svg, frame, image, radius }) {
    const clipId = `clip-${id}`;
    const nested = prepareNestedSvg(svg, image.x, image.y, image.width, image.height);
    if (!nested) {
      return "";
    }
    return [
      `<defs><clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${round(radius)}"/></clipPath></defs>`,
      `<g clip-path="url(#${clipId})">${nested}</g>`,
    ].join("");
  }

  function isInlineSvg(element) {
    return element.namespaceURI === "http://www.w3.org/2000/svg" && element.tagName.toLowerCase() === "svg";
  }

  function serializeInlineSvg(element, style, x, y, width, height) {
    const clone = element.cloneNode(true);
    inlineSvgPresentation(element, clone);
    sanitizeSvg(clone);
    return prepareNestedSvg(
      applySvgCurrentColor(new XMLSerializer().serializeToString(clone), rgbaToHex(style.color) || "#000000"),
      x,
      y,
      width,
      height,
    );
  }

  function inlineSvgPresentation(source, clone) {
    const sourceNodes = [source, ...source.querySelectorAll("*")];
    const cloneNodes = [clone, ...clone.querySelectorAll("*")];
    sourceNodes.forEach((sourceNode, index) => {
      const cloneNode = cloneNodes[index];
      if (!cloneNode) {
        return;
      }
      const style = source.ownerDocument.defaultView.getComputedStyle(sourceNode);
      applySvgPresentationAttributes(cloneNode, style);
    });
  }

  function applySvgPresentationAttributes(node, style) {
    const fill = svgPaint(style.fill);
    const stroke = svgPaint(style.stroke);
    const opacity = Number(style.opacity);

    if (fill) {
      node.setAttribute("fill", fill);
    }
    if (stroke) {
      node.setAttribute("stroke", stroke);
    }
    if (style.strokeWidth && style.strokeWidth !== "0px") {
      node.setAttribute("stroke-width", round(parseFloat(style.strokeWidth) || 0));
    }
    if (style.strokeLinecap && style.strokeLinecap !== "butt") {
      node.setAttribute("stroke-linecap", style.strokeLinecap);
    }
    if (style.strokeLinejoin && style.strokeLinejoin !== "miter") {
      node.setAttribute("stroke-linejoin", style.strokeLinejoin);
    }
    if (style.strokeDasharray && style.strokeDasharray !== "none") {
      node.setAttribute("stroke-dasharray", style.strokeDasharray);
    }
    if (Number.isFinite(opacity) && opacity >= 0 && opacity < 1) {
      node.setAttribute("opacity", round(opacity));
    }
  }

  function svgPaint(value) {
    if (!value || value === "none") {
      return value === "none" ? "none" : "";
    }
    if (String(value).startsWith("url(")) {
      return value;
    }
    return rgbaToHex(value);
  }

  function prepareNestedSvg(svg, x, y, width, height) {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
      return "";
    }

    sanitizeSvg(svgElement);
    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgElement.setAttribute("x", String(x));
    svgElement.setAttribute("y", String(y));
    svgElement.setAttribute("width", String(width));
    svgElement.setAttribute("height", String(height));
    svgElement.setAttribute("overflow", "visible");

    if (!svgElement.getAttribute("viewBox")) {
      const sourceWidth = parseSvgLength(svgElement.getAttribute("width")) || width;
      const sourceHeight = parseSvgLength(svgElement.getAttribute("height")) || height;
      svgElement.setAttribute("viewBox", `0 0 ${sourceWidth} ${sourceHeight}`);
    }

    return new XMLSerializer().serializeToString(svgElement);
  }

  function sanitizeSvg(svgElement) {
    svgElement.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
    svgElement.querySelectorAll("*").forEach((node) => {
      for (const attr of Array.from(node.attributes)) {
        if (attr.name.toLowerCase().startsWith("on")) {
          node.removeAttribute(attr.name);
        }
      }
    });
  }

  function isSvgSource(src) {
    const value = String(src || "");
    return value.startsWith("data:image/svg+xml") || /\.svg([?#].*)?$/i.test(value);
  }

  async function loadSvgSource(src, doc) {
    try {
      if (src.startsWith("data:image/svg+xml")) {
        return decodeSvgDataUrl(src);
      }

      const response = await fetch(resolveUrl(doc, src));
      if (!response.ok) {
        return "";
      }

      const text = await response.text();
      return text.trim().startsWith("<svg") || text.includes("<svg") ? text : "";
    } catch (error) {
      return "";
    }
  }

  function decodeSvgDataUrl(url) {
    const commaIndex = url.indexOf(",");
    if (commaIndex < 0) {
      return "";
    }

    const meta = url.slice(0, commaIndex);
    const data = url.slice(commaIndex + 1);
    try {
      return meta.includes(";base64") ? atob(data) : decodeURIComponent(data);
    } catch (error) {
      return "";
    }
  }

  function parseSvgLength(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function applySvgCurrentColor(svg, color) {
    return String(svg).replace(/\bcurrentColor\b/g, color || "#000000");
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function groupPlan(element, style, chunks, layout, options) {
    const affectsChildren = needsOpacity(style) || needsClip(style);
    if (chunks.length <= 1) {
      return { shouldGroup: affectsChildren, layout };
    }

    const hasOwnCompositeVisual = chunks.some((chunk) => chunk.startsWith("<rect")) &&
      chunks.some((chunk) => chunk.startsWith("<text") || chunk.startsWith("<image"));
    const hasMultipleTextLines = chunks.filter((chunk) => chunk.startsWith("<text")).length > 1;

    return {
      shouldGroup:
        hasOwnCompositeVisual ||
        hasMultipleTextLines ||
        affectsChildren,
      layout,
    };
  }

  function openGroup(group, element, style, x, y, width, height, context) {
    const attrs = [`id="${escapeAttr(groupName(element, group.layout))}"`];
    const defs = [];

    if (needsOpacity(style)) {
      attrs.push(`opacity="${round(Number(style.opacity))}"`);
    }

    if (needsClip(style)) {
      const clipId = context.nextId("clip");
      const radius = parseFloat(style.borderTopLeftRadius) || 0;
      defs.push(`<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${round(radius)}"/></clipPath></defs>`);
      attrs.push(`clip-path="url(#${clipId})"`);
    }

    return [...defs, `<g ${attrs.join(" ")}>`];
  }

  function needsOpacity(style) {
    const opacity = Number(style.opacity);
    return Number.isFinite(opacity) && opacity > 0 && opacity < 1;
  }

  function needsClip(style) {
    return ["hidden", "clip"].includes(style.overflow) ||
      ["hidden", "clip"].includes(style.overflowX) ||
      ["hidden", "clip"].includes(style.overflowY);
  }

  function shouldRasterize(element, style) {
    if (element.tagName === "BODY" || element.tagName === "HTML") {
      return false;
    }

    if (["CANVAS", "VIDEO", "IFRAME", "SELECT", "INPUT", "TEXTAREA"].includes(element.tagName)) {
      return true;
    }

    const hasComplexEffect =
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.mixBlendMode !== "normal" ||
      isUnsupportedClipPath(style.clipPath) ||
      style.maskImage !== "none" ||
      style.webkitMaskImage !== "none";

    const hasTransform = style.transform && style.transform !== "none";
    const hasComplexBackground = hasUnsupportedEditableBackground(style);

    return hasComplexEffect || hasTransform || hasComplexBackground;
  }

  function isUnsupportedClipPath(value) {
    if (!value || value === "none") {
      return false;
    }
    return !String(value).trim().startsWith("polygon(");
  }

  function hasUnsupportedEditableBackground(style) {
    const layers = backgroundLayerList(style.backgroundImage);
    if (!layers.length) {
      return false;
    }

    return layers.some((layer) => {
      const fn = cssParser().parseFunction(layer);
      if (!fn) {
        return !layer.startsWith("url(");
      }
      if (fn.name === "url") {
        return false;
      }
      return !["linear-gradient", "repeating-linear-gradient"].includes(fn.name);
    });
  }

  async function rasterizeElement(element, x, y, width, height) {
    if (width <= 0 || height <= 0 || width * height > 16000000) {
      return "";
    }

    try {
      const doc = element.ownerDocument;
      const clone = await cloneForRaster(element, doc, true);
      const wrapper = doc.createElement("div");
      wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      wrapper.style.overflow = "hidden";
      wrapper.appendChild(clone);

      const serialized = new XMLSerializer().serializeToString(wrapper);
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
        `<foreignObject width="100%" height="100%">${serialized}</foreignObject>`,
        `</svg>`,
      ].join("");
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return await svgImageToPngDataUrl(url, width, height);
    } catch (error) {
      return "";
    }
  }

  async function cloneForRaster(element, doc, isRoot = false) {
    if (element.tagName === "CANVAS") {
      const img = doc.createElement("img");
      try {
        img.src = element.toDataURL("image/png");
      } catch (error) {
        img.src = "";
      }
      img.style.width = `${element.getBoundingClientRect().width}px`;
      img.style.height = `${element.getBoundingClientRect().height}px`;
      return img;
    }

    const clone = element.cloneNode(false);
    inlineComputedStyle(element, clone, isRoot);

    if (clone.tagName === "IMG") {
      const src = element.currentSrc || element.src;
      clone.setAttribute("src", await embedImage(src));
    }

    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === doc.defaultView.Node.TEXT_NODE) {
        clone.appendChild(child.cloneNode(true));
      } else if (child.nodeType === doc.defaultView.Node.ELEMENT_NODE && !SKIP_TAGS.has(child.tagName)) {
        clone.appendChild(await cloneForRaster(child, doc));
      }
    }

    return clone;
  }

  function inlineComputedStyle(source, target, isRoot = false) {
    const style = source.ownerDocument.defaultView.getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    target.removeAttribute("id");
    target.style.cssText = Array.from(style)
      .map((name) => `${name}:${style.getPropertyValue(name)};`)
      .join("");
    target.style.width = `${rect.width}px`;
    target.style.height = `${rect.height}px`;
    target.style.boxSizing = "border-box";
    if (isRoot) {
      target.style.position = "relative";
      target.style.left = "auto";
      target.style.top = "auto";
      target.style.margin = "0";
      target.style.transformOrigin = "0 0";
    }
  }

  function svgImageToPngDataUrl(url, width, height) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.ceil(width));
          canvas.height = Math.max(1, Math.ceil(height));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("No se pudo rasterizar el nodo."));
      image.src = url;
    });
  }

  async function embedImage(url) {
    if (!url || url.startsWith("data:")) {
      return url;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return url;
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        return url;
      }

      return await blobToDataUrl(blob);
    } catch (error) {
      return url;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(blob);
    });
  }

  function layerName(element) {
    const pieces = [element.tagName.toLowerCase()];
    if (element.id) {
      pieces.push(element.id);
    }
    if (element.classList?.length) {
      pieces.push(Array.from(element.classList).slice(0, 3).join("."));
    }
    return pieces.join("-");
  }

  function groupName(element, layout) {
    const base = layerName(element);
    if (!layout) {
      return base;
    }
    const details = [
      layout.type,
      layout.direction,
      layout.gap ? `gap${round(layout.gap)}` : "",
      layout.padding ? `pad${paddingLabel(layout.padding)}` : "",
      layout.columns ? `cols${layout.columns}` : "",
    ].filter(Boolean).join("-");
    return `AutoLayout-${details}-${base}`;
  }

  function paddingLabel(padding) {
    const values = [padding.top, padding.right, padding.bottom, padding.left].map((value) => round(value));
    if (values.every((value) => value === 0)) {
      return "0";
    }
    if (values.every((value) => value === values[0])) {
      return String(values[0]);
    }
    return values.join("_");
  }

  function normalizeText(value) {
    return value
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function firstFont(value) {
    return value.split(",")[0].replace(/^["']|["']$/g, "").trim() || "Inter";
  }

  function parseLineHeight(value, fontSize) {
    if (value === "normal") {
      return fontSize * 1.2;
    }
    return Number.parseFloat(value) || fontSize * 1.2;
  }

  function readBorders(style, currentColor = "") {
    const sides = {
      top: readBorder(style.borderTopWidth, style.borderTopColor, style.borderTopStyle, currentColor),
      right: readBorder(style.borderRightWidth, style.borderRightColor, style.borderRightStyle, currentColor),
      bottom: readBorder(style.borderBottomWidth, style.borderBottomColor, style.borderBottomStyle, currentColor),
      left: readBorder(style.borderLeftWidth, style.borderLeftColor, style.borderLeftStyle, currentColor),
    };
    const visible = Object.values(sides).filter((side) => side.width > 0 && side.color);
    const isUniform = visible.length === 4 &&
      sides.top.width === sides.right.width &&
      sides.top.width === sides.bottom.width &&
      sides.top.width === sides.left.width &&
      sides.top.color === sides.right.color &&
      sides.top.color === sides.bottom.color &&
      sides.top.color === sides.left.color;

    return { ...sides, hasAny: visible.length > 0, isUniform };
  }

  function readOutline(style, currentColor = "") {
    const width = parseFloat(style.outlineWidth) || 0;
    const color = rgbaToHex(style.outlineColor, currentColor);
    if (!width || !color || style.outlineStyle === "none") {
      return null;
    }
    return {
      width,
      color,
      offset: parseFloat(style.outlineOffset) || 0,
    };
  }

  function readBorder(width, color, style, currentColor = "") {
    if (!style || style === "none" || style === "hidden") {
      return { width: 0, color: "", style: "none" };
    }
    return {
      width: parseFloat(width) || 0,
      color: rgbaToHex(color, currentColor),
      style,
    };
  }

  function borderLines(borders, x, y, width, height) {
    const lines = [];
    if (borders.top.width && borders.top.color) {
      lines.push(`<line x1="${x}" y1="${y + borders.top.width / 2}" x2="${x + width}" y2="${y + borders.top.width / 2}" stroke="${borders.top.color}" stroke-width="${round(borders.top.width)}"${dashAttr(borders.top)}/>`);
    }
    if (borders.right.width && borders.right.color) {
      lines.push(`<line x1="${x + width - borders.right.width / 2}" y1="${y}" x2="${x + width - borders.right.width / 2}" y2="${y + height}" stroke="${borders.right.color}" stroke-width="${round(borders.right.width)}"${dashAttr(borders.right)}/>`);
    }
    if (borders.bottom.width && borders.bottom.color) {
      lines.push(`<line x1="${x}" y1="${y + height - borders.bottom.width / 2}" x2="${x + width}" y2="${y + height - borders.bottom.width / 2}" stroke="${borders.bottom.color}" stroke-width="${round(borders.bottom.width)}"${dashAttr(borders.bottom)}/>`);
    }
    if (borders.left.width && borders.left.color) {
      lines.push(`<line x1="${x + borders.left.width / 2}" y1="${y}" x2="${x + borders.left.width / 2}" y2="${y + height}" stroke="${borders.left.color}" stroke-width="${round(borders.left.width)}"${dashAttr(borders.left)}/>`);
    }
    return lines;
  }

  function dashAttr(border) {
    const dash = dashPattern(border.style, border.width);
    return dash ? ` stroke-dasharray="${dash}"` : "";
  }

  function dashPattern(style, width) {
    if (style === "dashed") {
      return `${round(Math.max(3, width * 4))} ${round(Math.max(3, width * 3))}`;
    }
    if (style === "dotted") {
      return `${round(Math.max(1, width))} ${round(Math.max(2, width * 2))}`;
    }
    return "";
  }

  function isThinLine(width, height) {
    return (height > 0 && height <= 3 && width >= 8) ||
      (width > 0 && width <= 3 && height >= 8);
  }

  function isThinBorderConnector(borders, width, height) {
    const visible = [borders.top, borders.right, borders.bottom, borders.left].filter((side) => side.width > 0 && side.color);
    if (visible.length !== 1) {
      return false;
    }
    return isThinLine(width, height) || width >= 8 || height >= 8;
  }

  function connectorBorderColor(borders) {
    const side = [borders.top, borders.right, borders.bottom, borders.left].find((item) => item.width > 0 && item.color);
    return side?.color || "#000000";
  }

  function connectorBorderWidth(borders) {
    const side = [borders.top, borders.right, borders.bottom, borders.left].find((item) => item.width > 0 && item.color);
    return side?.width || 1;
  }

  function connectorDash(borders) {
    const side = [borders.top, borders.right, borders.bottom, borders.left].find((item) => item.width > 0 && item.color);
    return side ? dashPattern(side.style, side.width) : "";
  }

  function connectorLineFromBox(x, y, width, height, style, strokeWidth) {
    const horizontal = width >= height;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const length = horizontal ? Math.max(width, parseFloat(style.width) || width) : Math.max(height, parseFloat(style.height) || height);
    const line = horizontal
      ? { x1: round(cx - length / 2), y1: round(cy), x2: round(cx + length / 2), y2: round(cy) }
      : { x1: round(cx), y1: round(cy - length / 2), x2: round(cx), y2: round(cy + length / 2) };
    const rotation = transformRotation(style.transform);
    if (rotation) {
      line.transform = `rotate(${round(rotation)} ${round(cx)} ${round(cy)})`;
    }
    return line;
  }

  function transformRotation(value) {
    if (!value || value === "none") {
      return 0;
    }
    const matrix = String(value).match(/matrix\(([^)]+)\)/);
    if (!matrix) {
      const rotate = String(value).match(/rotate\((-?\d+(\.\d+)?)deg\)/);
      return rotate ? Number.parseFloat(rotate[1]) : 0;
    }
    const parts = matrix[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      return 0;
    }
    return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
  }

  function outlineShape(outline, x, y, width, height, radius) {
    const offset = outline.offset + outline.width / 2;
    const nextRadius = offsetRadius(radius, Math.max(0, offset));
    return boxShape(
      round(x - offset),
      round(y - offset),
      round(width + offset * 2),
      round(height + offset * 2),
      nextRadius,
      [`fill="none"`, `stroke="${outline.color}"`, `stroke-width="${round(outline.width)}"`],
    );
  }

  function insetShadowShapes(shadows, x, y, width, height, radius) {
    return shadows
      .filter((shadow) => Math.abs(shadow.dx) <= 1 && Math.abs(shadow.dy) <= 1 && shadow.blur <= 1)
      .map((shadow) => {
        const strokeWidth = Math.max(1, Math.abs(shadow.spread) || 1);
        const inset = strokeWidth / 2;
        return boxShape(
          round(x + inset),
          round(y + inset),
          round(Math.max(0, width - inset * 2)),
          round(Math.max(0, height - inset * 2)),
          offsetRadius(radius, -inset),
          [`fill="none"`, `stroke="${shadow.color}"`, `stroke-opacity="${round(shadow.opacity)}"`, `stroke-width="${round(strokeWidth)}"`],
        );
      });
  }

  function boxShape(x, y, width, height, radius, attrs) {
    const scaled = scaleRadius(radius, width, height);
    if (isUniformRadius(scaled)) {
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${round(scaled.topLeft.x)}" ry="${round(scaled.topLeft.y)}" ${attrs.join(" ")}/>`;
    }

    return `<path d="${roundedRectPath(x, y, width, height, scaled)}" ${attrs.join(" ")}/>`;
  }

  function polygonShape(points, attrs) {
    const d = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
      .join(" ");
    return `<path d="${d} Z" ${attrs.join(" ")}/>`;
  }

  function polygonClipPath(value, x, y, width, height) {
    const text = String(value || "").trim();
    if (!text.startsWith("polygon(")) {
      return null;
    }

    const fn = cssParser().parseFunction(text);
    if (!fn || fn.name !== "polygon") {
      return null;
    }

    const points = fn.args
      .map((point) => parsePolygonPoint(point, x, y, width, height))
      .filter(Boolean);
    return points.length >= 3 ? points : null;
  }

  function parsePolygonPoint(value, x, y, width, height) {
    const parts = cssParser().splitSpace(value);
    if (parts.length < 2) {
      return null;
    }
    return {
      x: round(x + cssLength(parts[0], width)),
      y: round(y + cssLength(parts[1], height)),
    };
  }

  function cssLength(value, basis) {
    const text = String(value || "").trim();
    if (text.endsWith("%")) {
      return (Number.parseFloat(text) || 0) * basis / 100;
    }
    return Number.parseFloat(text) || 0;
  }

  function isUniformRadius(radius) {
    return radius.topLeft.x === radius.topRight.x &&
      radius.topLeft.x === radius.bottomRight.x &&
      radius.topLeft.x === radius.bottomLeft.x &&
      radius.topLeft.y === radius.topRight.y &&
      radius.topLeft.y === radius.bottomRight.y &&
      radius.topLeft.y === radius.bottomLeft.y;
  }

  function roundedRectPath(x, y, width, height, radius) {
    const tl = radius.topLeft;
    const tr = radius.topRight;
    const br = radius.bottomRight;
    const bl = radius.bottomLeft;

    return [
      `M ${round(x + tl.x)} ${round(y)}`,
      `H ${round(x + width - tr.x)}`,
      tr.x || tr.y ? `A ${round(tr.x)} ${round(tr.y)} 0 0 1 ${round(x + width)} ${round(y + tr.y)}` : "",
      `V ${round(y + height - br.y)}`,
      br.x || br.y ? `A ${round(br.x)} ${round(br.y)} 0 0 1 ${round(x + width - br.x)} ${round(y + height)}` : "",
      `H ${round(x + bl.x)}`,
      bl.x || bl.y ? `A ${round(bl.x)} ${round(bl.y)} 0 0 1 ${round(x)} ${round(y + height - bl.y)}` : "",
      `V ${round(y + tl.y)}`,
      tl.x || tl.y ? `A ${round(tl.x)} ${round(tl.y)} 0 0 1 ${round(x + tl.x)} ${round(y)}` : "",
      "Z",
    ].filter(Boolean).join(" ");
  }

  function readRadius(style) {
    const box = {
      width: parseFloat(style.width) || 0,
      height: parseFloat(style.height) || 0,
    };
    return {
      topLeft: parseCornerRadius(style.borderTopLeftRadius, box),
      topRight: parseCornerRadius(style.borderTopRightRadius, box),
      bottomRight: parseCornerRadius(style.borderBottomRightRadius, box),
      bottomLeft: parseCornerRadius(style.borderBottomLeftRadius, box),
    };
  }

  function parseCornerRadius(value, box) {
    const parts = cssParser().splitSpace(value || "0");
    return {
      x: parseRadiusValue(parts[0], box.width),
      y: parseRadiusValue(parts[1] || parts[0], box.height),
    };
  }

  function parseRadiusValue(value, basis) {
    if (!value) {
      return 0;
    }
    if (String(value).endsWith("%")) {
      return (Number.parseFloat(value) || 0) * basis / 100;
    }
    return Number.parseFloat(value) || 0;
  }

  function scaleRadius(radius, width, height) {
    const copy = {
      topLeft: { ...radius.topLeft },
      topRight: { ...radius.topRight },
      bottomRight: { ...radius.bottomRight },
      bottomLeft: { ...radius.bottomLeft },
    };
    const scale = Math.min(
      1,
      width / Math.max(1, copy.topLeft.x + copy.topRight.x),
      width / Math.max(1, copy.bottomLeft.x + copy.bottomRight.x),
      height / Math.max(1, copy.topLeft.y + copy.bottomLeft.y),
      height / Math.max(1, copy.topRight.y + copy.bottomRight.y),
    );

    Object.values(copy).forEach((corner) => {
      corner.x = round(Math.max(0, corner.x * scale));
      corner.y = round(Math.max(0, corner.y * scale));
    });
    return copy;
  }

  function offsetRadius(radius, amount) {
    return {
      topLeft: offsetCorner(radius.topLeft, amount),
      topRight: offsetCorner(radius.topRight, amount),
      bottomRight: offsetCorner(radius.bottomRight, amount),
      bottomLeft: offsetCorner(radius.bottomLeft, amount),
    };
  }

  function offsetCorner(corner, amount) {
    return {
      x: Math.max(0, corner.x + amount),
      y: Math.max(0, corner.y + amount),
    };
  }

  function parseLinearGradient(value) {
    const fn = cssParser().parseFunction(value);
    if (!fn || !["linear-gradient", "repeating-linear-gradient"].includes(fn.name)) {
      return null;
    }

    const parts = fn.args;
    let direction = "to bottom";
    let stops = parts;
    if (parts[0] && (parts[0].startsWith("to ") || parts[0].includes("deg"))) {
      direction = parts[0];
      stops = parts.slice(1);
    }

    const colors = stops
      .map(parseGradientStop)
      .filter(Boolean)
      .map((stop, index, list) => ({
        color: stop.color,
        offset: stop.offset ?? `${round((index / Math.max(1, list.length - 1)) * 100)}%`,
      }));

    return colors.length >= 2 ? { direction, colors } : null;
  }

  function parseGridPattern(layers, style) {
    if (layers.some((layer) => layer.includes("repeating-linear-gradient("))) {
      return null;
    }

    const size = parseBackgroundSize(style.backgroundSize);
    if (!size.width || !size.height) {
      return null;
    }

    const parsed = layers.map(parseGridLineGradient).filter(Boolean);
    if (parsed.length < 2) {
      return null;
    }

    const vertical = parsed.find((item) => item.axis === "vertical");
    const horizontal = parsed.find((item) => item.axis === "horizontal");
    const fallbackHorizontal = parsed[0];
    const fallbackVertical = parsed[1];
    const finalVertical = vertical || fallbackVertical;
    const finalHorizontal = horizontal || fallbackHorizontal;
    if (!finalVertical || !finalHorizontal) {
      return null;
    }

    const position = parseBackgroundPosition(style.backgroundPosition);
    const lines = [
      `<line x1="0" y1="0" x2="0" y2="${size.height}" stroke="${finalVertical.color}" stroke-opacity="${finalVertical.opacity}" stroke-width="${finalVertical.width}"/>`,
      `<line x1="0" y1="0" x2="${size.width}" y2="0" stroke="${finalHorizontal.color}" stroke-opacity="${finalHorizontal.opacity}" stroke-width="${finalHorizontal.width}"/>`,
    ];

    return {
      width: round(size.width),
      height: round(size.height),
      x: round(position.x),
      y: round(position.y),
      lines,
    };
  }

  function parseRepeatingStripePattern(layers, style) {
    const layer = layers.find((item) => item.includes("repeating-linear-gradient("));
    const fn = cssParser().parseFunction(layer);
    if (!fn) {
      return null;
    }

    const direction = fn.args[0] && (fn.args[0].includes("deg") || fn.args[0].startsWith("to "))
      ? fn.args[0]
      : "0deg";
    const stops = (fn.args[0] === direction ? fn.args.slice(1) : fn.args)
      .map(parseGradientStop)
      .filter(Boolean);
    const colored = stops.find((stop) => stop.color && stop.color !== "transparent");
    if (!colored) {
      return null;
    }

    const offsets = stops
      .map((stop) => parseFloat(stop.offset))
      .filter((number) => Number.isFinite(number));
    const period = Math.max(2, Math.max(...offsets, 8));
    const strokeWidth = Math.max(0.5, stripeWidthFromStops(stops));
    const position = parseBackgroundPosition(style.backgroundPosition);
    const color = stripAlpha(colored.color).color;
    const opacity = stripAlpha(colored.color).opacity;

    return {
      width: round(period),
      height: round(period),
      x: round(position.x),
      y: round(position.y),
      lines: stripeLines(direction, period, color, opacity, strokeWidth),
    };
  }

  function stripeWidthFromStops(stops) {
    const coloredIndex = stops.findIndex((stop) => stop.color && stop.color !== "transparent");
    if (coloredIndex < 0) {
      return 1;
    }
    const current = parseFloat(stops[coloredIndex].offset);
    const next = parseFloat(stops[coloredIndex + 1]?.offset);
    if (Number.isFinite(current) && Number.isFinite(next) && next > current) {
      return next - current;
    }
    return 1;
  }

  function stripeLines(direction, period, color, opacity, strokeWidth) {
    const common = `stroke="${color}" stroke-opacity="${round(opacity)}" stroke-width="${round(strokeWidth)}"`;
    const value = String(direction).toLowerCase();
    if (value.includes("45deg")) {
      return [
        `<path d="M ${-period} ${period} L ${period} ${-period} M 0 ${period * 2} L ${period * 2} 0" ${common}/>`
      ];
    }
    if (value.includes("135deg") || value.includes("-45deg")) {
      return [
        `<path d="M ${-period} 0 L ${period} ${period * 2} M 0 ${-period} L ${period * 2} ${period}" ${common}/>`
      ];
    }
    if (value.includes("90deg") || value.includes("to right") || value.includes("to left")) {
      return [`<line x1="0" y1="0" x2="0" y2="${period}" ${common}/>`];
    }
    return [`<line x1="0" y1="0" x2="${period}" y2="0" ${common}/>`];
  }

  function parseGridLineGradient(layer) {
    const gradient = parseLinearGradient(layer);
    if (!gradient || gradient.colors.length < 2) {
      return null;
    }

    const first = gradient.colors[0];
    const second = gradient.colors[1];
    if (!first.color || !second) {
      return null;
    }

    const width = parseFloat(first.offset) || first.width || 1;
    const transparentSecond = second.color === "transparent" || second.color === "";
    if (!transparentSecond && !/00$/i.test(second.color)) {
      return null;
    }

    return {
      axis: gradientAxis(gradient.direction),
      color: first.color,
      opacity: colorOpacity(first.color),
      width: Math.max(0.5, width),
    };
  }

  function gradientAxis(direction) {
    const value = String(direction).toLowerCase();
    if (value.includes("90deg") || value.includes("to right") || value.includes("to left")) {
      return "vertical";
    }
    return "horizontal";
  }

  function parseBackgroundSize(value) {
    const first = splitCssArgs(value || "")[0] || value || "";
    const parts = cssParser().splitSpace(first);
    if (!parts.length || parts.includes("auto") || parts.includes("cover") || parts.includes("contain")) {
      return { width: 0, height: 0 };
    }
    const width = parseFloat(parts[0]) || 0;
    const height = parseFloat(parts[1] || parts[0]) || width;
    return { width, height };
  }

  function parseBackgroundPosition(value) {
    const first = splitCssArgs(value || "")[0] || value || "0 0";
    const parts = cssParser().splitSpace(first);
    return {
      x: parsePositionLength(parts[0]),
      y: parsePositionLength(parts[1]),
    };
  }

  function parsePositionLength(value) {
    if (!value || value === "left" || value === "top") {
      return 0;
    }
    return Number.parseFloat(value) || 0;
  }

  function colorOpacity(value) {
    if (/^#[0-9a-fA-F]{8}$/.test(value)) {
      return round(parseInt(value.slice(7, 9), 16) / 255);
    }
    return 1;
  }

  function stripAlpha(value) {
    if (/^#[0-9a-fA-F]{8}$/.test(value)) {
      return {
        color: value.slice(0, 7),
        opacity: round(parseInt(value.slice(7, 9), 16) / 255),
      };
    }
    return { color: value, opacity: 1 };
  }

  function splitCssArgs(value) {
    return cssParser().splitComma(value);
  }

  function parseGradientStop(value) {
    const color = cssParser().firstColor(value);
    if (!color) {
      return null;
    }
    const rest = value.replace(color, "").trim();
    const offsetMatch = rest.match(/-?\d+(\.\d+)?(px|%)/);
    return {
      color: rgbaToHex(color),
      offset: offsetMatch ? offsetMatch[0] : null,
    };
  }

  function gradientDef(id, gradient) {
    const vector = gradientVector(gradient.direction);
    const stops = gradient.colors
      .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`)
      .join("");
    return `<defs><linearGradient id="${id}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">${stops}</linearGradient></defs>`;
  }

  function gradientVector(direction) {
    const value = String(direction).toLowerCase();
    if (value.includes("to right")) return { x1: "0%", y1: "0%", x2: "100%", y2: "0%" };
    if (value.includes("to left")) return { x1: "100%", y1: "0%", x2: "0%", y2: "0%" };
    if (value.includes("to top")) return { x1: "0%", y1: "100%", x2: "0%", y2: "0%" };
    return { x1: "0%", y1: "0%", x2: "0%", y2: "100%" };
  }

  function applyTextTransform(value, transform) {
    if (transform === "uppercase") {
      return value.toUpperCase();
    }
    if (transform === "lowercase") {
      return value.toLowerCase();
    }
    if (transform === "capitalize") {
      return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
    }
    return value;
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function waitForFrame(view) {
    return new Promise((resolve) => {
      if (view?.requestAnimationFrame) {
        view.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function cssParser() {
    return window.CssValueParser;
  }

  window.HtmlToFigmaConverter = { convertDocument };
})();
