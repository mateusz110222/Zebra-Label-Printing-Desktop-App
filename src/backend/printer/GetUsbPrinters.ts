import { ipcMain } from "electron";
import { listUsbPrinters } from "../PrinterConnections/USBConnection";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

export default function GetUsbPrinters(): void {
  ipcMain.handle("get-usb-printers", async (event) => {
    if (event?.sender && !isMainRendererAuthorized(event)) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
        data: [],
      };
    }
    try {
      return {
        status: true,
        message: "backend.printer.GET_USB_PRINTERS_SUCCESS",
        data: await listUsbPrinters(),
      };
    } catch (error) {
      return {
        status: false,
        message: "backend.printer.GET_USB_PRINTERS_FAILED",
        rawError: error instanceof Error ? error.message : String(error),
        data: [],
      };
    }
  });
}
