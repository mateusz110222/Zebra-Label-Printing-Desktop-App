import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";
import USBConnection from "./PrinterConnections/USBConnection";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getTemplatesPath } from "./TemplatePaths";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable } from "./AuditLog";

const getPrinterTarget = (config: PrinterConfig): string =>
  config.type === "IP"
    ? `${config.ip || "?"}:${config.port || "?"}`
    : config.type === "COM"
      ? `${config.comPort || "?"}@${config.baudRate || 9600}`
      : config.usbPrinterName || "?";

export default function TestPrinterConnection(): void {
  ipcMain.handle(
    "test-printer-connection",
    async (_event, candidate?: PrinterConfig) => {
      const config: PrinterConfig = candidate || store.get("printer");
      try {
        if (!canViewAuditLogs()) {
          return { status: false, message: "backend.audit.unauthorized" };
        }

        const auditStorage = await checkAuditLogWritable();
        if (!auditStorage.status) {
          return {
            status: false,
            message: auditStorage.message,
            rawError: auditStorage.rawError,
            auditPersisted: false,
          };
        }

        const fullPath = path.join(getTemplatesPath(), "Test_Print_label.zpl");
        const template = await readFile(fullPath, "utf-8");

        const preparationPersisted = await appendAuditLog({
          category: "print",
          action: "TEST_LABEL_DATA_PREPARED",
          status: "success",
          details: {
            printMode: "test",
            labelFormat: "Test_Print_label.zpl",
            printerType: config.type,
            printerTarget: getPrinterTarget(config),
            deliveryState: "prepared",
          },
        });
        if (!preparationPersisted) {
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
            auditPersisted: false,
            auditStatusMessage: "backend.audit.storage_unavailable",
          };
        }

        let response;
        switch (config.type) {
          case "IP":
            response = await IpConnection(config, template);
            break;
          case "COM":
            response = await COMConnection(config, template);
            break;
          case "USB":
            response = await USBConnection(config, template);
            break;
          default:
            response = {
              status: false,
              message: "backend.printer.unknown_connection",
            };
        }

        const auditPersisted = await appendAuditLog({
          category: "print",
          action: response.status
            ? "TEST_LABEL_DATA_SENT"
            : "TEST_LABEL_SEND_FAILED",
          status: response.status ? "success" : "failure",
          details: {
            printMode: "test",
            labelFormat: "Test_Print_label.zpl",
            printerType: config.type,
            printerTarget: getPrinterTarget(config),
            printerMessage: response.message,
            printerError: response.rawError || null,
          },
        });

        return {
          ...response,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      } catch (error) {
        const rawError = error instanceof Error ? error.message : String(error);
        await appendAuditLog({
          category: "print",
          action: "TEST_LABEL_SEND_FAILED",
          status: "failure",
          details: {
            printMode: "test",
            labelFormat: "Test_Print_label.zpl",
            printerType: config.type,
            printerTarget: getPrinterTarget(config),
            printerMessage: "backend.printer.test_error",
            printerError: rawError,
          },
        });
        return {
          status: false,
          message: "backend.printer.test_error",
          rawError,
        };
      }
    },
  );
}
