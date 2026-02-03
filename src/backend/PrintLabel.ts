import { ipcMain } from "electron";
import { store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";

import { generatePrintZPL, generateReprintZPL } from "./hooks/ZPLService";
import { ConnectionResult } from "./utils/PrinterConnectionBase";

export default function SetupLabelHandlers(): void {
  // Standard print (updates DB)
  ipcMain.handle("print-label", async (_event, { part, quantity }) => {
    try {
      const printer = store.get("printer");

      const result = await generatePrintZPL(part, quantity);

      if (!result.status || !result.data) {
        return {
          status: false,
          message: result.message,
          rawError: result.rawError,
        };
      }

      const finalZpl = result.data;

      let response: ConnectionResult;

      switch (printer.type) {
        case "IP":
          if (!printer.ip || !printer.port)
            return { status: false, message: "backend.printer.no_ip_config" };
          response = await IpConnection(printer, finalZpl);
          break;
        case "COM":
          if (!printer.comPort)
            return {
              status: false,
              message: "backend.printer.no_com_config",
            };
          response = await COMConnection(printer, finalZpl);
          break;
        default:
          return {
            status: false,
            message: "backend.printer.unknown_connection",
          };
      }
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

  // Reprint (does NOT update DB)
  ipcMain.handle(
    "reprint-label",
    async (_event, { part, quantity, date, serialNumber }) => {
      try {
        const printer = store.get("printer");

        const result = await generateReprintZPL(
          part,
          quantity,
          date,
          serialNumber,
        );

        if (!result.status || !result.data) {
          return {
            status: false,
            message: result.message,
            rawError: result.rawError,
          };
        }

        const finalZpl = result.data;

        let response: ConnectionResult;

        switch (printer.type) {
          case "IP":
            if (!printer.ip || !printer.port)
              return { status: false, message: "backend.printer.no_ip_config" };
            response = await IpConnection(printer, finalZpl);
            break;
          case "COM":
            if (!printer.comPort)
              return {
                status: false,
                message: "backend.printer.no_com_config",
              };
            response = await COMConnection(printer, finalZpl);
            break;
          default:
            return {
              status: false,
              message: "backend.printer.unknown_connection",
            };
        }
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
    },
  );
}
