const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("web2figDesktop", {
  captureUrl(options) {
    return ipcRenderer.invoke("web2fig:capture-url", options);
  },
});
