import { ipcMain } from "electron";
import { PrinterConfig, store } from "../utils/store";
import { getConfiguredPrinters } from "../printer/PrinterConfigs";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

interface GetPrinterConfigResponse {
  status: boolean;
  message: string;
  data: (PrinterConfig & { printers?: PrinterConfig[] }) | [];
}

export default function GetPrinterConfig(): void {
  ipcMain.handle(
    "get-printer-config",
    async (event): Promise<GetPrinterConfigResponse> => {
      if (event?.sender && !isMainRendererAuthorized(event)) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
          data: [],
        };
      }
      try {
        const config: PrinterConfig = store.get("printer");
        return {
          status: true,
          message: "backend.printer.GET_PRINTER_CONFIG_SUCCESS",
          data: { ...config, printers: getConfiguredPrinters() },
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
