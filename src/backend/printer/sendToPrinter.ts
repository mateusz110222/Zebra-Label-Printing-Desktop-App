import IpConnection from "../PrinterConnections/IpConnection";
import COMConnection from "../PrinterConnections/COMConnection";
import USBConnection from "../PrinterConnections/USBConnection";
import type { PrinterConfig } from "../utils/store";
import type { ConnectionResult } from "./PrinterConnectionBase";

export async function sendToPrinter(
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
