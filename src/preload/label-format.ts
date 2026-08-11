import {contextBridge, ipcRenderer} from "electron";

const api = {
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
    ipcRenderer.invoke("get-labelFormat-preview", {zpl: Label_Format}),

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
