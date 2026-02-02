import { ipcMain } from "electron";
import { store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";

import GenerateZPLString from "./hooks/GenerateZPLString";
import { ConnectionResult } from "./utils/PrinterConnectionBase";

export default function SetupLabelHandlers(): void {
  ipcMain.handle("print-label", async (_event, { part, quantity }) => {
    try {
      const printer = store.get("printer");

      const result = await GenerateZPLString(part, quantity, "print");

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
            return { status: false, message: "backend.printer.no_com_config" };
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
}
