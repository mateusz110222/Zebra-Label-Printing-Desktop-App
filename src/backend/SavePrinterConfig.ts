import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";

export default function SavePrinterConfig(): void {
  ipcMain.handle(
    "save-printer-config",
    async (_event, config: PrinterConfig) => {
      try {
        if (config.type === "IP" && (!config.ip || !config.port)) {
          return { status: false, message: "backend.config.invalid_ip_port" };
        }
        if (config.type === "COM" && !config.comPort) {
          return { status: false, message: "backend.config.no_com_selected" };
        }
        store.set("printer", config);

        return { status: true, message: "backend.config.save_success" };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error) || "backend.config.save_fail";
        return {
          status: false,
          message: "backend.config.save_fail",
          rawError: errorMsg,
        };
      }
    },
  );
}
