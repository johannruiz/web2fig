self.__htmlImportSessions = self.__htmlImportSessions || new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "HTML_IMPORT_ASSETS" || !data.sessionId) {
    return;
  }

  const files = new Map();
  for (const item of data.files || []) {
    if (item.path && item.file) {
      files.set(normalizePath(item.path), item.file);
    }
  }
  self.__htmlImportSessions.set(data.sessionId, files);
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const match = findAsset(url.pathname);
  if (!match) {
    return;
  }

  event.respondWith(new Response(match.file, {
    headers: {
      "Content-Type": assetMimeType(match.file, match.path) || "application/octet-stream",
      "Cache-Control": "no-store",
    },
  }));
});

function findAsset(pathname) {
  const path = decodeSafe(pathname).replace(/^\/+/, "");
  const virtual = path.match(/^__html_import__\/([^/]+)\/(.*)$/);

  if (virtual) {
    const files = self.__htmlImportSessions.get(virtual[1]);
    return files ? findInFiles(files, virtual[2]) : null;
  }

  for (const files of self.__htmlImportSessions.values()) {
    const found = findInFiles(files, path);
    if (found) {
      return found;
    }
  }
  return null;
}

function findInFiles(files, requestPath) {
  const normalized = normalizePath(requestPath);
  if (files.has(normalized)) {
    return { path: normalized, file: files.get(normalized) };
  }

  const lower = normalized.toLowerCase();
  const lowerClean = withoutDownloadSuffix(lower);
  const lowerName = basename(lowerClean);
  for (const [path, file] of files.entries()) {
    const candidate = path.toLowerCase();
    const cleanCandidate = withoutDownloadSuffix(candidate);
    if (
      candidate === lower ||
      cleanCandidate === lowerClean ||
      candidate.endsWith(`/${lower}`) ||
      cleanCandidate.endsWith(`/${lowerClean}`) ||
      (lowerName && basename(cleanCandidate) === lowerName)
    ) {
      return { path, file };
    }
  }
  return null;
}

function withoutDownloadSuffix(path) {
  return String(path || "").replace(/\.descarga$/i, "");
}

function basename(path) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function normalizePath(path) {
  const stack = [];
  for (const part of String(path || "").replace(/\\/g, "/").replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function assetMimeType(file, path) {
  if (file.type) return file.type;
  const clean = normalizePath(path).toLowerCase().replace(/\.descarga$/, "");
  if (clean.endsWith(".js") || clean.endsWith(".mjs")) return "text/javascript";
  if (clean.endsWith(".css")) return "text/css";
  if (clean.endsWith(".html") || clean.endsWith(".htm")) return "text/html";
  if (clean.endsWith(".json")) return "application/json";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".woff")) return "font/woff";
  if (clean.endsWith(".woff2")) return "font/woff2";
  if (clean.endsWith(".ttf")) return "font/ttf";
  if (clean.endsWith(".eot")) return "application/vnd.ms-fontobject";
  return "";
}
