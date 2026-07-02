(function () {
  const htmlInput = document.querySelector("#htmlInput");
  const previewFrame = document.querySelector("#previewFrame");
  const fileInput = document.querySelector("#fileInput");
  const folderInput = document.querySelector("#folderInput");
  const assetHtmlInput = document.querySelector("#assetHtmlInput");
  const assetFolderInput = document.querySelector("#assetFolderInput");
  const previewWrap = document.querySelector(".preview-frame-wrap");
  const emptyState = document.querySelector("#emptyState");
  const importButton = document.querySelector("#importButton");
  const importFolderButton = document.querySelector("#importFolderButton");
  const importHtmlAssetsButton = document.querySelector("#importHtmlAssetsButton");
  const importUrlButton = document.querySelector("#importUrlButton");
  const convertButton = document.querySelector("#convertButton");
  const copyButton = document.querySelector("#copyButton");
  const sampleButton = document.querySelector("#sampleButton");
  const viewportWidthInput = document.querySelector("#viewportWidth");
  const prepareAutoLayoutInput = document.querySelector("#prepareAutoLayout");
  const blockRuntimeScriptsInput = document.querySelector("#blockRuntimeScripts");
  const blockExternalScriptsInput = document.querySelector("#blockExternalScripts");
  const blockExternalResourcesInput = document.querySelector("#blockExternalResources");
  const resizeHandle = document.querySelector("#resizeHandle");
  const exportModeButtons = Array.from(document.querySelectorAll("#exportMode .preset"));
  const viewportPresetButtons = Array.from(document.querySelectorAll("#viewportPresets .preset"));
  const sourceMeta = document.querySelector("#sourceMeta");
  const viewportMeta = document.querySelector("#viewportMeta");
  const nodeCount = document.querySelector("#nodeCount");
  const textCount = document.querySelector("#textCount");
  const layoutCount = document.querySelector("#layoutCount");
  const imageCount = document.querySelector("#imageCount");
  const svgCount = document.querySelector("#svgCount");
  const fontList = document.querySelector("#fontList");
  const statusText = document.querySelector("#statusText");
  const statusProgress = document.querySelector("#statusProgress");
  const statusProgressBar = document.querySelector("#statusProgressBar");
  const debugToggle = document.querySelector("#debugToggle");
  const debugPanel = document.querySelector("#debugPanel");
  const debugLogEl = document.querySelector("#debugLog");
  const debugClear = document.querySelector("#debugClear");
  const copyToast = document.querySelector("#copyToast");
  const htmlAssetsModal = document.querySelector("#htmlAssetsModal");
  const htmlAssetsClose = document.querySelector("#htmlAssetsClose");
  const htmlAssetsCancel = document.querySelector("#htmlAssetsCancel");
  const htmlAssetsImport = document.querySelector("#htmlAssetsImport");
  const chooseAssetHtmlButton = document.querySelector("#chooseAssetHtmlButton");
  const chooseAssetFolderButton = document.querySelector("#chooseAssetFolderButton");
  const assetHtmlLabel = document.querySelector("#assetHtmlLabel");
  const assetFolderLabel = document.querySelector("#assetFolderLabel");
  const urlModal = document.querySelector("#urlModal");
  const urlInput = document.querySelector("#urlInput");
  const urlModalClose = document.querySelector("#urlModalClose");
  const urlCancelButton = document.querySelector("#urlCancelButton");
  const urlAcceptButton = document.querySelector("#urlAcceptButton");
  const urlModalError = document.querySelector("#urlModalError");

  let currentSvg = "";
  let renderId = 0;
  let previewStale = true;
  let previewSourceKey = "";
  let viewport = readViewport();
  let previewHeight = 900;
  let exportMode = "editable";
  let assetLibrary = emptyAssetLibrary();
  let remoteBaseUrl = "";
  let pendingAssetHtmlFile = null;
  let pendingAssetFiles = [];
  let progressValue = 0;

  const URL_CAPTURE_ENDPOINT = "http://127.0.0.1:8799/capture";

  const sampleHtml = `<!doctype html>
<html>
  <head>
    <style>
      body {
        margin: 0;
        background: #f5f5f4;
        font-family: Inter, Arial, sans-serif;
        color: #171717;
      }

      .screen {
        width: 920px;
        margin: 0 auto;
        padding: 56px;
      }

      .nav, .cards, .hero-actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .nav {
        justify-content: space-between;
        margin-bottom: 72px;
      }

      .brand {
        font-size: 18px;
        font-weight: 800;
      }

      .links {
        display: flex;
        gap: 24px;
        color: #525252;
        font-size: 14px;
      }

      .hero {
        max-width: 680px;
      }

      h1 {
        margin: 0;
        font-size: 64px;
        line-height: 1;
        letter-spacing: 0;
      }

      p {
        margin: 22px 0 0;
        color: #525252;
        font-size: 18px;
        line-height: 1.5;
      }

      .hero-actions {
        margin-top: 30px;
      }

      button {
        border: 0;
        border-radius: 8px;
        padding: 14px 18px;
        background: #171717;
        color: white;
        font-weight: 700;
      }

      .secondary {
        background: white;
        color: #171717;
        border: 1px solid #d4d4d4;
      }

      .cards {
        margin-top: 56px;
        align-items: stretch;
      }

      .card {
        width: 180px;
        padding: 20px;
        border-radius: 8px;
        background: white;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.08);
      }

      .card strong {
        display: block;
        font-size: 24px;
      }

      .card span {
        display: block;
        margin-top: 8px;
        color: #737373;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main class="screen">
      <nav class="nav">
        <div class="brand">Northline</div>
        <div class="links">
          <span>Product</span>
          <span>Work</span>
          <span>Pricing</span>
        </div>
      </nav>
      <section class="hero">
        <h1>Design systems from real HTML.</h1>
        <p>Capture production screens as editable layers and keep layout intent visible.</p>
        <div class="hero-actions">
          <button>Start capture</button>
          <button class="secondary">View layers</button>
        </div>
      </section>
      <section class="cards">
        <article class="card"><strong>128</strong><span>Visible nodes</span></article>
        <article class="card"><strong>46</strong><span>Text layers</span></article>
        <article class="card"><strong>19</strong><span>Layout groups</span></article>
      </section>
    </main>
  </body>
</html>`;

  updateMeta();
  applyViewport();
  initEditorResize();
  writePreviewDocument("<!doctype html><html><body></body></html>");
  updateEmptyState();
  debugLog("App lista sin ejemplo inicial.");
  previewFrame.addEventListener("load", () => {
    const loadedKey = loadedPreviewKey(previewFrame.contentDocument);
    if (loadedKey && loadedKey === currentSourceKey() && previewHasUsableContent(previewFrame.contentDocument)) {
      previewSourceKey = loadedKey;
      previewStale = false;
      updateFontList(previewFrame.contentDocument);
      if (!currentSvg) {
        statusText.textContent = "Preview listo. Convierte para preparar el portapapeles.";
      }
    }
  });
  debugToggle?.addEventListener("click", () => {
    if (!debugPanel) {
      return;
    }
    debugPanel.hidden = !debugPanel.hidden;
  });

  debugClear?.addEventListener("click", () => {
    if (debugLogEl) {
      debugLogEl.textContent = "";
    }
    debugLog("Debug limpio.");
  });

  htmlInput.addEventListener("input", () => {
    remoteBaseUrl = "";
    previewStale = true;
    updateMeta();
    updateEmptyState();
    resetCurrentOutput();
    statusText.textContent = "HTML actualizado. Convierte de nuevo para preparar el portapapeles.";
  });

  importButton.addEventListener("click", () => {
    fileInput.click();
  });

  importFolderButton.addEventListener("click", () => {
    folderInput.click();
  });

  importHtmlAssetsButton?.addEventListener("click", () => {
    openHtmlAssetsModal();
  });

  chooseAssetHtmlButton?.addEventListener("click", () => {
    assetHtmlInput.value = "";
    assetHtmlInput.click();
  });

  chooseAssetFolderButton?.addEventListener("click", () => {
    assetFolderInput.value = "";
    assetFolderInput.click();
  });

  htmlAssetsClose?.addEventListener("click", () => {
    closeHtmlAssetsModal();
  });

  htmlAssetsCancel?.addEventListener("click", () => {
    closeHtmlAssetsModal();
  });

  htmlAssetsModal?.addEventListener("click", (event) => {
    if (event.target === htmlAssetsModal) {
      closeHtmlAssetsModal();
    }
  });

  htmlAssetsImport?.addEventListener("click", () => {
    importPendingHtmlAssets();
  });

  importUrlButton?.addEventListener("click", () => {
    openUrlModal();
  });

  urlModalClose?.addEventListener("click", () => {
    closeUrlModal();
  });

  urlCancelButton?.addEventListener("click", () => {
    closeUrlModal();
  });

  urlModal?.addEventListener("click", (event) => {
    if (event.target === urlModal) {
      closeUrlModal();
    }
  });

  urlInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      importFromUrl();
    }
    if (event.key === "Escape") {
      closeUrlModal();
    }
  });

  urlAcceptButton?.addEventListener("click", () => {
    importFromUrl();
  });

  viewportPresetButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      viewportWidthInput.value = button.dataset.width;
      previewHeight = clamp(Number.parseInt(button.dataset.previewHeight, 10), 480, 2400, 900);
      viewport = readViewport();
      setActivePreset();
      applyViewport();
      previewStale = true;
      resetCurrentOutput();
      await renderPreview().catch(() => {});
      statusText.textContent = `Ancho fijado en ${viewport.width}px. La altura se calcula automaticamente.`;
    });
  });

  exportModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      exportMode = button.dataset.mode || "editable";
      setActiveExportMode();
      resetCurrentOutput();
      statusText.textContent = exportMode === "hybrid"
        ? "Modo hibrido activado. Los nodos complejos se rasterizan."
        : "Modo editable activado. Convierte de nuevo.";
    });
  });

  viewportWidthInput.addEventListener("change", async () => {
    viewport = readViewport();
    setActivePreset();
    applyViewport();
    previewStale = true;
    resetCurrentOutput();
    await renderPreview().catch(() => {});
    statusText.textContent = `Ancho fijado en ${viewport.width}px. La altura se calcula automaticamente.`;
  });

  prepareAutoLayoutInput.addEventListener("change", () => {
    resetCurrentOutput();
    statusText.textContent = prepareAutoLayoutInput.checked
      ? "Preparacion de Auto Layout activada. Convierte de nuevo."
      : "Preparacion de Auto Layout desactivada. Convierte de nuevo.";
  });

  [blockRuntimeScriptsInput, blockExternalScriptsInput, blockExternalResourcesInput].forEach((input) => {
    input?.addEventListener("change", () => {
      previewStale = true;
      resetCurrentOutput();
      const enabled = securityOptionsSummary();
      statusText.textContent = enabled
        ? `Bloqueos activos: ${enabled}. Renderiza o convierte de nuevo.`
        : "Sin bloqueos activos. El preview cargara scripts y recursos normalmente.";
    });
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      clearAssetLibrary();
      remoteBaseUrl = "";
      htmlInput.value = await file.text();
      updateEmptyState();
      previewStale = true;
      updateMeta(file.name);
      resetCurrentOutput();
      statusText.textContent = `${file.name} cargado. Renderizando preview...`;
      renderPreview({ quick: true, patient: true, label: "Renderizando preview" })
        .then(() => {
          finishOperationProgress();
          statusText.textContent = `${file.name} listo. Convierte para preparar el portapapeles.`;
        })
        .catch((error) => {
          if (error.message.includes("preview cambio")) {
            return;
          }
          finishOperationProgress();
          statusText.textContent = `No se pudo preparar el preview: ${error.message}`;
        });
    } catch (error) {
      statusText.textContent = `No se pudo importar el archivo: ${error.message}`;
    } finally {
      fileInput.value = "";
    }
  });

  folderInput.addEventListener("change", async () => {
    const files = Array.from(folderInput.files || []);
    if (!files.length) {
      return;
    }

    try {
      debugLog(`Importar carpeta: ${files.length} archivos recibidos.`);
      setOperationProgress(4, "Leyendo carpeta");
      clearAssetLibrary();
      remoteBaseUrl = "";
      assetLibrary = await createAssetLibrary(files);
      debugLog(`HTML elegido: ${assetLibrary.htmlPath || assetLibrary.htmlFile.name}`);
      debugLog(`Base local: ${assetLibrary.baseDir || "(raiz)"}`);
      htmlInput.value = await assetLibrary.htmlFile.text();
      updateEmptyState();
      debugLog(`HTML leido: ${htmlInput.value.length.toLocaleString()} caracteres.`);
      previewStale = true;
      updateMeta(assetLibrary.htmlFile.name);
      resetCurrentOutput();
      statusText.textContent = `${assetLibrary.htmlFile.name} cargado con ${assetLibrary.files.size} archivos locales. Renderizando preview...`;
      renderPreview({ quick: true, patient: true, label: "Renderizando carpeta" })
        .then(() => {
          finishOperationProgress();
          statusText.textContent = `${assetLibrary.htmlFile.name} listo. Convierte para preparar el portapapeles.`;
        })
        .catch((error) => {
          if (error.message.includes("preview cambio")) {
            return;
          }
          finishOperationProgress();
          statusText.textContent = `No se pudo preparar el preview: ${error.message}`;
        });
    } catch (error) {
      clearAssetLibrary();
      statusText.textContent = `No se pudo importar la carpeta: ${error.message}`;
    } finally {
      folderInput.value = "";
    }
  });

  assetHtmlInput?.addEventListener("change", () => {
    const file = assetHtmlInput.files?.[0];
    if (!file) {
      pendingAssetHtmlFile = null;
      updateHtmlAssetsModalState();
      return;
    }
    pendingAssetHtmlFile = file;
    debugLog(`HTML + assets: HTML seleccionado ${file.name}.`);
    updateHtmlAssetsModalState();
  });

  assetFolderInput?.addEventListener("change", () => {
    pendingAssetFiles = Array.from(assetFolderInput.files || []);
    debugLog(`HTML + assets: ${pendingAssetFiles.length} archivos de assets seleccionados.`);
    updateHtmlAssetsModalState();
  });

  sampleButton.addEventListener("click", async () => {
    clearAssetLibrary();
    remoteBaseUrl = "";
    htmlInput.value = sampleHtml;
    updateEmptyState();
    previewStale = true;
    updateMeta();
    resetCurrentOutput();
    await renderPreview().catch(() => {});
    statusText.textContent = "Ejemplo cargado. Convierte para generar el SVG.";
  });

  convertButton.addEventListener("click", async () => {
    convertButton.disabled = true;
    resetCurrentOutput();
    statusText.textContent = "Renderizando HTML y preparando imagenes...";
    setOperationProgress(6, "Iniciando conversion");

    try {
      if (previewStale || !previewHasUsableContent(previewFrame.contentDocument) || !previewMatchesCurrentSource()) {
        await renderPreview({ quick: true, patient: true, label: "Renderizando para convertir" }).catch((error) => {
          if (!previewHasUsableContent(previewFrame.contentDocument) || !previewMatchesCurrentSource()) {
            throw error;
          }
          previewStale = false;
        });
      } else {
        setOperationProgress(62, "Usando preview actual");
        await previewFrame.contentDocument?.fonts?.ready?.catch?.(() => {});
      }
      if (!previewMatchesCurrentSource()) {
        throw new Error("El preview actual todavia no corresponde al HTML importado. Espera a que termine de mostrarse e intenta de nuevo.");
      }
      setOperationProgress(72, "Dibujando SVG editable");
      const result = await window.HtmlToFigmaConverter.convertDocument(previewFrame.contentDocument, viewport, {
        mode: exportMode,
        prepareAutoLayout: prepareAutoLayoutInput.checked,
      });
      currentSvg = result.svg;
      nodeCount.textContent = result.stats.nodes;
      textCount.textContent = result.stats.texts;
      layoutCount.textContent = result.stats.layoutCandidates;
      if (imageCount) {
        imageCount.textContent = result.stats.images || 0;
      }
      if (svgCount) {
        svgCount.textContent = result.stats.svgIcons || 0;
      }
      updateFontList(previewFrame.contentDocument);
      viewportMeta.textContent = `${result.viewport.width} x ${result.viewport.height}`;
      copyButton.disabled = false;
      setOperationProgress(94, "Copiando para Figma");
      statusText.textContent = imageStatus(result.stats);
      await copyCurrentSvg({ automatic: true });
      finishOperationProgress();
    } catch (error) {
      currentSvg = "";
      copyButton.disabled = true;
      finishOperationProgress();
      statusText.textContent = `No se pudo convertir: ${error.message}`;
    } finally {
      convertButton.disabled = false;
    }
  });

  copyButton.addEventListener("click", async () => {
    await copyCurrentSvg({ automatic: false });
  });

  function openHtmlAssetsModal() {
    pendingAssetHtmlFile = null;
    pendingAssetFiles = [];
    assetHtmlInput.value = "";
    assetFolderInput.value = "";
    updateHtmlAssetsModalState();
    if (htmlAssetsModal) {
      htmlAssetsModal.hidden = false;
    }
  }

  function closeHtmlAssetsModal() {
    if (htmlAssetsModal) {
      htmlAssetsModal.hidden = true;
    }
  }

  function updateHtmlAssetsModalState() {
    if (assetHtmlLabel) {
      assetHtmlLabel.textContent = pendingAssetHtmlFile?.name || "Ningun archivo seleccionado";
    }
    if (assetFolderLabel) {
      assetFolderLabel.textContent = pendingAssetFiles.length
        ? `${pendingAssetFiles.length.toLocaleString()} archivos seleccionados`
        : "Ninguna carpeta seleccionada";
    }
    if (htmlAssetsImport) {
      htmlAssetsImport.disabled = !pendingAssetHtmlFile || !pendingAssetFiles.length;
    }
  }

  async function importPendingHtmlAssets() {
    const htmlFile = pendingAssetHtmlFile;
    const files = pendingAssetFiles;
    if (!htmlFile || !files.length) {
      updateHtmlAssetsModalState();
      return;
    }

    try {
      closeHtmlAssetsModal();
      debugLog(`HTML + assets: ${files.length} archivos de assets recibidos.`);
      setOperationProgress(4, "Leyendo HTML + assets");
      clearAssetLibrary();
      remoteBaseUrl = "";
      assetLibrary = createAssetLibraryFromHtmlAndAssets(htmlFile, files);
      debugLog(`HTML externo: ${assetLibrary.htmlFile.name}`);
      debugLog(`Base local: ${assetLibrary.baseDir || "(raiz de assets)"}`);
      htmlInput.value = await assetLibrary.htmlFile.text();
      updateEmptyState();
      debugLog(`HTML leido: ${htmlInput.value.length.toLocaleString()} caracteres.`);
      previewStale = true;
      updateMeta(assetLibrary.htmlFile.name);
      resetCurrentOutput();
      statusText.textContent = `${assetLibrary.htmlFile.name} cargado con ${assetLibrary.originalFileCount} assets. Renderizando preview...`;
      renderPreview({ quick: true, patient: true, label: "Renderizando HTML + assets" })
        .then(() => {
          finishOperationProgress();
          statusText.textContent = `${assetLibrary.htmlFile.name} listo con assets vinculados. Convierte para preparar el portapapeles.`;
        })
        .catch((error) => {
          if (error.message.includes("preview cambio")) {
            return;
          }
          finishOperationProgress();
          statusText.textContent = `No se pudo preparar el preview: ${error.message}`;
        });
    } catch (error) {
      clearAssetLibrary();
      statusText.textContent = `No se pudo importar HTML + assets: ${error.message}`;
    } finally {
      pendingAssetHtmlFile = null;
      pendingAssetFiles = [];
      assetHtmlInput.value = "";
      assetFolderInput.value = "";
      updateHtmlAssetsModalState();
    }
  }

  function openUrlModal() {
    if (!urlModal) {
      return;
    }
    setUrlModalError("");
    urlModal.hidden = false;
    window.setTimeout(() => {
      urlInput?.focus();
      urlInput?.select();
    }, 20);
  }

  function closeUrlModal() {
    if (urlModal) {
      urlModal.hidden = true;
    }
    setUrlModalError("");
  }

  async function importFromUrl() {
    const rawUrl = urlInput?.value || "";
    let pageUrl = "";
    try {
      pageUrl = normalizePageUrl(rawUrl);
    } catch (error) {
      setUrlModalError(error.message);
      return;
    }

    try {
      setUrlModalLoading(true);
      setUrlModalError("");
      setOperationProgress(6, "Importando URL");
      statusText.textContent = `Capturando ${pageUrl} con navegador local...`;
      debugLog(`Importar URL: capturando ${pageUrl}`);
      const captured = await captureUrlWithLocalBrowser(pageUrl).catch(async (error) => {
        debugLog(`Importar URL: capturador local no disponible (${error.message}). Probando descarga HTML.`);
        const html = await fetchHtmlFromUrl(pageUrl);
        return { html, finalUrl: pageUrl, title: "" };
      });

      clearAssetLibrary();
      remoteBaseUrl = captured.finalUrl || pageUrl;
      htmlInput.value = captured.html;
      updateEmptyState();
      previewStale = true;
      updateMeta(captured.title || new URL(remoteBaseUrl).hostname);
      resetCurrentOutput();
      closeUrlModal();
      statusText.textContent = "URL capturada. Renderizando preview...";
      renderPreview({ quick: true, patient: true, label: "Renderizando URL" })
        .then(() => {
          finishOperationProgress();
          statusText.textContent = "URL lista. Convierte para preparar el portapapeles.";
        })
        .catch((error) => {
          if (error.message.includes("preview cambio")) {
            return;
          }
          finishOperationProgress();
          statusText.textContent = `No se pudo preparar el preview: ${error.message}`;
        });
    } catch (error) {
      finishOperationProgress();
      setUrlModalError(error.message);
      statusText.textContent = `No se pudo importar la URL: ${error.message}`;
    } finally {
      setUrlModalLoading(false);
    }
  }

  function setUrlModalLoading(isLoading) {
    if (urlAcceptButton) {
      urlAcceptButton.disabled = isLoading;
      urlAcceptButton.textContent = isLoading ? "Importando..." : "Importar URL";
    }
    if (urlInput) {
      urlInput.disabled = isLoading;
    }
  }

  function setUrlModalError(message) {
    if (!urlModalError) {
      return;
    }
    urlModalError.textContent = message;
    urlModalError.hidden = !message;
  }

  function normalizePageUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      throw new Error("Pega una URL para importar.");
    }
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (error) {
      throw new Error("La URL no parece valida.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Solo se pueden importar URLs http o https.");
    }
    return parsed.href;
  }

  async function fetchHtmlFromUrl(pageUrl) {
    const directError = await fetchHtmlDirect(pageUrl)
      .then((html) => ({ html, error: null }))
      .catch((error) => ({ html: "", error }));
    if (directError.html) {
      return directError.html;
    }

    debugLog(`Importar URL: fetch directo fallo (${directError.error?.message || "sin detalle"}). Probando proxy CORS.`);
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`;
    return fetchHtmlDirect(proxyUrl, pageUrl);
  }

  async function captureUrlWithLocalBrowser(pageUrl) {
    if (window.web2figDesktop?.captureUrl) {
      const payload = await window.web2figDesktop.captureUrl({
        url: pageUrl,
        width: viewport.width,
        height: previewHeight,
      });
      if (!payload?.html) {
        throw new Error(payload?.error || "Electron no devolvio HTML renderizado.");
      }
      debugLog(`Importar URL: captura Electron lista. Largo=${payload.html.length.toLocaleString()} chars.`);
      return payload;
    }

    const response = await fetch(URL_CAPTURE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: pageUrl,
        width: viewport.width,
        height: previewHeight,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("El capturador local no devolvio JSON valido.");
    }

    if (!response.ok || !payload?.html) {
      throw new Error(payload?.error || "El capturador local no pudo devolver HTML renderizado.");
    }

    debugLog(`Importar URL: captura local lista. Largo=${payload.html.length.toLocaleString()} chars.`);
    return payload;
  }

  async function fetchHtmlDirect(url, originalUrl = url) {
    const response = await fetch(url, {
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`La web respondio ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!/<html[\s>]/i.test(text) && !/<!doctype\s+html/i.test(text)) {
      if (!contentType.includes("text/html")) {
        throw new Error("La URL no devolvio un documento HTML.");
      }
    }
    debugLog(`Importar URL: HTML recibido desde ${originalUrl}. Largo=${text.length.toLocaleString()} chars.`);
    return text;
  }

  async function copyCurrentSvg({ automatic }) {
    if (!currentSvg) {
      return false;
    }

    try {
      const mode = await copySvg(currentSvg);
      statusText.textContent =
        mode === "advanced"
          ? `${automatic ? "Conversion lista y " : ""}SVG copiado para Figma. Pegalo con Ctrl+V.`
          : `${automatic ? "Conversion lista y " : ""}SVG copiado como texto. Pegalo con Ctrl+V.`;
      showCopyToast(automatic ? "Convertido y copiado para Figma" : mode === "advanced" ? "Copiado para Figma" : "Copiado como texto");
      return true;
    } catch (error) {
      if (!automatic) {
        statusText.textContent = "El navegador bloqueo el portapapeles. Prueba desde localhost o revisa permisos.";
      } else {
        showCopyToast("Conversion lista. Copia manual disponible");
      }
      return false;
    }
  }

  function renderPreview(options = {}) {
    const quick = Boolean(options.quick);
    const patient = Boolean(options.patient);
    const label = options.label || "Renderizando preview";
    const nextRenderId = ++renderId;
    const renderSourceKey = currentSourceKey();
    debugLog(`${label}: inicio render #${nextRenderId}. HTML=${htmlInput.value.length.toLocaleString()} chars, assets=${assetLibrary.files?.size || 0}.`);
    applyViewport();
    applySandbox();
    setOperationProgress(Math.max(progressValue, 10), `${label}: preparando HTML`);

    return new Promise((resolve, reject) => {
      let settled = false;
      let completing = false;
      let pollTimer = 0;
      let timeout = 0;
      if (!patient) {
        timeout = window.setTimeout(() => {
          tryComplete().catch((error) => {
            fail(error.message === "preview-not-ready"
              ? new Error("El preview tardo demasiado en cargar.")
              : error);
          });
        }, quick ? 5000 : previewLoadTimeout());
      }

      function cleanup() {
        if (timeout) {
          window.clearTimeout(timeout);
        }
        window.clearInterval(pollTimer);
        previewFrame.removeEventListener("load", onLoad);
      }

      function finish() {
        if (settled) {
          return false;
        }
        settled = true;
        cleanup();
        return true;
      }

      function fail(error) {
        if (error.message === "preview-not-ready" && forcePreviewDocumentReady(renderSourceKey)) {
          succeed();
          return;
        }
        if (patient && error.message === "preview-not-ready") {
          return;
        }
        if (finish()) {
          reject(error);
        }
      }

      function succeed() {
        if (finish()) {
          resolve();
        }
      }

      async function onLoad() {
        try {
          await tryComplete();
        } catch (error) {
          fail(error);
        }
      }

      async function tryComplete() {
        if (settled || completing) {
          return;
        }
        completing = true;
        try {
          await completeFromCurrentDocument();
          succeed();
        } finally {
          completing = false;
        }
      }

      async function completeFromCurrentDocument() {
        if (nextRenderId !== renderId) {
          throw new Error("El preview cambio durante la conversion.");
        }
        if (loadedPreviewKey(previewFrame.contentDocument) !== renderSourceKey) {
          if (patient && previewHasUsableContent(previewFrame.contentDocument)) {
            debugLog(`${label}: marca interna reemplazada por el HTML, aceptando contenido visible.`);
            previewSourceKey = renderSourceKey;
            previewStale = false;
          } else if (!forcePreviewDocumentReady(renderSourceKey)) {
            throw new Error("preview-not-ready");
          }
        }
        if (!previewHasUsableContent(previewFrame.contentDocument)) {
          throw new Error("preview-not-ready");
        }

        if (quick) {
          setOperationProgress(62, `${label}: preview visible`);
          updateFontList(previewFrame.contentDocument);
          previewSourceKey = renderSourceKey;
          previewStale = false;
          return;
        }

        await waitForPreviewReady(nextRenderId).catch((error) => {
          if (!previewHasUsableContent(previewFrame.contentDocument)) {
            throw error;
          }
        });

        if (nextRenderId !== renderId) {
          throw new Error("El preview cambio durante la conversion.");
        }
        if (loadedPreviewKey(previewFrame.contentDocument) !== renderSourceKey) {
          throw new Error("El preview cargo una version anterior.");
        }
        updateFontList(previewFrame.contentDocument);
        previewSourceKey = renderSourceKey;
        previewStale = false;
        if (!currentSvg) {
          statusText.textContent = "Preview listo. Convierte para preparar el portapapeles.";
        }
      }

      previewFrame.addEventListener("load", onLoad, { once: true });
      debugLog(`${label}: preparando HTML para iframe.`);
      prepareHtmlForPreview(htmlInput.value)
        .then((html) => {
          if (nextRenderId !== renderId) {
            fail(new Error("El preview cambio durante la conversion."));
            return;
          }
          debugLog(`${label}: HTML preparado. Largo=${html.length.toLocaleString()} chars.`);
          setOperationProgress(34, `${label}: recursos preparados`);
          previewStale = true;
          previewSourceKey = "";
          injectPreviewHtml(stampPreviewHtml(html, renderSourceKey));
          debugLog(`${label}: HTML inyectado en iframe.`);
          setOperationProgress(48, `${label}: esperando contenido visible`);
          pollTimer = window.setInterval(() => {
            if (!settled) {
              setOperationProgress(Math.min(88, progressValue + 2), `${label}: renderizando sin interrupciones`);
            }
            tryComplete()
              .catch((error) => {
                if (error.message !== "preview-not-ready") {
                  fail(error);
                }
              });
          }, 500);
        })
        .catch((error) => {
          fail(error);
        });
    });
  }

  function injectPreviewHtml(html) {
    previewFrame.removeAttribute("src");
    previewFrame.srcdoc = html;
    window.setTimeout(() => {
      if (!loadedPreviewKey(previewFrame.contentDocument)) {
        writePreviewDocument(html);
      }
    }, 80);
  }

  function writePreviewDocument(html) {
    const doc = previewFrame.contentWindow?.document;
    if (!doc) {
      return false;
    }
    try {
      doc.open();
      doc.write(html);
      doc.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  function forcePreviewDocumentReady(sourceKey) {
    if (loadedPreviewKey(previewFrame.contentDocument) === sourceKey && previewHasUsableContent(previewFrame.contentDocument)) {
      previewSourceKey = sourceKey;
      previewStale = false;
      updateFontList(previewFrame.contentDocument);
      return true;
    }
    return false;
  }

  async function prepareHtmlForPreview(html) {
    if (!assetLibrary.files.size) {
      if (remoteBaseUrl) {
        debugLog(`Preparar HTML: URL base remota=${remoteBaseUrl}`);
        return addRemoteBaseHref(html, remoteBaseUrl);
      }
      debugLog("Preparar HTML: sin carpeta local, se usa HTML directo.");
      return html;
    }

    debugLog("Preparar HTML: parseando documento.");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseHref = doc.querySelector("base[href]")?.getAttribute("href") || "";
    const htmlBaseDir = baseHref && !isExternalUrl(baseHref)
      ? normalizeDir(joinAssetPath(assetLibrary.baseDir, baseHref))
      : assetLibrary.baseDir;
    debugLog(`Preparar HTML: base=${htmlBaseDir || "(raiz)"}.`);

    if (blockRuntimeScriptsInput?.checked && isCapturedNextDocument(doc)) {
      debugLog("Preparar HTML: bloqueo runtime activo, removiendo scripts runtime.");
      removeRuntimeScripts(doc);
    }
    if (blockExternalScriptsInput?.checked) {
      debugLog("Preparar HTML: bloqueo de scripts externos activo.");
      removeExternalScripts(doc);
    }
    if (blockExternalResourcesInput?.checked) {
      debugLog("Preparar HTML: bloqueo de recursos externos activo.");
      removeBlockingExternalResources(doc);
    }
    if (assetLibrary.localServer) {
      applyVirtualBase(doc, htmlBaseDir);
    }
    debugLog("Preparar HTML: reescribiendo recursos enlazados.");
    await rewriteElementUrls(doc, htmlBaseDir);
    debugLog("Preparar HTML: reescribiendo estilos inline.");
    rewriteInlineStyles(doc, htmlBaseDir);
    debugLog("Preparar HTML: listo.");
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  }

  function addRemoteBaseHref(html, href) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let head = doc.head;
    if (!head) {
      head = doc.createElement("head");
      doc.documentElement.insertBefore(head, doc.body || null);
    }
    let base = head.querySelector("base[href]");
    if (!base) {
      base = doc.createElement("base");
      head.insertBefore(base, head.firstChild);
    }
    base.setAttribute("href", href);
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  }

  async function rewriteElementUrls(doc, baseDir) {
    let rewritten = 0;
    let inlinedCss = 0;
    const attrTargets = [
      ["img", "src"],
      ["source", "src"],
      ["video", "src"],
      ["audio", "src"],
      ["track", "src"],
      ["script", "src"],
      ["iframe", "src"],
      ["embed", "src"],
      ["object", "data"],
      ["input", "src"],
      ["link", "href"],
    ];

    for (const [selector, attr] of attrTargets) {
      for (const element of Array.from(doc.querySelectorAll(`${selector}[${attr}]`))) {
        const value = element.getAttribute(attr);
        if (!shouldRewriteUrl(value)) {
          continue;
        }
        const resolvedPath = resolveAssetPath(value, baseDir);
        const file = assetLibrary.files.get(resolvedPath);
        if (!file) {
          continue;
        }

        if (selector === "link" && isStylesheet(element, value)) {
          inlineStylesheetLink(element, await rewriteCss(await file.text(), dirname(resolvedPath)), resolvedPath);
          inlinedCss += 1;
        } else {
          element.setAttribute(attr, fileAssetUrl(file, resolvedPath));
        }
        rewritten += 1;
        clearFetchGuards(element);
      }
    }

    for (const element of Array.from(doc.querySelectorAll("[srcset]"))) {
      element.setAttribute("srcset", rewriteSrcset(element.getAttribute("srcset"), baseDir));
    }

    for (const element of Array.from(doc.querySelectorAll("[imagesrcset]"))) {
      element.setAttribute("imagesrcset", rewriteSrcset(element.getAttribute("imagesrcset"), baseDir));
      clearFetchGuards(element);
    }

    for (const style of Array.from(doc.querySelectorAll("style"))) {
      style.textContent = await rewriteCss(style.textContent, baseDir);
    }
    debugLog(`Recursos: ${rewritten} atributos reescritos, ${inlinedCss} CSS locales incrustados.`);
  }

  function inlineStylesheetLink(link, css, path) {
    const style = link.ownerDocument.createElement("style");
    style.textContent = css;
    style.setAttribute("data-web2fig-inline-css", path);
    link.replaceWith(style);
  }

  function rewriteInlineStyles(doc, baseDir) {
    for (const element of Array.from(doc.querySelectorAll("[style]"))) {
      const value = element.getAttribute("style");
      element.setAttribute("style", rewriteCssUrlsSync(value, baseDir));
    }
  }

  function isCapturedNextDocument(doc) {
    if (!doc.body || doc.body.textContent.trim().length < 80) {
      return false;
    }

    const nextMarkers = [
      "self.__next_f",
      "self.__next_s",
      "webpackChunk_N_E",
      "__next-route-announcer__",
      "window.next={",
    ];

    return Array.from(doc.querySelectorAll("script, next-route-announcer")).some((element) => {
      const src = element.getAttribute?.("src") || "";
      const text = element.textContent || "";
      return /(?:^|\/)(?:webpack|main-app|layout|page)-.+\.js(?:\.descarga)?$/i.test(src) ||
        nextMarkers.some((marker) => text.includes(marker) || src.includes(marker));
    });
  }

  function removeRuntimeScripts(doc) {
    for (const script of Array.from(doc.querySelectorAll("script"))) {
      script.remove();
    }

    for (const link of Array.from(doc.querySelectorAll("link"))) {
      const rel = (link.getAttribute("rel") || "").toLowerCase();
      const as = (link.getAttribute("as") || "").toLowerCase();
      if (rel === "modulepreload" || (rel === "preload" && as === "script")) {
        link.remove();
      }
    }
  }

  function removeExternalScripts(doc) {
    for (const script of Array.from(doc.querySelectorAll("script[src]"))) {
      const src = script.getAttribute("src") || "";
      if (isExternalUrl(src)) {
        script.setAttribute("data-web2fig-disabled-src", src);
        script.removeAttribute("src");
      }
    }
  }

  function removeBlockingExternalResources(doc) {
    for (const link of Array.from(doc.querySelectorAll("link[href]"))) {
      const href = link.getAttribute("href") || "";
      const rel = (link.getAttribute("rel") || "").toLowerCase();
      if (!isExternalUrl(href)) {
        continue;
      }
      if (["stylesheet", "preload", "preconnect", "dns-prefetch"].includes(rel)) {
        link.setAttribute("data-web2fig-disabled-href", href);
        link.removeAttribute("href");
      }
    }

    removeExternalScripts(doc);
  }

  async function waitForPreviewReady(expectedRenderId) {
    const startedAt = performance.now();
    const maxWait = previewSettleTimeout();
    let stableHeight = 0;
    let stableTicks = 0;
    let usableSince = 0;

    while (performance.now() - startedAt < maxWait) {
      if (expectedRenderId !== renderId) {
        throw new Error("El preview cambio durante la conversion.");
      }

      const doc = previewFrame.contentDocument;
      if (doc && doc.readyState !== "loading" && isPreviewSettled(doc)) {
        usableSince ||= performance.now();
        const height = Math.max(
          doc.documentElement?.scrollHeight || 0,
          doc.body?.scrollHeight || 0,
        );
        if (Math.abs(height - stableHeight) <= 2) {
          stableTicks += 1;
        } else {
          stableHeight = height;
          stableTicks = 0;
        }
        if (stableTicks >= 2) {
          await doc.fonts?.ready?.catch?.(() => {});
          return;
        }
        if (usableSince && performance.now() - usableSince > 6000 && stableTicks >= 1) {
          await doc.fonts?.ready?.catch?.(() => {});
          return;
        }
      }

      await delay(250);
    }

    const doc = previewFrame.contentDocument;
    if (doc && previewHasUsableContent(doc)) {
      await doc.fonts?.ready?.catch?.(() => {});
      return;
    }

    throw new Error("El preview tardo demasiado en estabilizarse.");
  }

  function previewLoadTimeout() {
    const htmlKb = htmlInput.value.length / 1024;
    const assetCount = assetLibrary.files?.size || 0;
    return clamp(30000 + htmlKb * 45 + assetCount * 35, 30000, 120000, 60000);
  }

  function previewSettleTimeout() {
    const htmlKb = htmlInput.value.length / 1024;
    const assetCount = assetLibrary.files?.size || 0;
    return clamp(22000 + htmlKb * 35 + assetCount * 25, 22000, 90000, 45000);
  }

  function isPreviewSettled(doc) {
    const bundlerLoading = doc.querySelector("#__bundler_loading");
    const bundlerThumbnail = doc.querySelector("#__bundler_thumbnail");
    if (bundlerLoading || bundlerThumbnail) {
      return false;
    }

    const root = doc.querySelector("#root");
    if (root && !root.children.length && !root.textContent.trim()) {
      return false;
    }

    return Boolean(doc.body && doc.body.children.length);
  }

  function previewHasUsableContent(doc) {
    if (!doc.body) {
      return false;
    }
    const rects = Array.from(doc.body.children)
      .slice(0, 80)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return rects.length > 0 || doc.body.textContent.trim().length > 120;
  }

  function currentSourceKey() {
    return [
      hashText(htmlInput.value),
      viewport.width,
      assetLibrary.sessionId || "single",
      assetLibrary.files?.size || 0,
    ].join(":");
  }

  function previewMatchesCurrentSource() {
    const doc = previewFrame.contentDocument;
    const loadedKey = loadedPreviewKey(doc);
    const currentKey = currentSourceKey();
    if (!loadedKey && previewSourceKey === currentKey && previewHasUsableContent(doc)) {
      return true;
    }
    if (!loadedKey || loadedKey !== currentKey) {
      return false;
    }
    if (previewSourceKey !== currentKey && previewHasUsableContent(doc)) {
      previewSourceKey = currentKey;
      previewStale = false;
    }
    return previewSourceKey === currentKey;
  }

  function loadedPreviewKey(doc) {
    return doc?.querySelector?.('meta[name="web2fig-source-key"]')?.getAttribute("content") || "";
  }

  function stampPreviewHtml(html, key) {
    const meta = `<meta name="web2fig-source-key" content="${escapeHtmlAttr(key)}">`;
    const shim = previewCompatibilityShim();
    const source = String(html || "");
    if (/<head(\s[^>]*)?>/i.test(source)) {
      return source.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${meta}${shim}`);
    }
    if (/<html(\s[^>]*)?>/i.test(source)) {
      return source.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${meta}${shim}</head>`);
    }
    return `<!doctype html><html><head>${meta}${shim}</head><body>${source}</body></html>`;
  }

  function previewCompatibilityShim() {
    return `<script data-web2fig-preview-shim>
(() => {
  const wrapHistoryMethod = (name) => {
    const original = history && history[name];
    if (typeof original !== "function") return;
    history[name] = function web2figSafeHistoryMethod(state, title, url) {
      try {
        return original.apply(this, arguments);
      } catch (error) {
        if (error && (error.name === "SecurityError" || error.name === "DOMException")) {
          return undefined;
        }
        throw error;
      }
    };
  };
  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
})();
</script>`;
  }

  function hashText(value) {
    const text = String(value || "");
    let hash = 2166136261;
    const step = Math.max(1, Math.floor(text.length / 20000));
    for (let index = 0; index < text.length; index += step) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
  }

  function escapeHtmlAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function applySandbox() {
    const value = "allow-same-origin allow-scripts allow-forms allow-popups allow-modals";
    if (previewFrame.getAttribute("sandbox") !== value) {
      previewFrame.setAttribute("sandbox", value);
    }
  }

  function readViewport() {
    return {
      width: clamp(Number.parseInt(viewportWidthInput.value, 10), 240, 3840, 1440),
    };
  }

  function applyViewport() {
    viewportWidthInput.value = viewport.width;
    previewFrame.style.setProperty("--viewport-width", `${viewport.width}px`);
    previewFrame.style.setProperty("--viewport-height", `${previewHeight}px`);
    viewportMeta.textContent = `${viewport.width} x auto`;
  }

  function setActivePreset() {
    viewportPresetButtons.forEach((button) => {
      const isActive = Number(button.dataset.width) === viewport.width;
      button.classList.toggle("active", isActive);
    });
  }

  function setActiveExportMode() {
    exportModeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === exportMode);
    });
  }

  function clamp(value, min, max, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, value));
  }

  function updateMeta(fileName = "") {
    const prefix = fileName ? `${fileName} - ` : "";
    sourceMeta.textContent = `${prefix}${htmlInput.value.length.toLocaleString()} chars`;
  }

  function updateEmptyState() {
    const isEmpty = !htmlInput.value.trim();
    emptyState?.classList.toggle("hidden", !isEmpty);
    previewWrap?.classList.toggle("empty", isEmpty);
  }

  function securityOptionsSummary() {
    const enabled = [];
    if (blockRuntimeScriptsInput?.checked) enabled.push("runtime");
    if (blockExternalScriptsInput?.checked) enabled.push("scripts externos");
    if (blockExternalResourcesInput?.checked) enabled.push("recursos externos");
    return enabled.join(", ");
  }

  async function createAssetLibrary(files) {
    const normalizedFiles = new Map();
    files.forEach((file) => {
      const path = normalizeAssetPath(file.webkitRelativePath || file.name);
      if (path) {
        normalizedFiles.set(path, file);
      }
    });
    debugLog(`Biblioteca local: ${normalizedFiles.size} rutas normalizadas.`);

    const htmlFile = chooseHtmlFile(files);
    if (!htmlFile) {
      throw new Error("No encontre un archivo .html dentro de la carpeta.");
    }

    const htmlPath = normalizeAssetPath(htmlFile.webkitRelativePath || htmlFile.name);
    return {
      files: normalizedFiles,
      urls: new Map(),
      cssUrls: new Map(),
      htmlFile,
      htmlPath,
      baseDir: dirname(htmlPath),
      sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      localServer: false,
      originalFileCount: files.length,
    };
  }

  function createAssetLibraryFromHtmlAndAssets(htmlFile, assetFiles) {
    const normalizedFiles = new Map();
    assetFiles.forEach((file) => {
      const path = normalizeAssetPath(file.webkitRelativePath || file.name);
      if (!path) {
        return;
      }
      normalizedFiles.set(path, file);

      const withoutRoot = stripFirstPathSegment(path);
      if (withoutRoot && !normalizedFiles.has(withoutRoot)) {
        normalizedFiles.set(withoutRoot, file);
      }

      const byName = normalizeAssetPath(file.name);
      if (byName && !normalizedFiles.has(byName)) {
        normalizedFiles.set(byName, file);
      }
    });
    debugLog(`Biblioteca HTML + assets: ${normalizedFiles.size} rutas y alias normalizados.`);

    return {
      files: normalizedFiles,
      urls: new Map(),
      cssUrls: new Map(),
      htmlFile,
      htmlPath: normalizeAssetPath(htmlFile.name),
      baseDir: "",
      sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      localServer: false,
      originalFileCount: assetFiles.length,
    };
  }

  function chooseHtmlFile(files) {
    const htmlFiles = files
      .filter((file) => /\.html?$/i.test(file.name))
      .sort((a, b) => {
        const ap = normalizeAssetPath(a.webkitRelativePath || a.name);
        const bp = normalizeAssetPath(b.webkitRelativePath || b.name);
        const aIndex = /(?:^|\/)index\.html?$/i.test(ap) ? 0 : 1;
        const bIndex = /(?:^|\/)index\.html?$/i.test(bp) ? 0 : 1;
        return aIndex - bIndex || ap.split("/").length - bp.split("/").length || ap.localeCompare(bp);
      });
    return htmlFiles[0] || null;
  }

  function emptyAssetLibrary() {
    return {
      files: new Map(),
      urls: new Map(),
      cssUrls: new Map(),
      htmlFile: null,
      htmlPath: "",
      baseDir: "",
      sessionId: "",
      localServer: false,
      originalFileCount: 0,
    };
  }

  function clearAssetLibrary() {
    for (const url of assetLibrary.urls.values()) {
      URL.revokeObjectURL(url);
    }
    for (const url of assetLibrary.cssUrls.values()) {
      URL.revokeObjectURL(url);
    }
    assetLibrary = emptyAssetLibrary();
  }

  async function activateLocalAssetServer(library) {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(window.location.protocol)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register("./import-sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      await registration.update();
      await navigator.serviceWorker.ready;
      await waitForServiceWorkerControl();

      const worker = navigator.serviceWorker.controller || registration.active;
      if (!navigator.serviceWorker.controller || !worker) {
        return false;
      }

      worker.postMessage({
        type: "HTML_IMPORT_ASSETS",
        sessionId: library.sessionId,
        files: Array.from(library.files.entries()).map(([path, file]) => ({ path, file })),
      });
      library.localServer = true;
      await delay(80);
      return true;
    } catch (error) {
      library.localServer = false;
      return false;
    }
  }

  function waitForServiceWorkerControl() {
    if (navigator.serviceWorker.controller) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeout = window.setTimeout(done, 800);

      function done() {
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        resolve();
      }

      navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
    });
  }

  function fileAssetUrl(file, path) {
    const key = normalizeAssetPath(path);
    if (assetLibrary.localServer) {
      return virtualAssetUrl(key);
    }
    if (!assetLibrary.urls.has(key)) {
      assetLibrary.urls.set(key, URL.createObjectURL(assetBlob(file, key)));
    }
    return assetLibrary.urls.get(key);
  }

  async function cssAssetUrl(file, path, stack = new Set()) {
    const key = normalizeAssetPath(path);
    if (assetLibrary.localServer) {
      return virtualAssetUrl(key);
    }
    if (!assetLibrary.cssUrls.has(key)) {
      const css = await rewriteCss(await file.text(), dirname(key), stack);
      const blob = new Blob([css], { type: "text/css" });
      assetLibrary.cssUrls.set(key, URL.createObjectURL(blob));
    }
    return assetLibrary.cssUrls.get(key);
  }

  async function rewriteCss(css, baseDir, stack = new Set()) {
    let output = rewriteCssUrlsSync(css, baseDir);
    const cssWithoutComments = output.replace(/\/\*[\s\S]*?\*\//g, (match) => " ".repeat(match.length));
    const imports = Array.from(cssWithoutComments.matchAll(/@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?/gi));
    for (const match of imports) {
      const url = match[1];
      if (!shouldRewriteUrl(url)) {
        continue;
      }
      const path = resolveAssetPath(url, baseDir);
      if (stack.has(path)) {
        debugLog(`CSS import omitido por ciclo: ${path}`);
        continue;
      }
      const file = assetLibrary.files.get(path);
      if (!file) {
        continue;
      }
      const nextStack = new Set(stack);
      nextStack.add(path);
      output = output.replace(match[0], `@import url("${await cssAssetUrl(file, path, nextStack)}")`);
    }
    return output;
  }

  function rewriteCssUrlsSync(css, baseDir) {
    return String(css || "").replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
      if (!shouldRewriteUrl(rawUrl)) {
        return match;
      }
      const path = resolveAssetPath(rawUrl, baseDir);
      const file = assetLibrary.files.get(path);
      return file ? `url("${fileAssetUrl(file, path)}")` : match;
    });
  }

  function rewriteSrcset(value, baseDir) {
    return String(value || "")
      .split(",")
      .map((entry) => {
        const parts = entry.trim().split(/\s+/);
        if (!parts[0] || !shouldRewriteUrl(parts[0])) {
          return entry.trim();
        }
        const path = resolveAssetPath(parts[0], baseDir);
        const file = assetLibrary.files.get(path);
        if (!file) {
          return entry.trim();
        }
        parts[0] = fileAssetUrl(file, path);
        return parts.join(" ");
      })
      .join(", ");
  }

  function isStylesheet(element, value) {
    return element.rel?.toLowerCase() === "stylesheet" || /\.css(?:[?#].*)?$/i.test(value || "");
  }

  function clearFetchGuards(element) {
    element.removeAttribute("integrity");
    element.removeAttribute("crossorigin");
    element.removeAttribute("referrerpolicy");
  }

  function applyVirtualBase(doc, baseDir) {
    const head = doc.head || doc.documentElement;
    let base = doc.querySelector("base[href]");
    if (!base) {
      base = doc.createElement("base");
      head.prepend(base);
    }
    base.setAttribute("href", virtualBaseUrl(baseDir));
  }

  function virtualBaseUrl(baseDir) {
    const path = normalizeAssetPath(baseDir);
    const suffix = path ? `${encodeAssetPath(path)}/` : "";
    return `${window.location.origin}/__html_import__/${assetLibrary.sessionId}/${suffix}`;
  }

  function virtualAssetUrl(path) {
    return `${window.location.origin}/__html_import__/${assetLibrary.sessionId}/${encodeAssetPath(path)}`;
  }

  function encodeAssetPath(path) {
    return normalizeAssetPath(path).split("/").map(encodeURIComponent).join("/");
  }

  function assetBlob(file, path) {
    const type = assetMimeType(file, path);
    return type && type !== file.type ? file.slice(0, file.size, type) : file;
  }

  function assetMimeType(file, path) {
    if (file.type) {
      return file.type;
    }
    const clean = normalizeAssetPath(path).toLowerCase().replace(/\.descarga$/, "");
    if (clean.endsWith(".js") || clean.endsWith(".mjs")) return "text/javascript";
    if (clean.endsWith(".css")) return "text/css";
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

  function shouldRewriteUrl(value) {
    const url = String(value || "").trim();
    return Boolean(url) &&
      !url.startsWith("#") &&
      !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) &&
      !/^(?:data|blob|mailto|tel|javascript):/i.test(url);
  }

  function resolveAssetPath(value, baseDir) {
    const source = nextImageSource(value) || value;
    const clean = normalizeAssetPath(String(source || "").split("#")[0].split("?")[0]);
    const decoded = normalizeAssetPath(decodeSafe(clean));
    const candidates = [
      normalizeAssetPath(joinAssetPath(baseDir, decoded)),
      decoded.replace(/^\/+/, ""),
      normalizeAssetPath(joinAssetPath(assetLibrary.baseDir, decoded)),
    ];

    for (const candidate of candidates) {
      if (assetLibrary.files.has(candidate)) {
        return candidate;
      }
      const found = findCaseInsensitivePath(candidate);
      if (found) {
        return found;
      }
    }
    return candidates[0];
  }

  function findCaseInsensitivePath(path) {
    const lower = normalizeAssetPath(path).toLowerCase();
    const lowerClean = pathWithoutDownloadSuffix(lower);
    const lowerName = basename(lowerClean);
    for (const key of assetLibrary.files.keys()) {
      const keyLower = key.toLowerCase();
      const keyClean = pathWithoutDownloadSuffix(keyLower);
      if (
        keyLower === lower ||
        keyClean === lowerClean ||
        keyLower.endsWith(`/${lower}`) ||
        keyClean.endsWith(`/${lowerClean}`) ||
        (lowerName && basename(keyClean) === lowerName)
      ) {
        return key;
      }
    }
    return "";
  }

  function nextImageSource(value) {
    const url = String(value || "").trim();
    if (!url.includes("/_next/image") || !url.includes("url=")) {
      return "";
    }

    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.searchParams.get("url") || "";
    } catch (error) {
      const match = url.match(/[?&]url=([^&]+)/);
      return match ? decodeSafe(match[1]) : "";
    }
  }

  function pathWithoutDownloadSuffix(path) {
    return String(path || "").replace(/\.descarga$/i, "");
  }

  function basename(path) {
    const normalized = normalizeAssetPath(path);
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(index + 1) : normalized;
  }

  function decodeSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function joinAssetPath(baseDir, path) {
    if (!baseDir || path.startsWith("/")) {
      return path;
    }
    return `${baseDir}/${path}`;
  }

  function normalizeDir(path) {
    return dirname(normalizeAssetPath(`${path}/placeholder`));
  }

  function dirname(path) {
    const normalized = normalizeAssetPath(path);
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index) : "";
  }

  function stripFirstPathSegment(path) {
    const normalized = normalizeAssetPath(path);
    const index = normalized.indexOf("/");
    return index >= 0 ? normalized.slice(index + 1) : normalized;
  }

  function normalizeAssetPath(path) {
    const parts = String(path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/");
    const stack = [];
    for (const part of parts) {
      if (!part || part === ".") {
        continue;
      }
      if (part === "..") {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  function isExternalUrl(value) {
    return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(String(value || "")) ||
      /^(?:data|blob|mailto|tel|javascript):/i.test(String(value || ""));
  }

  function resetCurrentOutput() {
    currentSvg = "";
    copyButton.disabled = true;
    resetStats();
  }

  function resetStats() {
    nodeCount.textContent = "0";
    textCount.textContent = "0";
    layoutCount.textContent = "0";
    if (imageCount) {
      imageCount.textContent = "0";
    }
    if (svgCount) {
      svgCount.textContent = "0";
    }
    viewportMeta.textContent = `${viewport.width} x auto`;
  }

  function updateFontList(doc) {
    if (!fontList || !doc) {
      return;
    }

    const fonts = detectedFonts(doc).slice(0, 8);
    if (!fonts.length) {
      fontList.innerHTML = "<span>Sin fuentes detectadas</span>";
      return;
    }

    fontList.replaceChildren(...fonts.map((font) => {
      const pill = document.createElement("span");
      pill.textContent = font;
      return pill;
    }));
  }

  function detectedFonts(doc) {
    const fonts = new Set();
    collectFontFamilies(htmlInput.value, fonts);
    collectFontLinks(doc, fonts);
    collectStylesheetFonts(doc, fonts);

    const elements = Array.from(doc.body?.querySelectorAll("*") || []);
    elements.slice(0, 1200).forEach((element) => {
      const style = doc.defaultView.getComputedStyle(element);
      addFontFamilyList(style.fontFamily, fonts);
    });
    return Array.from(fonts).filter((font) => !genericFont(font)).sort((a, b) => a.localeCompare(b));
  }

  function collectFontFamilies(text, fonts) {
    String(text || "").replace(/font-family\s*:\s*([^;}]+)/gi, (_, familyList) => {
      addFontFamilyList(familyList, fonts);
      return "";
    });
    String(text || "").replace(/family=([^&"'>]+)/gi, (_, value) => {
      addGoogleFontName(value, fonts);
      return "";
    });
  }

  function collectFontLinks(doc, fonts) {
    for (const link of Array.from(doc.querySelectorAll("link[href]"))) {
      const href = link.getAttribute("href") || "";
      if (href.includes("fonts.googleapis") || href.includes("fonts.gstatic")) {
        addGoogleFontName(href, fonts);
      }
    }
  }

  function collectStylesheetFonts(doc, fonts) {
    for (const style of Array.from(doc.querySelectorAll("style"))) {
      collectFontFamilies(style.textContent, fonts);
    }

    for (const sheet of Array.from(doc.styleSheets || [])) {
      let rules = [];
      try {
        rules = Array.from(sheet.cssRules || []);
      } catch (error) {
        rules = [];
      }
      for (const rule of rules) {
        collectFontFamilies(rule.cssText, fonts);
      }
    }
  }

  function addFontFamilyList(value, fonts) {
    const families = String(value || "").split(",");
    families.forEach((family) => {
      const clean = cleanFontName(family);
      if (clean) {
        fonts.add(clean);
      }
    });
  }

  function addGoogleFontName(value, fonts) {
    const decoded = decodeSafe(String(value || "").replace(/\+/g, " "));
    const matches = decoded.matchAll(/family=([^&:]+)/gi);
    let found = false;
    for (const match of matches) {
      const clean = cleanFontName(match[1]);
      if (clean) {
        fonts.add(clean);
        found = true;
      }
    }

    if (!found && decoded.includes("family=")) {
      const clean = cleanFontName(decoded.split("family=")[1]?.split("&")[0]?.split(":")[0]);
      if (clean) {
        fonts.add(clean);
      }
    }
  }

  function cleanFontName(value) {
    return String(value || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\\["']/g, "")
      .replace(/\s+/g, " ");
  }

  function genericFont(font) {
    return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace)$/i.test(font);
  }

  function initEditorResize() {
    if (!resizeHandle) {
      return;
    }

    const savedWidth = Number.parseFloat(localStorage.getItem("web2figEditorWidth") || "");
    if (Number.isFinite(savedWidth)) {
      setEditorWidth(savedWidth);
    }

    let dragging = false;
    resizeHandle.addEventListener("pointerdown", (event) => {
      dragging = true;
      resizeHandle.classList.add("dragging");
      resizeHandle.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";
    });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const workbench = resizeHandle.parentElement;
      const rect = workbench.getBoundingClientRect();
      const sidebarWidth = workbench.querySelector(".inspector")?.getBoundingClientRect().width || 320;
      const handleWidth = resizeHandle.getBoundingClientRect().width || 7;
      const available = Math.max(480, rect.width - sidebarWidth - handleWidth);
      const next = clamp(event.clientX - rect.left, 220, Math.max(240, available - 360), 320);
      setEditorWidth(next);
    });

    resizeHandle.addEventListener("pointerup", (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      resizeHandle.classList.remove("dragging");
      resizeHandle.releasePointerCapture(event.pointerId);
      document.body.style.userSelect = "";
      const value = getComputedStyle(document.documentElement).getPropertyValue("--editor-width").trim();
      localStorage.setItem("web2figEditorWidth", String(Number.parseFloat(value) || 320));
    });
  }

  function setEditorWidth(width) {
    document.documentElement.style.setProperty("--editor-width", `${roundNumber(width)}px`);
  }

  function roundNumber(value) {
    return Math.round(Number(value) || 0);
  }

  function imageStatus(stats) {
    const svgText = stats.svgIcons ? `${stats.svgIcons} SVG vectoriales conservados` : "";

    if (!stats.images) {
      if (svgText) {
        return stats.rasterized
          ? `Conversion lista. ${svgText} y ${stats.rasterized} nodos complejos rasterizados.`
          : `Conversion lista. ${svgText}.`;
      }
      return stats.rasterized
        ? `Conversion lista. ${stats.rasterized} nodos complejos rasterizados.`
        : "Conversion lista. Copia y pega en Figma.";
    }

    const rasterImages = Math.max(0, stats.images - (stats.svgIcons || 0));
    const embeddedImages = stats.embeddedImages || 0;

    if (embeddedImages === rasterImages) {
      const imageText = embeddedImages
        ? `${embeddedImages} imagenes incorporadas`
        : "";
      const parts = [imageText, svgText].filter(Boolean).join(" y ");
      return stats.rasterized
        ? `Conversion lista. ${parts} y ${stats.rasterized} nodos rasterizados.`
        : `Conversion lista. ${parts || "Copia y pega en Figma"}.`;
    }

    const suffix = svgText ? ` ${svgText}.` : "";
    return `Conversion lista. ${embeddedImages} de ${rasterImages} imagenes incorporadas; las restantes quedaron como referencia.${suffix}`;
  }

  async function copySvg(svg) {
    if (window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          "image/svg+xml": new Blob([svg], { type: "image/svg+xml" }),
          "text/plain": new Blob([svg], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        return "advanced";
      } catch (error) {
        return copyText(svg);
      }
    }

    return copyText(svg);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return "text";
    } catch (error) {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      field.style.top = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) {
        throw error;
      }
      return "text";
    }
  }

  let toastTimer = 0;

  function setOperationProgress(percent, message = "") {
    progressValue = clamp(Math.round(percent), 0, 100, progressValue);
    if (statusProgress) {
      statusProgress.classList.add("active");
    }
    if (statusProgressBar) {
      statusProgressBar.style.width = `${progressValue}%`;
    }
    if (message) {
      statusText.textContent = `${message}... ${progressValue}%`;
    }
  }

  function finishOperationProgress() {
    if (!statusProgress || !statusProgressBar) {
      return;
    }
    progressValue = 100;
    statusProgress.classList.add("active");
    statusProgressBar.style.width = "100%";
    window.setTimeout(() => {
      statusProgress.classList.remove("active");
      statusProgressBar.style.width = "0%";
      progressValue = 0;
    }, 700);
  }

  function debugLog(message, data) {
    if (!debugLogEl) {
      return;
    }
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false });
    const detail = data === undefined ? "" : ` ${safeDebugValue(data)}`;
    debugLogEl.textContent += `[${time}] ${message}${detail}\n`;
    debugLogEl.scrollTop = debugLogEl.scrollHeight;
  }

  function safeDebugValue(value) {
    try {
      if (typeof value === "string") {
        return value;
      }
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function showCopyToast(message) {
    if (!copyToast) {
      return;
    }
    window.clearTimeout(toastTimer);
    copyToast.textContent = message;
    copyToast.classList.add("show");
    toastTimer = window.setTimeout(() => {
      copyToast.classList.remove("show");
    }, 3200);
  }
})();
