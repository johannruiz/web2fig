const { chromium } = require("playwright");

let browserPromise = null;

async function captureRenderedPage(rawUrl, viewport) {
  const url = normalizePageUrl(rawUrl);
  const browser = await getBrowser();
  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    viewport: {
      width: clamp(viewport.width, 240, 3840, 1440),
      height: clamp(viewport.height, 480, 2400, 900),
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Web2Fig/1.0",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await prepareLazyContent(page);
    await waitForAssets(page);
    const payload = await page.evaluate(serializeRenderedPage, url);
    return {
      ok: true,
      ...payload,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function prepareLazyContent(page) {
  await page.evaluate(() => {
    for (const image of Array.from(document.images)) {
      image.loading = "eager";
      image.decoding = "sync";
      for (const name of ["data-src", "data-lazy-src", "data-original"]) {
        const value = image.getAttribute(name);
        if (value && !image.getAttribute("src")) {
          image.setAttribute("src", value);
        }
      }
    }
  });

  await page.evaluate(async () => {
    const step = Math.max(360, Math.floor(window.innerHeight * 0.75));
    const maxSteps = 40;
    let previousY = -1;

    for (let index = 0; index < maxSteps; index += 1) {
      window.scrollBy(0, step);
      await new Promise((resolve) => setTimeout(resolve, 160));
      if (window.scrollY === previousY) {
        break;
      }
      previousY = window.scrollY;
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
        break;
      }
    }

    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

async function waitForAssets(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready?.catch?.(() => {});
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .slice(0, 300)
        .map((image) => new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
          setTimeout(resolve, 2500);
        })),
    );
  });
}

function serializeRenderedPage(sourceUrl) {
  const doc = document.implementation.createHTMLDocument(document.title || "Captured page");
  doc.documentElement.innerHTML = document.documentElement.innerHTML;
  doc.documentElement.setAttribute("data-web2fig-captured-url", sourceUrl);

  let head = doc.head;
  if (!head) {
    head = doc.createElement("head");
    doc.documentElement.insertBefore(head, doc.body || null);
  }

  for (const script of Array.from(doc.querySelectorAll("script"))) {
    script.remove();
  }

  let base = head.querySelector("base[href]");
  if (!base) {
    base = doc.createElement("base");
    head.insertBefore(base, head.firstChild);
  }
  base.setAttribute("href", sourceUrl);

  for (const element of Array.from(doc.querySelectorAll("[srcset]"))) {
    element.setAttribute("data-web2fig-original-srcset", element.getAttribute("srcset") || "");
  }

  const doctype = document.doctype
    ? `<!doctype ${document.doctype.name}>`
    : "<!doctype html>";

  return {
    html: `${doctype}\n${doc.documentElement.outerHTML}`,
    title: document.title || "",
    finalUrl: location.href,
    height: Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      window.innerHeight,
    ),
  };
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

async function closeCaptureBrowser() {
  if (!browserPromise) {
    return;
  }
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close?.();
}

function normalizePageUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Pega una URL para importar.");
  }
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se pueden importar URLs http o https.");
  }
  return parsed.href;
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  captureRenderedPage,
  closeCaptureBrowser,
};
