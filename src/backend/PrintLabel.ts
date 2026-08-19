import { ipcMain } from "electron";
import { store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";
import USBConnection from "./PrinterConnections/USBConnection";

import type { GeneratedLabelMetadata } from "./hooks/ZPLService";
import { generatePrintZPL, generateReprintZPL } from "./hooks/ZPLService";
import { ConnectionResult } from "./PrinterConnectionBase";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable, getAuditActor } from "./AuditLog";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";
import { resolveAuthoritativePart } from "./PartsResolver";

interface PrinterConfig {
  type: "IP" | "COM" | "USB";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
  usbPrinterName?: string;
}

interface PartPayload {
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
  Operation?: string;
}

const getPrinterTarget = (printer: PrinterConfig): string =>
  printer.type === "IP"
    ? `${printer.ip || "?"}:${printer.port || "?"}`
    : printer.type === "COM"
      ? `${printer.comPort || "?"}@${printer.baudRate || "?"}`
      : printer.usbPrinterName || "?";

const logPrintFailure = async (
  mode: "print" | "reprint",
  part: PartPayload,
  quantity: number,
  message: string,
  rawError?: string,
): Promise<boolean> => {
  return appendAuditLog({
    category: "print",
    action: mode === "reprint" ? "REPRINT_REQUEST" : "PRINT_REQUEST",
    status: "failure",
    details: {
      partNumber: part?.Part_Number || "",
      description: part?.Part_Description || "",
      serialPrefix: part?.Serial_Prefix || "",
      labelFormat: part?.Label_Format || "",
      requestedQuantity: quantity,
      message,
      error: rawError || null,
    },
  });
};

const logPrintStart = async ({
  mode,
  part,
  quantity,
  selectedDate,
}: {
  mode: "print" | "reprint";
  part: PartPayload;
  quantity: number;
  selectedDate?: string;
}): Promise<boolean> =>
  appendAuditLog({
    category: "system",
    action: "LABEL_BATCH_REQUESTED",
    status: "success",
    details: {
      printMode: mode,
      requestedQuantity: quantity,
      partNumber: part.Part_Number,
      description: part.Part_Description,
      operation: part.Operation || null,
      serialPrefix: part.Serial_Prefix,
      labelFormat: part.Label_Format,
      selectedDate: selectedDate || null,
    },
  });

const logLabelPreparation = async ({
  mode,
  part,
  quantity,
  labels,
  printer,
  selectedDate,
}: {
  mode: "print" | "reprint";
  part: PartPayload;
  quantity: number;
  labels: GeneratedLabelMetadata[];
  printer: PrinterConfig;
  selectedDate?: string;
}): Promise<boolean> => {
  const actor = getAuditActor();
  const persisted = await Promise.all(
    labels.map((label, index) =>
      appendAuditLog({
        category: "print",
        action: "LABEL_DATA_PREPARED",
        status: "success",
        actor,
        details: {
          batchPosition: index + 1,
          printMode: mode,
          requestedQuantity: quantity,
          partNumber: part.Part_Number,
          description: part.Part_Description,
          operation: part.Operation || null,
          serialPrefix: part.Serial_Prefix,
          serialNumber: label.serialNumber,
          fullSerialNumber: `${part.Serial_Prefix}${label.julianDate}${label.serialNumber}`,
          labelFormat: part.Label_Format,
          julianDate: label.julianDate,
          bmsDate: label.bmsDate,
          selectedDate: selectedDate || null,
          zplSha256: label.zplSha256,
          printerType: printer.type,
          printerTarget: getPrinterTarget(printer),
          deliveryState: "prepared",
        },
      }),
    ),
  );
  return labels.length === quantity && persisted.every(Boolean);
};

const logLabelDelivery = async ({
  mode,
  part,
  quantity,
  labels,
  printer,
  response,
  selectedDate,
  printerStatus,
}: {
  mode: "print" | "reprint";
  part: PartPayload;
  quantity: number;
  labels: GeneratedLabelMetadata[];
  printer: PrinterConfig;
  response: ConnectionResult;
  selectedDate?: string;
  printerStatus?: PrinterStatusResult;
}): Promise<boolean> => {
  const actor = getAuditActor();
  const persisted = await Promise.all(
    labels.map((label, index) =>
      appendAuditLog({
        category: "print",
        action: response.status ? "LABEL_DATA_SENT" : "LABEL_SEND_FAILED",
        status: response.status ? "success" : "failure",
        actor,
        details: {
          batchPosition: index + 1,
          printMode: mode,
          requestedQuantity: quantity,
          partNumber: part.Part_Number,
          description: part.Part_Description,
          operation: part.Operation || null,
          serialPrefix: part.Serial_Prefix,
          serialNumber: label.serialNumber,
          fullSerialNumber: `${part.Serial_Prefix}${label.julianDate}${label.serialNumber}`,
          labelFormat: part.Label_Format,
          julianDate: label.julianDate,
          bmsDate: label.bmsDate,
          selectedDate: selectedDate || null,
          zplSha256: label.zplSha256,
          printerType: printer.type,
          printerTarget: getPrinterTarget(printer),
          printerMessage: response.message,
          printerError: response.rawError || null,
          printerReachableAfterSend: printerStatus?.reachable ?? null,
          printerReadyAfterSend: printerStatus?.ready ?? null,
          printerStatusAfterSend: printerStatus?.message || null,
        },
      }),
    ),
  );
  return labels.length === quantity && persisted.every(Boolean);
};

async function sendToPrinter(
  zpl: string,
  printer: PrinterConfig,
): Promise<ConnectionResult> {
  switch (printer.type) {
    case "IP":
      if (!printer.ip || !printer.port) {
        return { status: false, message: "backend.printer.no_ip_config" };
      }
      return IpConnection(printer, zpl);
    case "COM":
      if (!printer.comPort) {
        return { status: false, message: "backend.printer.no_com_config" };
      }
      return COMConnection(printer, zpl);
    case "USB":
      if (!printer.usbPrinterName) {
        return { status: false, message: "backend.printer.no_usb_config" };
      }
      return USBConnection(printer, zpl);
    default:
      return { status: false, message: "backend.printer.unknown_connection" };
  }
}

const getPrinterStatusAfterSend = async (
  printer: PrinterConfig,
  response: ConnectionResult,
): Promise<PrinterStatusResult | undefined> => {
  if (!response.status) return undefined;

  if (printer.type === "COM" || printer.type === "USB") {
    return {
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: false,
      message:
        printer.type === "COM"
          ? "backend.printer.connected_com"
          : "backend.printer.connected_usb",
    };
  }

  return queryPrinterStatus(printer).catch(() => undefined);
};

export default function SetupLabelHandlers(): void {
  ipcMain.handle("print-label", async (_event, payload) => {
    const part = payload?.part as PartPayload;
    const quantity = payload?.quantity as number;
    try {
      const auditStorage = await checkAuditLogWritable();
      if (!auditStorage.status) {
        return {
          status: false,
          message: auditStorage.message,
          rawError: auditStorage.rawError,
          auditPersisted: false,
          auditStatusMessage: auditStorage.message,
        };
      }

      const resolvedPart = await resolveAuthoritativePart(part);
      if (!resolvedPart.status) {
        const auditPersisted = await logPrintFailure(
          "print",
          part,
          quantity,
          resolvedPart.message,
          resolvedPart.rawError,
        );
        return {
          status: false,
          message: resolvedPart.message,
          rawError: resolvedPart.rawError,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }
      const canonicalPart = resolvedPart.data;

      const printer = store.get("printer") as PrinterConfig;
      const printerBeforeReservation = await queryPrinterStatus(printer).catch(
        (error) => ({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message: "backend.printer.error",
          rawError: error instanceof Error ? error.message : String(error),
        }),
      );
      if (!printerBeforeReservation.ready) {
        const auditPersisted = await logPrintFailure(
          "print",
          canonicalPart,
          quantity,
          printerBeforeReservation.message,
          printerBeforeReservation.rawError,
        );
        return {
          status: false,
          message: printerBeforeReservation.message,
          rawError: printerBeforeReservation.rawError,
          printerReachable: printerBeforeReservation.reachable,
          printerReady: false,
          printerStatusMessage: printerBeforeReservation.message,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }

      const startAuditPersisted = await logPrintStart({
        mode: "print",
        part: canonicalPart,
        quantity,
      });
      if (!startAuditPersisted) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          auditPersisted: false,
          auditStatusMessage: "backend.audit.storage_unavailable",
        };
      }

      const result = await generatePrintZPL(canonicalPart, quantity);

      if (!result.status || !result.data) {
        const auditPersisted = await logPrintFailure(
          "print",
          canonicalPart,
          quantity,
          result.message,
          result.rawError,
        );
        return {
          status: false,
          message: result.message,
          rawError: result.rawError,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }

      const labels = result.labels || [];
      const preparationPersisted = await logLabelPreparation({
        mode: "print",
        part: canonicalPart,
        quantity,
        labels,
        printer,
      });
      if (!preparationPersisted) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          deliveryStatus: "failed",
          serialStart: labels.at(0)?.serialNumber,
          serialEnd: labels.at(-1)?.serialNumber,
          julianDate: labels.at(0)?.julianDate,
          bmsDate: labels.at(0)?.bmsDate,
          quantity: labels.length,
          auditPersisted: false,
          auditStatusMessage: "backend.audit.storage_unavailable",
        };
      }

      const response = await sendToPrinter(result.data, printer);
      const printerStatus = await getPrinterStatusAfterSend(printer, response);
      const auditPersisted = await logLabelDelivery({
        mode: "print",
        part: canonicalPart,
        quantity,
        labels: result.labels || [],
        printer,
        response,
        printerStatus,
      });
      return {
        status: response.status,
        message: response.message,
        rawError: response.rawError,
        deliveryStatus: response.status ? "sent" : "failed",
        serialStart: labels.at(0)?.serialNumber,
        serialEnd: labels.at(-1)?.serialNumber,
        julianDate: labels.at(0)?.julianDate,
        bmsDate: labels.at(0)?.bmsDate,
        quantity: labels.length,
        auditPersisted,
        auditStatusMessage: auditPersisted
          ? "backend.audit.storage_ready"
          : "backend.audit.storage_unavailable",
        printerReachable: printerStatus?.reachable,
        printerReady: printerStatus?.ready,
        printerStatusMessage: printerStatus?.message,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "backend.print.error";
      const auditPersisted = await logPrintFailure(
        "print",
        part,
        quantity,
        "backend.print.error",
        errorMsg,
      );
      return {
        status: false,
        message: "backend.print.error",
        rawError: errorMsg,
        auditPersisted,
        auditStatusMessage: auditPersisted
          ? "backend.audit.storage_ready"
          : "backend.audit.storage_unavailable",
      };
    }
  });

  ipcMain.handle("reprint-label", async (_event, payload) => {
    const part = payload?.part as PartPayload;
    const quantity = payload?.quantity as number;
    const serialNumber = payload?.serialNumber as string;
    const date = payload?.date as string;
    try {
      if (!canViewAuditLogs()) {
        await logPrintFailure(
          "reprint",
          part,
          quantity,
          "backend.audit.unauthorized",
        );
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }

      const auditStorage = await checkAuditLogWritable();
      if (!auditStorage.status) {
        return {
          status: false,
          message: auditStorage.message,
          rawError: auditStorage.rawError,
          auditPersisted: false,
          auditStatusMessage: auditStorage.message,
        };
      }

      const resolvedPart = await resolveAuthoritativePart(part);
      if (!resolvedPart.status) {
        const auditPersisted = await logPrintFailure(
          "reprint",
          part,
          quantity,
          resolvedPart.message,
          resolvedPart.rawError,
        );
        return {
          status: false,
          message: resolvedPart.message,
          rawError: resolvedPart.rawError,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }
      const canonicalPart = resolvedPart.data;

      const printer = store.get("printer") as PrinterConfig;
      const printerBeforeSend = await queryPrinterStatus(printer).catch(
        (error) => ({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message: "backend.printer.error",
          rawError: error instanceof Error ? error.message : String(error),
        }),
      );
      if (!printerBeforeSend.ready) {
        const auditPersisted = await logPrintFailure(
          "reprint",
          canonicalPart,
          quantity,
          printerBeforeSend.message,
          printerBeforeSend.rawError,
        );
        return {
          status: false,
          message: printerBeforeSend.message,
          rawError: printerBeforeSend.rawError,
          printerReachable: printerBeforeSend.reachable,
          printerReady: false,
          printerStatusMessage: printerBeforeSend.message,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }
      const startAuditPersisted = await logPrintStart({
        mode: "reprint",
        part: canonicalPart,
        quantity,
        selectedDate: date,
      });
      if (!startAuditPersisted) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          auditPersisted: false,
          auditStatusMessage: "backend.audit.storage_unavailable",
        };
      }
      const result = await generateReprintZPL(
        canonicalPart,
        date,
        serialNumber,
        quantity,
      );

      if (!result.status || !result.data) {
        const auditPersisted = await logPrintFailure(
          "reprint",
          canonicalPart,
          quantity,
          result.message,
          result.rawError,
        );
        return {
          status: false,
          message: result.message,
          rawError: result.rawError,
          auditPersisted,
          auditStatusMessage: auditPersisted
            ? "backend.audit.storage_ready"
            : "backend.audit.storage_unavailable",
        };
      }

      const labels = result.labels || [];
      const preparationPersisted = await logLabelPreparation({
        mode: "reprint",
        part: canonicalPart,
        quantity,
        labels,
        printer,
        selectedDate: date,
      });
      if (!preparationPersisted) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          deliveryStatus: "failed",
          serialStart: labels.at(0)?.serialNumber,
          serialEnd: labels.at(-1)?.serialNumber,
          julianDate: labels.at(0)?.julianDate,
          bmsDate: labels.at(0)?.bmsDate,
          quantity: labels.length,
          auditPersisted: false,
          auditStatusMessage: "backend.audit.storage_unavailable",
        };
      }

      const response = await sendToPrinter(result.data, printer);
      const printerStatus = await getPrinterStatusAfterSend(printer, response);
      const auditPersisted = await logLabelDelivery({
        mode: "reprint",
        part: canonicalPart,
        quantity,
        labels: result.labels || [],
        printer,
        response,
        selectedDate: date,
        printerStatus,
      });
      return {
        status: response.status,
        message: response.message,
        rawError: response.rawError,
        deliveryStatus: response.status ? "sent" : "failed",
        serialStart: labels.at(0)?.serialNumber,
        serialEnd: labels.at(-1)?.serialNumber,
        julianDate: labels.at(0)?.julianDate,
        bmsDate: labels.at(0)?.bmsDate,
        quantity: labels.length,
        auditPersisted,
        auditStatusMessage: auditPersisted
          ? "backend.audit.storage_ready"
          : "backend.audit.storage_unavailable",
        printerReachable: printerStatus?.reachable,
        printerReady: printerStatus?.ready,
        printerStatusMessage: printerStatus?.message,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "backend.print.error";
      const auditPersisted = await logPrintFailure(
        "reprint",
        part,
        quantity,
        "backend.print.error",
        errorMsg,
      );
      return {
        status: false,
        message: "backend.print.error",
        rawError: errorMsg,
        auditPersisted,
        auditStatusMessage: auditPersisted
          ? "backend.audit.storage_ready"
          : "backend.audit.storage_unavailable",
      };
    }
  });
}
