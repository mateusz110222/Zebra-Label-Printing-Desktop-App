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
        return { status: false, message: result.message || "Błąd generowania etykiety" };
      }

      const finalZpl = result.data;

      let response: ConnectionResult;

      switch (printer.type) {
        case "IP":
          if (!printer.ip || !printer.port)
            return { status: false, message: "Brak konfiguracji IP" };
          response = await IpConnection(printer, finalZpl);
          break;
        case "COM":
          if (!printer.comPort)
            return { status: false, message: "Brak konfiguracji COM" };
          response = await COMConnection(printer, finalZpl);
          break;
        default:
          return {
            status: false,
            message: `Nieznany typ połączenia: ${printer.type}`
          };
      }
      return { status: response.status, message: response.message };
    } catch (error: any) {
      const errorMsg =
        error instanceof Error ? error.message : "Błąd drukowania";
      return { status: false, message: errorMsg || "Błąd drukowania" };
    }
  });
}
