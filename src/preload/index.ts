import { contextBridge, ipcRenderer } from "electron";

interface PrinterPayload {
  type: "IP" | "COM" | "USB";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
}

interface PartPayload {
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
}

interface LoginPayload {
  login: string;
  password: string;
}

interface UpdateProgress {
  percent: string;
}

interface UpdateCheckResponse {
  status?: boolean;
  updateAvailable?: boolean;
  version?: string;
  message?: string;
}

const api = {
  // Parts and ZPL
  GetParts: (Label_Format?: string) =>
    ipcRenderer.invoke("get-parts", Label_Format),
  GetPartsConfig: () => ipcRenderer.invoke("get-parts-config"),
  SavePartsConfig: (config: {
    source: "server" | "local";
    operation: string;
    localParts: Array<{
      Operation: string;
      Part_Number: string;
      Part_Description: string;
      Serial_Prefix: string;
      Label_Format: string;
    }>;
  }) => ipcRenderer.invoke("save-parts-config", config),
  GetLabelZPL: (name: string) => ipcRenderer.invoke("get-label-zpl", name),
  GetLabelPreview: (nameOrZpl: string) =>
    ipcRenderer.invoke("get-labelFormat-preview", nameOrZpl),
  GetPrintPreview: (payload: {
    part: PartPayload;
    date: string;
    serialNumber: string;
  }) => ipcRenderer.invoke("get-label-preview", payload),
  GetLabelsFormats: () => ipcRenderer.invoke("get-labels-formats"),
  SaveLabelFormat: (name: string, data: string) =>
    ipcRenderer.invoke("save-labelformat", name, data),
  DeleteLabelFormat: (name: string) =>
    ipcRenderer.invoke("delete-label-format", name),

  // Printing
  PrintLabel: (payload: { part: PartPayload; quantity: number }) =>
    ipcRenderer.invoke("print-label", payload),
  ReprintLabel: (payload: {
    part: PartPayload;
    quantity: number;
    serialNumber: string;
  }) => ipcRenderer.invoke("reprint-label", payload),
  GetPrinterStatus: () => ipcRenderer.invoke("Get-PrinterStatus"),
  GetSerialPorts: () => ipcRenderer.invoke("get-serialPorts"),
  GetPrinterConfig: () => ipcRenderer.invoke("get-printer-config"),
  SavePrinterConfig: (channel: string, payload: PrinterPayload) =>
    ipcRenderer.invoke(channel, payload),

  // App/Settings
  GetAppVersion: () => ipcRenderer.invoke("get-app-version"),
  GetGithubVersion: () => ipcRenderer.invoke("get-github-version"),
  CheckForUpdates: (): Promise<UpdateCheckResponse> =>
    ipcRenderer.invoke("check-for-updates"),
  SetSettings: (key: string, value: unknown): void =>
    ipcRenderer.send("set-settings", key, value),
  RestartApp: () => ipcRenderer.send("restart_app"),
  GetSettings: (key: string): Promise<unknown> =>
    ipcRenderer.invoke("get-settings", key),

  // Auth
  Login: (payload: LoginPayload): Promise<unknown> =>
    ipcRenderer.invoke("handle-login", payload),
  Logout: (): Promise<void> => ipcRenderer.invoke("handle-logout"),

  // Events
  OnUpdateAvailable: (callback: () => void) => {
    const sub = (): void => callback();
    ipcRenderer.on("update_available", sub);
    return () => ipcRenderer.removeListener("update_available", sub);
  },
  OnDownloadProgress: (callback: (data: UpdateProgress) => void) => {
    const sub = (
      _event: Electron.IpcRendererEvent,
      data: UpdateProgress
    ): void => callback(data);
    ipcRenderer.on("download_progress", sub);
    return () => ipcRenderer.removeListener("download_progress", sub);
  },
  OnUpdateDownloaded: (callback: () => void) => {
    const sub = (): void => callback();
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
