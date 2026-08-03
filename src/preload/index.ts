import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Parts and ZPL
  GetParts: (Label_Format?: string) =>
    ipcRenderer.invoke("get-parts", Label_Format),
  GetLabelZPL: (name: string) => ipcRenderer.invoke("get-label-zpl", name),
  GetLabelPreview: (nameOrZpl: string) =>
    ipcRenderer.invoke("get-labelFormat-preview", nameOrZpl),
  GetPrintPreview: (payload: {
    part: any;
    date: string;
    serialNumber: string;
  }) => ipcRenderer.invoke("get-label-preview", payload),
  GetLabelsFormats: () => ipcRenderer.invoke("get-labels-formats"),
  SaveLabelFormat: (name: string, data: string) =>
    ipcRenderer.invoke("save-labelformat", name, data),

  // Printing
  PrintLabel: (payload: { part: any; quantity: number }) =>
    ipcRenderer.invoke("print-label", payload),
  ReprintLabel: (payload: {
    part: any;
    quantity: number;
    serialNumber: string;
  }) => ipcRenderer.invoke("reprint-label", payload),
  GetPrinterStatus: () => ipcRenderer.invoke("Get-PrinterStatus"),
  GetSerialPorts: () => ipcRenderer.invoke("get-serialPorts"),
  GetPrinterConfig: () => ipcRenderer.invoke("get-printer-config"),
  SavePrinterConfig: (channel: string, payload: any) =>
    ipcRenderer.invoke(channel, payload),

  // App/Settings
  GetAppVersion: () => ipcRenderer.invoke("get-app-version"),
  GetGithubVersion: () => ipcRenderer.invoke("get-github-version"),
  CheckForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  SetSettings: (key: string, value: any) =>
    ipcRenderer.send("set-settings", key, value),
  RestartApp: () => ipcRenderer.send("restart_app"),
  GetSettings: (key: string) => ipcRenderer.invoke("get-settings", key),

  // Auth
  Login: (payload: any) => ipcRenderer.invoke("handle-login", payload),

  // Events
  OnUpdateAvailable: (callback: () => void) => {
    const sub = () => callback();
    ipcRenderer.on("update_available", sub);
    return () => ipcRenderer.removeListener("update_available", sub);
  },
  OnDownloadProgress: (callback: (data: any) => void) => {
    const sub = (_event: any, data: any) => callback(data);
    ipcRenderer.on("download_progress", sub);
    return () => ipcRenderer.removeListener("download_progress", sub);
  },
  OnUpdateDownloaded: (callback: () => void) => {
    const sub = () => callback();
    ipcRenderer.on("update_downloaded", sub);
    return () => ipcRenderer.removeListener("update_downloaded", sub);
  },
  RemoveAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
