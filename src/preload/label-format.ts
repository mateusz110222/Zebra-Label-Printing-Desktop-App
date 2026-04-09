import { contextBridge, ipcRenderer } from "electron";

const api = {
  GetLabelZPL: (Label_Format: string) =>
    ipcRenderer.invoke("get-label-zpl", Label_Format),

  GetLabelPreview: (Label_Format: string) =>
    ipcRenderer.invoke("get-labelFormat-preview", Label_Format),

  GetPrinterStatus: () => ipcRenderer.invoke("Get-PrinterStatus"),
  SaveLabelFormat: (name: string, data: string) =>
    ipcRenderer.invoke("save-labelformat", name, data),
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
