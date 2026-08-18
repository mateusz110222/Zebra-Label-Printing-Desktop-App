import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";
import { appendAuditLog, canViewAuditLogs } from "./AuditLog";

export default function SavePrinterConfig(): void {
  ipcMain.handle(
    "save-printer-config",
    async (_event, config: PrinterConfig) => {
      if (!canViewAuditLogs()) {
        return { status: false, message: "backend.audit.unauthorized" };
      }
      try {
        if (config.type === "IP" && (!config.ip || !config.port)) {
          await appendAuditLog({
            category: "config",
            action: "PRINTER_CONFIG_CHANGED",
            status: "failure",
            details: { type: config.type, reason: "invalid_ip_port" },
          });
          return { status: false, message: "backend.config.invalid_ip_port" };
        }
        if (config.type === "COM" && !config.comPort) {
          await appendAuditLog({
            category: "config",
            action: "PRINTER_CONFIG_CHANGED",
            status: "failure",
            details: { type: config.type, reason: "no_com_selected" },
          });
          return { status: false, message: "backend.config.no_com_selected" };
        }
        store.set("printer", config);
        await appendAuditLog({
          category: "config",
          action: "PRINTER_CONFIG_CHANGED",
          status: "success",
          details: {
            type: config.type,
            target:
              config.type === "IP"
                ? `${config.ip}:${config.port}`
                : `${config.comPort}@${config.baudRate}`,
          },
        });

        return { status: true, message: "backend.config.save_success" };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error) || "backend.config.save_fail";
        await appendAuditLog({
          category: "config",
          action: "PRINTER_CONFIG_CHANGED",
          status: "failure",
          details: { error: errorMsg },
        });
        return {
          status: false,
          message: "backend.config.save_fail",
          rawError: errorMsg,
        };
      }
    },
  );
}
