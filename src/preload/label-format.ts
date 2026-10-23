import { contextBridge, ipcRenderer } from "electron";

const api = {
  SetLabelEditorDirty: (dirty: boolean): void =>
    ipcRenderer.send("label-editor-dirty", dirty),
  GetParts: () => ipcRenderer.invoke("get-parts"),

  GetPartsConfig: () => ipcRenderer.invoke("get-parts-config"),

  GetPrintPreview: (payload: {
    part: unknown;
    date: string;
    serialNumber: string;
    zpl?: string;
  }) => ipcRenderer.invoke("get-label-preview", payload),

  GetLabelZPL: (Label_Format: string) =>
    ipcRenderer.invoke("get-label-zpl", Label_Format),

  GetLabelPreview: (Label_Format: string) =>
    ipcRenderer.invoke("get-labelFormat-preview", { zpl: Label_Format }),

  GetPrinterStatus: () => ipcRenderer.invoke("Get-PrinterStatus"),

  SaveLabelFormat: (name: string, data: string) =>
    ipcRenderer.invoke("save-labelformat", name, data),

  LogRendererError: (errorInfo: {
    message: string;
    stack?: string;
    componentStack?: string;
  }) => ipcRenderer.invoke("log-renderer-error", errorInfo),

  OnPrinterStatusChanged: (callback: (status: unknown) => void) => {
    const sub = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data);
    ipcRenderer.on("printer-status", sub);
    return () => ipcRenderer.removeListener("printer-status", sub);
  },
};

if (!process.contextIsolated) {
  throw new Error("Context isolation must be enabled");
}

contextBridge.exposeInMainWorld("api", api);
