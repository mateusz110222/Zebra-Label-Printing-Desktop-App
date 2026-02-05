import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  getSetting: (key: string) => ipcRenderer.invoke("get-settings", key),
  setSetting: (key: string, value: never) =>
    ipcRenderer.send("set-settings", key, value),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateAvailable: (callback: () => void) =>
    ipcRenderer.on("update_available", callback),
  onUpdateDownloaded: (callback: () => void) =>
    ipcRenderer.on("update_downloaded", callback),
  restartApp: () => ipcRenderer.send("restart_app"),
});
