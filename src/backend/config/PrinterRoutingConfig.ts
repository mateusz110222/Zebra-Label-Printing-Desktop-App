import { ipcMain } from "electron";
import { appendAuditLog, canConfigurePrinter, checkAuditLogWritable } from "../audit/AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { getPrinterRoutingConfig } from "../printer/PrinterConfigs";
import { type PrinterMode, type PrinterRoutingConfig, store } from "../utils/store";

const normalizeRouting = (
  value: unknown,
):
  | { status: true; data: PrinterRoutingConfig }
  | { status: false; message: string } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: false, message: "backend.config.invalid_printer_routing" };
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode as PrinterMode;
  if (mode !== "single" && mode !== "multiple") {
    return { status: false, message: "backend.config.invalid_printer_mode" };
  }

  if (
    !candidate.formatAssignments ||
    typeof candidate.formatAssignments !== "object" ||
    Array.isArray(candidate.formatAssignments)
  ) {
    return { status: false, message: "backend.config.invalid_printer_routing" };
  }

  const formatAssignments: Record<string, string> = {};
  for (const [format, printer] of Object.entries(
    candidate.formatAssignments as Record<string, unknown>,
  )) {
    if (format.trim() && typeof printer === "string" && printer.trim()) {
      formatAssignments[format.trim()] = printer.trim();
    }
  }

  return { status: true, data: { mode, formatAssignments } };
};

export default function PrinterRoutingConfigHandler(): void {
  ipcMain.handle("get-printer-routing-config", (event) => {
    if (!isMainRendererAuthorized(event)) {
      return { status: false, message: "backend.audit.unauthorized" };
    }

    return {
      status: true,
      message: "backend.config.printer_routing_fetched",
      data: getPrinterRoutingConfig(),
    };
  });

  ipcMain.handle(
    "save-printer-routing-config",
    async (event, value: unknown) => {
      if (!isMainRendererAuthorized(event) || !canConfigurePrinter()) {
        return { status: false, message: "backend.audit.unauthorized" };
      }

      const normalized = normalizeRouting(value);
      if (!normalized.status) return normalized;

      const auditStorage = await checkAuditLogWritable();
      if (!auditStorage.status) {
        return {
          status: false,
          message: auditStorage.message,
          rawError: auditStorage.rawError,
        };
      }

      const previous = getPrinterRoutingConfig();
      try {
        store.set("printerRouting", normalized.data);
        const auditPersisted = await appendAuditLog({
          category: "config",
          action: "PRINTER_ROUTING_CHANGED",
          status: "success",
          details: {
            mode: normalized.data.mode,
            assignments: normalized.data.formatAssignments,
          },
        });

        if (!auditPersisted) {
          store.set("printerRouting", previous);
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }

        return {
          status: true,
          message: "backend.config.printer_routing_saved",
        };
      } catch (error) {
        return {
          status: false,
          message: "backend.config.save_fail",
          rawError: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
