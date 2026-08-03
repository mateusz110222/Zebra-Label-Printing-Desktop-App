import { IpcRendererEvent } from "electron";

declare global {
  interface Window {
    api: {
      // Parts and ZPL
      GetParts: (Label_Format?: string) => Promise<{ status: boolean; data?: any; message?: string }>;
      GetPrintPreview: (payload: { part: any; date: string; serialNumber: string }) => Promise<{ status: boolean; data?: string; message?: string; rawError?: string }>;
      GetLabelsFormats: () => Promise<{ status: boolean; data?: { name: string; data: string }[]; message?: string }>;
      GetLabelZPL: (name: string) => Promise<{ status: boolean; data?: string; message?: string }>;
      GetLabelPreview: (nameOrZpl: string) => Promise<{ status: boolean; data?: string; message?: string }>;
      SaveLabelFormat: (name: string, data: string) => Promise<{ status: boolean; message?: string }>;

      // Printing
      PrintLabel: (payload: { part: any; quantity: number }) => Promise<{ status: boolean; message?: string; rawError?: string }>;
      ReprintLabel: (payload: { part: any; quantity: number; serialNumber: string }) => Promise<{ status: boolean; message?: string; rawError?: string }>;
      GetPrinterStatus: () => Promise<{ status: boolean; data?: string; message?: string }>;
      GetSerialPorts: () => Promise<{ status: boolean; data?: string[]; message?: string }>;
      GetPrinterConfig: () => Promise<any>;
      SavePrinterConfig: (channel: string, payload: any) => Promise<{ status: boolean; message?: string }>;

      // App/Settings
      GetAppVersion: () => Promise<string>;
      GetGithubVersion: () => Promise<string>;
      CheckForUpdates: () => Promise<void>;
      SetSettings: (key: string, value: any) => void;
      RestartApp: () => void;
      GetSettings: (key: string) => Promise<any>;

      // Auth
      Login: (payload: any) => Promise<{ status: boolean; message?: string; data?: { FullName: string; department: string; title: string }; rawError?: string }>;

      // Events
      OnUpdateAvailable: (callback: () => void) => () => void;
      OnDownloadProgress: (callback: (data: any) => void) => () => void;
      OnUpdateDownloaded: (callback: () => void) => () => void;
      RemoveAllListeners: (channel: string) => void;
    }
  }
}
