import type { ConnectionResult, PrinterConfig } from "../PrinterConnectionBase";
import { sendRawZplToUsbPrinter } from "../WindowsPrinter";

export default function USBConnection(
  config: PrinterConfig,
  label: string,
): Promise<ConnectionResult> {
  return sendRawZplToUsbPrinter(config.usbPrinterName || "", label);
}
