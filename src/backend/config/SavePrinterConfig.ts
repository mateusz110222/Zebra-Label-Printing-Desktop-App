import { ipcMain } from "electron";
import {
  appendAuditLog,
  canConfigurePrinter,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import { PrinterConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { refreshAndBroadcastPrinterStatus } from "../printer/PrinterStatusService";
import {
  findPrinterByReference,
  getConfiguredPrinters,
  getPrinterName,
  getPrinterRoutingConfig,
  upsertPrinter,
} from "../printer/PrinterConfigs";

export default function SavePrinterConfig(): void {
  ipcMain.handle(
    "save-printer-config",
    async (event, config: PrinterConfig) => {
      if (!isMainRendererAuthorized(event) || !canConfigurePrinter()) {
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
        const previousPrinters = config.name?.trim()
          ? getConfiguredPrinters()
          : undefined;
        const normalizedConfig = config.name?.trim()
          ? { ...config, name: config.name.trim() }
          : config;
        store.set("printer", normalizedConfig);
        if (previousPrinters) {
          store.set(
            "printers",
            upsertPrinter(previousPrinters, normalizedConfig),
          );
        }
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
          if (previousPrinters) store.set("printers", previousPrinters);
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }

        void refreshAndBroadcastPrinterStatus().catch(() => undefined);

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

  ipcMain.handle("delete-printer-config", async (event, name: unknown) => {
    if (!isMainRendererAuthorized(event) || !canConfigurePrinter()) {
      return { status: false, message: "backend.audit.unauthorized" };
    }

    const requestedName = typeof name === "string" ? name.trim() : "";
    if (!requestedName) {
      return { status: false, message: "backend.config.printer_name_required" };
    }

    const printers = getConfiguredPrinters();
    const remaining = printers.filter(
      (printer) =>
        getPrinterName(printer).toLocaleUpperCase() !==
        requestedName.toLocaleUpperCase(),
    );

    if (remaining.length === printers.length) {
      return { status: false, message: "backend.config.printer_not_found" };
    }

    const auditStorage = await checkAuditLogWritable();
    if (!auditStorage.status) {
      return {
        status: false,
        message: auditStorage.message,
        rawError: auditStorage.rawError,
      };
    }

    const previousActive = store.get("printer");
    const previousRouting = getPrinterRoutingConfig();
    const nextAssignments = Object.fromEntries(
      Object.entries(previousRouting.formatAssignments).filter(
        ([, printerName]) =>
          printerName.toLocaleUpperCase() !== requestedName.toLocaleUpperCase(),
      ),
    );

    try {
      store.set("printers", remaining);
      store.set("printerRouting", {
        ...previousRouting,
        formatAssignments: nextAssignments,
      });
      if (
        previousActive &&
        getPrinterName(previousActive).toLocaleUpperCase() ===
          requestedName.toLocaleUpperCase()
      ) {
        store.set(
          "printer",
          remaining[0] || {
            type: "IP",
            ip: "",
            port: 9100,
          },
        );
      }

      const auditPersisted = await appendAuditLog({
        category: "config",
        action: "PRINTER_CONFIG_CHANGED",
        status: "success",
        details: { deletedPrinter: requestedName },
      });

      if (!auditPersisted) {
        store.set("printers", printers);
        store.set("printerRouting", previousRouting);
        if (previousActive) store.set("printer", previousActive);
        return { status: false, message: "backend.audit.storage_unavailable" };
      }
    } catch (error) {
      return {
        status: false,
        message: "backend.config.save_fail",
        rawError: error instanceof Error ? error.message : String(error),
      };
    }

    void refreshAndBroadcastPrinterStatus().catch(() => undefined);
    return { status: true, message: "backend.config.printer_deleted" };
  });

  ipcMain.handle("set-active-printer", async (event, name: unknown) => {
    if (!isMainRendererAuthorized(event) || !canConfigurePrinter()) {
      return { status: false, message: "backend.audit.unauthorized" };
    }

    const requestedName = typeof name === "string" ? name.trim() : "";
    const printer = findPrinterByReference(requestedName);
    if (!requestedName || !printer) {
      return { status: false, message: "backend.config.printer_not_found" };
    }

    const auditStorage = await checkAuditLogWritable();
    if (!auditStorage.status) {
      return {
        status: false,
        message: auditStorage.message,
        rawError: auditStorage.rawError,
      };
    }

    const previous = store.get("printer");
    if (
      previous &&
      getPrinterName(previous).toLocaleUpperCase() ===
        requestedName.toLocaleUpperCase()
    ) {
      return { status: true, message: "backend.config.active_printer_saved" };
    }
    try {
      store.set("printer", printer);
      const auditPersisted = await appendAuditLog({
        category: "config",
        action: "ACTIVE_PRINTER_CHANGED",
        status: "success",
        details: {
          previousPrinter: previous ? getPrinterName(previous) : "",
          printer: requestedName,
        },
      });
      if (!auditPersisted) {
        if (previous) store.set("printer", previous);
        return { status: false, message: "backend.audit.storage_unavailable" };
      }

      void refreshAndBroadcastPrinterStatus().catch(() => undefined);
      return { status: true, message: "backend.config.active_printer_saved" };
    } catch (error) {
      return {
        status: false,
        message: "backend.config.save_fail",
        rawError: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
