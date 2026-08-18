import { ipcMain } from "electron";
import { store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";

import type { GeneratedLabelMetadata } from "./hooks/ZPLService";
import { generatePrintZPL, generateReprintZPL } from "./hooks/ZPLService";
import { ConnectionResult } from "./PrinterConnectionBase";
import { appendAuditLog, getAuditActor } from "./AuditLog";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";

interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
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
    : `${printer.comPort || "?"}@${printer.baudRate || "?"}`;

const logPrintFailure = async (
  mode: "print" | "reprint",
  part: PartPayload,
  quantity: number,
  message: string,
  rawError?: string,
): Promise<void> => {
  await appendAuditLog({
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

const logPrintedLabels = async ({
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
}): Promise<void> => {
  const actor = getAuditActor();
  await Promise.all(
    labels.map((label, index) =>
      appendAuditLog({
        category: "print",
        action: mode === "reprint" ? "LABEL_REPRINTED" : "LABEL_PRINTED",
        status: response.status ? "success" : "failure",
        actor,
        details: {
          batchPosition: index + 1,
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
    default:
      return { status: false, message: "backend.printer.unknown_connection" };
  }
}

export default function SetupLabelHandlers(): void {
  ipcMain.handle("print-label", async (_event, { part, quantity }) => {
    try {
      const printer = store.get("printer") as PrinterConfig;
      const result = await generatePrintZPL(part, quantity);

      if (!result.status || !result.data) {
        await logPrintFailure(
          "print",
          part,
          quantity,
          result.message,
          result.rawError,
        );
        return {
          status: false,
          message: result.message,
          rawError: result.rawError,
        };
      }

      const response = await sendToPrinter(result.data, printer);
      const printerStatus = response.status
        ? await queryPrinterStatus(printer).catch(() => undefined)
        : undefined;
      await logPrintedLabels({
        mode: "print",
        part,
        quantity,
        labels: result.labels || [],
        printer,
        response,
        printerStatus,
      });
      const labels = result.labels || [];
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
        printerReachable: printerStatus?.reachable,
        printerReady: printerStatus?.ready,
        printerStatusMessage: printerStatus?.message,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "backend.print.error";
      await logPrintFailure(
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
      };
    }
  });

  ipcMain.handle(
    "reprint-label",
    async (_event, { part, quantity, serialNumber, date }) => {
      try {
        const printer = store.get("printer") as PrinterConfig;
        const result = await generateReprintZPL(
          part,
          date,
          serialNumber,
          quantity,
        );

        if (!result.status || !result.data) {
          await logPrintFailure(
            "reprint",
            part,
            quantity,
            result.message,
            result.rawError,
          );
          return {
            status: false,
            message: result.message,
            rawError: result.rawError,
          };
        }

        const response = await sendToPrinter(result.data, printer);
        const printerStatus = response.status
          ? await queryPrinterStatus(printer).catch(() => undefined)
          : undefined;
        await logPrintedLabels({
          mode: "reprint",
          part,
          quantity,
          labels: result.labels || [],
          printer,
          response,
          selectedDate: date,
          printerStatus,
        });
        const labels = result.labels || [];
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
          printerReachable: printerStatus?.reachable,
          printerReady: printerStatus?.ready,
          printerStatusMessage: printerStatus?.message,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "backend.print.error";
        await logPrintFailure(
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
        };
      }
    },
  );
}
