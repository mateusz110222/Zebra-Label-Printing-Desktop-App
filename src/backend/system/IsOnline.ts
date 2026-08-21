import { ipcMain } from "electron";
import { PrinterConfig, store } from "../utils/store";
import { queryPrinterStatus } from "../printer/PrinterStatus";

export default async function IsOnline(): Promise<void> {
  ipcMain.handle("Get-PrinterStatus", async () => {
    try {
      const config = store.get("printer") as PrinterConfig;

      if (!config || !config.type) {
        return { status: false, message: "backend.printer.no_config" };
      }

      return await queryPrinterStatus(config);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { status: false, message: errMsg };
    }
  });
}
