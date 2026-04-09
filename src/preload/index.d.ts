import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      GetLabelZPL: (
        name: string,
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      GetLabelPreview: (
        nameOrZpl: string,
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      GetPrinterStatus: () => Promise<{
        status: boolean;
        data?: string;
        message?: string;
      }>;
      SaveLabelFormat: (
        name: string,
        data: string,
      ) => Promise<{ status: boolean; message?: string }>;
    };
  }
}
