import { ipcMain } from "electron";
import { PrinterConfig, store } from "../utils/store";
import IpConnection from "../PrinterConnections/IpConnection";
import COMConnection from "../PrinterConnections/COMConnection";
import USBConnection from "../PrinterConnections/USBConnection";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getTemplatesPath } from "../system/TemplatePaths";
import {
  appendAuditLog,
  canConfigurePrinter,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { beginPrinterBatch, getStatusWithoutQuery } from "./PrinterActivity";

const getPrinterTarget = (config: PrinterConfig): string =>
  config.type === "IP"
    ? `${config.ip || "?"}:${config.port || "?"}`
    : config.type === "COM"
      ? `${config.comPort || "?"}@${config.baudRate || 9600}`
      : config.usbPrinterName || "?";

const validateCandidateConfig = (
  config: PrinterConfig,
): { valid: boolean; message?: string } => {
  if (config.type === "IP") {
    const isValidPort =
      typeof config.port === "number" &&
      Number.isInteger(config.port) &&
      config.port >= 1 &&
      config.port <= 65535;
    const isValidIp =
      typeof config.ip === "string" &&
      config.ip.trim().length > 0 &&
      config.ip.length <= 255;
    if (!isValidIp || !isValidPort) {
      return { valid: false, message: "backend.config.invalid_ip_port" };
    }
    return { valid: true };
  }

  if (config.type === "COM") {
    if (
      !config.comPort ||
      typeof config.comPort !== "string" ||
      !config.comPort.trim()
    ) {
      return { valid: false, message: "backend.config.no_com_selected" };
    }
    return { valid: true };
  }

  if (config.type === "USB") {
    if (
      !config.usbPrinterName ||
      typeof config.usbPrinterName !== "string" ||
      !config.usbPrinterName.trim()
    ) {
      return { valid: false, message: "backend.config.no_usb_selected" };
    }
    return { valid: true };
  }

  return { valid: false, message: "backend.printer.unknown_connection" };
};

export default function TestPrinterConnection(): void {
  ipcMain.handle(
    "test-printer-connection",
    async (event, candidate?: PrinterConfig) => {
      try {
        if (!isMainRendererAuthorized(event)) {
          return { status: false, message: "backend.audit.unauthorized" };
        }

        if (candidate !== undefined) {
          if (!canConfigurePrinter()) {
            return { status: false, message: "backend.audit.unauthorized" };
          }

          const validation = validateCandidateConfig(candidate);
          if (!validation.valid) {
            return {
              status: false,
              message:
                validation.message || "backend.printer.unknown_connection",
            };
          }
        }

        const config: PrinterConfig = candidate || store.get("printer");

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

        const endBatch = await beginPrinterBatch(getStatusWithoutQuery());
        let response;
        try {
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
        } finally {
          endBatch();
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
        const config: PrinterConfig = candidate || store.get("printer");
        await appendAuditLog({
          category: "print",
          action: "TEST_LABEL_SEND_FAILED",
          status: "failure",
          details: {
            printMode: "test",
            labelFormat: "Test_Print_label.zpl",
            printerType: config?.type || "unknown",
            printerTarget: config ? getPrinterTarget(config) : "unknown",
            printerMessage: "backend.config_view.test_error",
            printerError: rawError,
          },
        });
        return {
          status: false,
          message: "backend.config_view.test_error",
          rawError,
        };
      }
    },
  );
}
