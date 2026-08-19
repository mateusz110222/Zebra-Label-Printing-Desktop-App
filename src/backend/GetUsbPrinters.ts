import { ipcMain } from "electron";
import { listUsbPrinters } from "./WindowsPrinter";

export default function GetUsbPrinters(): void {
  ipcMain.handle("get-usb-printers", async () => {
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
