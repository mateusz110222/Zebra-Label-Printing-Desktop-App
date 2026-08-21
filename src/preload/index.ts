import { contextBridge, ipcRenderer } from "electron";

type PrinterPayload =
  | {
  type: "IP";
  ip: string;
  port?: number;
}
  | {
  type: "COM";
  comPort: string;
  baudRate?: number;
}
  | {
  type: "USB";
  usbPrinterName: string;
};

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
    date: string;
  }) => ipcRenderer.invoke("reprint-label", payload),
  GetPrinterStatus: () => ipcRenderer.invoke("Get-PrinterStatus"),
  GetSystemHealth: () => ipcRenderer.invoke("get-system-health"),
  GetSerialPorts: () => ipcRenderer.invoke("get-serialPorts"),
  GetUsbPrinters: () => ipcRenderer.invoke("get-usb-printers"),
  GetPrinterConfig: () => ipcRenderer.invoke("get-printer-config"),
  SavePrinterConfig: (payload: PrinterPayload) =>
    ipcRenderer.invoke("save-printer-config", payload),
  TestPrinterConnection: (payload?: PrinterPayload) =>
    ipcRenderer.invoke("test-printer-connection", payload),

  // App/Settings
  GetAppVersion: () => ipcRenderer.invoke("get-app-version"),
  GetGithubVersion: () => ipcRenderer.invoke("get-github-version"),
  CheckForUpdates: (): Promise<UpdateCheckResponse> =>
    ipcRenderer.invoke("check-for-updates"),
  RestartApp: () => ipcRenderer.send("restart_app"),
  GetAutoUpdateSetting: (): Promise<boolean> =>
    ipcRenderer.invoke("get-auto-update-setting"),
  SetAutoUpdateSetting: (enabled: boolean) =>
    ipcRenderer.invoke("set-auto-update", enabled),
  GetDatabaseConfig: () => ipcRenderer.invoke("get-database-config"),
  SaveDatabaseConfig: (payload: {
    host: string;
    user: string;
    password: string;
    database: string;
  }) => ipcRenderer.invoke("save-database-config", payload),

  // Auth
  Login: (payload: LoginPayload): Promise<unknown> =>
    ipcRenderer.invoke("handle-login", payload),
  Logout: (): Promise<void> => ipcRenderer.invoke("handle-logout"),

  // Audit history
  GetAuditLogs: (query: Record<string, unknown>) =>
    ipcRenderer.invoke("get-audit-logs", query),
  ExportAuditLogs: (query: Record<string, unknown>) =>
    ipcRenderer.invoke("export-audit-logs", query),

  // Events
  OnUpdateAvailable: (callback: () => void) => {
    const sub = (): void => callback();
    ipcRenderer.on("update_available", sub);
    return () => ipcRenderer.removeListener("update_available", sub);
  },
  OnDownloadProgress: (callback: (data: UpdateProgress) => void) => {
    const sub = (
      _event: Electron.IpcRendererEvent,
      data: UpdateProgress,
    ): void => callback(data);
    ipcRenderer.on("download_progress", sub);
    return () => ipcRenderer.removeListener("download_progress", sub);
  },
  OnUpdateDownloaded: (callback: () => void) => {
    const sub = (): void => callback();
    ipcRenderer.on("update_downloaded", sub);
    return () => ipcRenderer.removeListener("update_downloaded", sub);
  },
};

if (!process.contextIsolated) {
  throw new Error("Context isolation must be enabled");
}

contextBridge.exposeInMainWorld("api", api);
