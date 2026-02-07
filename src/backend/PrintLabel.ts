import { ipcMain } from "electron";
import { store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";

import { generatePrintZPL, generateReprintZPL } from "./hooks/ZPLService";
import { ConnectionResult } from "./PrinterConnectionBase";

interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
}

async function sendToPrinter(
  zpl: string,
  printer: PrinterConfig
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
        return {
          status: false,
          message: result.message,
          rawError: result.rawError,
        };
      }

      const response = await sendToPrinter(result.data, printer);
      return {
        status: response.status,
        message: response.message,
        rawError: response.rawError,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "backend.print.error";
      return {
        status: false,
        message: "backend.print.error",
        rawError: errorMsg,
      };
    }
  });

  ipcMain.handle(
    "reprint-label",
    async (_event, { part, quantity, serialNumber }) => {
      try {
        const printer = store.get("printer") as PrinterConfig;
        const result = await generateReprintZPL(part, serialNumber, quantity);

        if (!result.status || !result.data) {
          return {
            status: false,
            message: result.message,
            rawError: result.rawError,
          };
        }

        const response = await sendToPrinter(result.data, printer);
        return {
          status: response.status,
          message: response.message,
          rawError: response.rawError,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "backend.print.error";
        return {
          status: false,
          message: "backend.print.error",
          rawError: errorMsg,
        };
      }
    }
  );
}
