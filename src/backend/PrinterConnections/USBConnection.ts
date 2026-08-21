import { sendRawZplToUsbPrinter } from "../printer/WindowsPrinter";
import { PrinterConfig } from "../utils/store";
import { ConnectionResult } from "../printer/PrinterConnectionBase";

export default function USBConnection(
  config: PrinterConfig,
  label: string,
): Promise<ConnectionResult> {
  return sendRawZplToUsbPrinter(config.usbPrinterName || "", label);
}
