import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";

interface GetPrinterConfigResponse {
  status: boolean;
  message: string;
  data: PrinterConfig | [];
}

export default function GetPrinterConfig(): void {
  ipcMain.handle(
    "get-printer-config",
    async (): Promise<GetPrinterConfigResponse> => {
      try {
        const config: PrinterConfig = store.get("printer");
        return {
          status: true,
          message: "backend.printer.GET_PRINTER_CONFIG_SUCCESS",
          data: config,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error) || "Failed to fetch printer config";
        return { status: false, message: errorMsg, data: [] };
      }
    },
  );
}
