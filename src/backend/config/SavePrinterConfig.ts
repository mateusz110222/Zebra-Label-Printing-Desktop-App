import { ipcMain } from "electron";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable } from "../audit/AuditLog";
import { PrinterConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

export default function SavePrinterConfig(): void {
  ipcMain.handle(
    "save-printer-config",
    async (event, config: PrinterConfig) => {
      if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
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
        if (config.type === "USB" && !config.usbPrinterName?.trim()) {
          await appendAuditLog({
            category: "config",
            action: "PRINTER_CONFIG_CHANGED",
            status: "failure",
            details: { type: config.type, reason: "no_usb_selected" },
          });
          return { status: false, message: "backend.config.no_usb_selected" };
        }

        const auditStorage = await checkAuditLogWritable();
        if (!auditStorage.status) {
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
            rawError: auditStorage.rawError,
          };
        }

        const previousConfig = { ...store.get("printer") };
        store.set("printer", config);
        const auditPersisted = await appendAuditLog({
          category: "config",
          action: "PRINTER_CONFIG_CHANGED",
          status: "success",
          details: {
            type: config.type,
            target:
              config.type === "IP"
                ? `${config.ip}:${config.port}`
                : config.type === "COM"
                  ? `${config.comPort}@${config.baudRate}`
                  : config.usbPrinterName || "",
          },
        });

        if (!auditPersisted) {
          store.set("printer", previousConfig);
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }

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
