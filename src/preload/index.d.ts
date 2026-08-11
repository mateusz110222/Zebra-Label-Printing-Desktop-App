export {};

declare global {
  interface PartPayload {
    Part_Number: string;
    Part_Description: string;
    Serial_Prefix: string;
    Label_Format: string;
  }

  interface PrinterPayload {
    type: "IP" | "COM" | "USB";
    ip?: string;
    port?: number;
    comPort?: string;
    baudRate?: number;
  }

  interface Window {
    api: {
      // Parts and ZPL
      GetParts: (Label_Format?: string) => Promise<{
        status: boolean;
        data?: unknown;
        message?: string;
        rawError?: string;
      }>;
      GetPartsConfig: () => Promise<{
        source: "server" | "local";
        operation: string;
        localParts: Array<{
          Operation: string;
          Part_Number: string;
          Part_Description: string;
          Serial_Prefix: string;
          Label_Format: string;
        }>;
      }>;
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
      }) => Promise<{ status: boolean; message?: string }>;
      GetPrintPreview: (payload: {
        part: PartPayload;
        date: string;
        serialNumber: string;
        zpl?: string;
      }) => Promise<{
        status: boolean;
        data?: string;
        message?: string;
        rawError?: string;
      }>;
      GetLabelsFormats: () => Promise<{
        status: boolean;
        data?: { name: string; data: string }[];
        message?: string;
      }>;
      GetLabelZPL: (
        name: string,
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      GetLabelPreview: (
        nameOrZpl: string,
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      SaveLabelFormat: (
        name: string,
        data: string,
      ) => Promise<{ status: boolean; message?: string }>;
      DeleteLabelFormat: (
        name: string,
      ) => Promise<{ status: boolean; message?: string }>;
      GetTemplateEditAccess: () => Promise<{ status: boolean }>;

      // Printing
      PrintLabel: (payload: {
        part: PartPayload;
        quantity: number;
      }) => Promise<{ status: boolean; message?: string; rawError?: string }>;
      ReprintLabel: (payload: {
        part: PartPayload;
        quantity: number;
        serialNumber: string;
      }) => Promise<{ status: boolean; message?: string; rawError?: string }>;
      GetPrinterStatus: () => Promise<{
        status: boolean;
        data?: string;
        message?: string;
      }>;
      GetSerialPorts: () => Promise<{
        status: boolean;
        data?: string[];
        message?: string;
      }>;
      GetPrinterConfig: () => Promise<{
        status: boolean;
        message?: string;
        data?: PrinterPayload;
      }>;
      SavePrinterConfig: (
        channel: string,
        payload: PrinterPayload,
      ) => Promise<{ status: boolean; message?: string }>;

      // App/Settings
      GetAppVersion: () => Promise<string>;
      GetGithubVersion: () => Promise<string>;
      CheckForUpdates: () => Promise<{
        status?: boolean;
        updateAvailable?: boolean;
        version?: string;
        message?: string;
      }>;
      SetSettings: (key: string, value: unknown) => void;
      RestartApp: () => void;
      GetSettings: (key: string) => Promise<unknown>;

      // Auth
      Login: (payload: { login: string; password: string }) => Promise<{
        status: boolean;
        message?: string;
        data?: { FullName: string; department: string; title: string };
        rawError?: string;
      }>;
      Logout: () => Promise<void>;

      // Events
      OnUpdateAvailable: (callback: () => void) => () => void;
      OnDownloadProgress: (
        callback: (data: { percent: string }) => void,
      ) => () => void;
      OnUpdateDownloaded: (callback: () => void) => () => void;
      RemoveAllListeners: (channel: string) => void;
    };
  }
}
