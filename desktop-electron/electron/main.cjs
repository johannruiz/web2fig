const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { captureRenderedPage, closeCaptureBrowser } = require("./capture.cjs");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0d1014",
    title: "Web2Fig",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "app", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  ipcMain.handle("web2fig:capture-url", async (_event, options = {}) => {
    return captureRenderedPage(options.url, {
      width: Number(options.width) || 1440,
      height: Number(options.height) || 900,
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await closeCaptureBrowser();
});
