import { ipcMain } from "electron";
import { store } from "../utils/store";
import IpConnection from "../PrinterConnections/IpConnection";
import COMConnection from "../PrinterConnections/COMConnection";
import USBConnection from "../PrinterConnections/USBConnection";

import type { GeneratedLabel } from "../hooks/ZPLService";
import { generatePrintZPL, generateReprintZPL } from "../hooks/ZPLService";
import type { ConnectionResult } from "./PrinterConnectionBase";
import {
  appendAuditLog,
  canViewAuditLogs,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";
import { resolveAuthoritativePart } from "../parts/PartsResolver";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

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

type DeliveryState = "sent" | "failed";

type BatchDeliveryResult = "success" | "partial" | "failure";

interface AuditBatchLabel {
  batchPosition: number;
  serialNumber: string;
  fullSerialNumber: string;
  julianDate: string;
  bmsDate: string;
  zplSha256: string;
  deliveryState: DeliveryState;
  printerMessage: string | null;
  printerError: string | null;
}

const getPrinterTarget = (printer: PrinterConfig): string =>
  printer.type === "IP"
    ? `${printer.ip || "?"}:${printer.port || "?"}`
    : printer.type === "COM"
      ? `${printer.comPort || "?"}@${printer.baudRate || "?"}`
      : printer.usbPrinterName || "?";

const getPrintAction = (
  mode: "print" | "reprint",
  quantity: number,
): string => {
  if (quantity > 1) {
    return "BATCH_PRINT";
  }

  return mode === "reprint" ? "REPRINT" : "PRINT";
};

const logPrintFailure = async (
  mode: "print" | "reprint",
  part: PartPayload | undefined,
  quantity: number,
  message: string,
  rawError?: string,
): Promise<boolean> =>
  appendAuditLog({
    category: "print",
    action: getPrintAction(mode, quantity),
    status: "failure",
    details: {
      printMode: mode,
      partNumber: part?.Part_Number || "",
      description: part?.Part_Description || "",
      operation: part?.Operation || null,
      serialPrefix: part?.Serial_Prefix || "",
      labelFormat: part?.Label_Format || "",
      requestedQuantity: quantity,
      message,
      error: rawError || null,
    },
  });

const isValidQuantity = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 100;

const executeAndLogBatch = async ({
  mode,
  canonicalPart,
  quantity,
  labels,
  printer,
  selectedDate,
}: {
  mode: "print" | "reprint";
  canonicalPart: PartPayload;
  quantity: number;
  labels: GeneratedLabel[];
  printer: PrinterConfig;
  selectedDate?: string;
}): Promise<{
  status: boolean;
  message: string;
  deliveryStatus: string;
  serialStart: string | undefined;
  serialEnd: string | undefined;
  julianDate: string | undefined;
  bmsDate: string | undefined;
  quantity: number;
  sentCount: number;
  failedCount: number;
  auditPersisted: boolean;
  auditStatusMessage: string;
  printerReachable: boolean | undefined;
  printerReady: boolean | undefined;
  printerStatusMessage: string | undefined;
}> => {
  const labelResults: AuditBatchLabel[] = [];

  let sentCount = 0;
  let failedCount = 0;

  let lastSuccessfulResponse: ConnectionResult | undefined;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    let response: ConnectionResult;

    try {
      response = await sendToPrinter(label.zpl, printer);
    } catch (error) {
      response = {
        status: false,
        message: "backend.printer.error",
        rawError: error instanceof Error ? error.message : String(error),
      };
    }

    const deliveryState: DeliveryState = response.status ? "sent" : "failed";

    if (deliveryState === "sent") {
      sentCount++;
      lastSuccessfulResponse = response;
    } else {
      failedCount++;
    }

    labelResults.push({
      batchPosition: i + 1,
      serialNumber: label.metadata.serialNumber,
      fullSerialNumber:
        `${canonicalPart.Serial_Prefix}` +
        `${label.metadata.julianDate}` +
        `${label.metadata.serialNumber}`,
      julianDate: label.metadata.julianDate,
      bmsDate: label.metadata.bmsDate,
      zplSha256: label.metadata.zplSha256,
      deliveryState,
      printerMessage: response.message || null,
      printerError: response.rawError || null,
    });
  }

  const allSent = labels.length === quantity && sentCount === quantity;
  const deliveryResult: BatchDeliveryResult = allSent
    ? "success"
    : sentCount === 0
      ? "failure"
      : "partial";

  const overallStatus = allSent ? "success" : "failure";
  const actionName = getPrintAction(mode, quantity);

  const details: Record<string, unknown> = {
    printMode: mode,
    requestedQuantity: quantity,
    partNumber: canonicalPart.Part_Number,
    description: canonicalPart.Part_Description,
    operation: canonicalPart.Operation || null,
    serialPrefix: canonicalPart.Serial_Prefix,
    labelFormat: canonicalPart.Label_Format,
    selectedDate: selectedDate || null,
    printerType: printer.type,
    printerTarget: getPrinterTarget(printer),
  };

  if (quantity === 1) {
    const single = labelResults[0];

    if (single) {
      details.serialNumber = single.serialNumber;
      details.fullSerialNumber = single.fullSerialNumber;
      details.julianDate = single.julianDate;
      details.bmsDate = single.bmsDate;
      details.zplSha256 = single.zplSha256;
      details.deliveryState = single.deliveryState;
      details.printerMessage = single.printerMessage;
      details.printerError = single.printerError;
    }
  } else {
    details.sentCount = sentCount;
    details.failedCount = failedCount;
    details.deliveryResult = deliveryResult;
    details.labels = labelResults;
  }

  const auditPersisted = await appendAuditLog({
    category: "print",
    action: actionName,
    status: overallStatus,
    details,
  });

  const printerStatus = lastSuccessfulResponse
    ? await getPrinterStatusAfterSend(printer, lastSuccessfulResponse)
    : undefined;

  return {
    status: allSent,
    message: allSent
      ? mode === "reprint"
        ? "backend.reprint.success"
        : "backend.print.print_success"
      : sentCount > 0
        ? "backend.print.partial_failure"
        : "backend.print.error",
    deliveryStatus: allSent ? "sent" : sentCount > 0 ? "partial" : "failed",
    serialStart: labels.at(0)?.metadata.serialNumber,
    serialEnd: labels.at(-1)?.metadata.serialNumber,
    julianDate: labels.at(0)?.metadata.julianDate,
    bmsDate: labels.at(0)?.metadata.bmsDate,
    quantity: labels.length,
    sentCount,
    failedCount,
    auditPersisted,
    auditStatusMessage: auditPersisted
      ? "backend.audit.storage_ready"
      : "backend.audit.storage_unavailable",
    printerReachable: printerStatus?.reachable,
    printerReady: printerStatus?.ready,
    printerStatusMessage: printerStatus?.message,
  };
};

async function sendToPrinter(
  zpl: string,
  printer: PrinterConfig,
): Promise<ConnectionResult> {
  switch (printer.type) {
    case "IP":
      if (!printer.ip || !printer.port) {
        return {
          status: false,
          message: "backend.printer.no_ip_config",
        };
      }

      return IpConnection(printer, zpl);

    case "COM":
      if (!printer.comPort) {
        return {
          status: false,
          message: "backend.printer.no_com_config",
        };
      }

      return COMConnection(printer, zpl);

    case "USB":
      if (!printer.usbPrinterName) {
        return {
          status: false,
          message: "backend.printer.no_usb_config",
        };
      }

      return USBConnection(printer, zpl);

    default:
      return {
        status: false,
        message: "backend.printer.unknown_connection",
      };
  }
}

const getPrinterStatusAfterSend = async (
  printer: PrinterConfig,
  response: ConnectionResult,
): Promise<PrinterStatusResult | undefined> => {
  if (!response.status) {
    return undefined;
  }

  if (printer.type === "COM") {
    return {
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: false,
      message: "backend.printer.connected_com",
    };
  }

  return queryPrinterStatus(printer).catch(() => undefined);
};

export default function SetupLabelHandlers(): void {
  ipcMain.handle("print-label", async (event, payload) => {
    if (!isMainRendererAuthorized(event)) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
      };
    }

    const part = payload?.part as PartPayload | undefined;
    const quantity = payload?.quantity;

    if (!isValidQuantity(quantity)) {
      return {
        status: false,
        message: "backend.print.invalid_quantity",
      };
    }

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

      const result = await generatePrintZPL(canonicalPart, quantity);

      if (!result.status || !result.labels) {
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

      return await executeAndLogBatch({
        mode: "print",
        canonicalPart,
        quantity,
        labels: result.labels,
        printer,
      });
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

  ipcMain.handle("reprint-label", async (event, payload) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
      };
    }

    const part = payload?.part as PartPayload | undefined;
    const quantity = payload?.quantity;
    const serialNumber = payload?.serialNumber as string;
    const date = payload?.date as string;

    if (!isValidQuantity(quantity)) {
      return {
        status: false,
        message: "backend.print.invalid_quantity",
      };
    }

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

      const result = await generateReprintZPL(
        canonicalPart,
        date,
        serialNumber,
        quantity,
      );

      if (!result.status || !result.labels) {
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

      return await executeAndLogBatch({
        mode: "reprint",
        canonicalPart,
        quantity,
        labels: result.labels,
        printer,
        selectedDate: date,
      });
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
