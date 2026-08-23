import { isPrinterError, listPrinters, print } from "@maxxuxx/node-printer";
import {
  type ConnectionResult,
  PrinterConnectionBase,
} from "../printer/PrinterConnectionBase";
import type { PrinterConfig } from "../utils/store";

export interface UsbPrinterInfo {
  name: string;
  portName: string;
  driverName: string;
  workOffline: boolean;
  printerStatus: number;
}

const getRawError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getUsbPrinterErrorMessage = (error: unknown): string => {
  const rawError = getRawError(error);
  const normalizedError = rawError.toLowerCase();

  if (isPrinterError(error)) {
    switch (error.code) {
      case "ERR_UNSUPPORTED_PLATFORM":
        return "backend.printer.usb_windows_required";

      case "ERR_CONNECTION_TIMEOUT":
      case "ERR_WRITE_TIMEOUT":
        return "backend.printer.usb_timeout";

      case "ERR_INVALID_TARGET":
        return "backend.printer.no_usb_config";

      case "ERR_NATIVE_MODULE_UNAVAILABLE":
        return "backend.printer.usb_open_error";
    }
  }

  if (
    normalizedError.includes("not found") ||
    normalizedError.includes("does not exist")
  ) {
    return "backend.printer.usb_open_error";
  }

  if (
    normalizedError.includes("timeout") ||
    normalizedError.includes("timed out")
  ) {
    return "backend.printer.usb_timeout";
  }

  if (
    normalizedError.includes("open") ||
    normalizedError.includes("winspool")
  ) {
    return "backend.printer.usb_open_error";
  }

  if (normalizedError.includes("write") || normalizedError.includes("send")) {
    return "backend.printer.usb_write_error";
  }

  return "backend.printer.usb_send_error";
};

export const listUsbPrinters = async (): Promise<UsbPrinterInfo[]> => {
  if (process.platform !== "win32") {
    throw new Error("USB printing through Windows Spooler requires Windows.");
  }

  const printers = await listPrinters("usb");

  return printers
    .map((printer) => {
      const candidate = printer as unknown as Record<string, unknown>;

      const name =
        typeof candidate.name === "string" ? candidate.name.trim() : "";

      if (!name) {
        return null;
      }

      return {
        name,
        portName:
          typeof candidate.portName === "string"
            ? candidate.portName.trim()
            : "",
        driverName:
          typeof candidate.driverName === "string"
            ? candidate.driverName.trim()
            : "",
        workOffline:
          typeof candidate.workOffline === "boolean"
            ? candidate.workOffline
            : false,
        printerStatus:
          typeof candidate.printerStatus === "number"
            ? candidate.printerStatus
            : 0,
      };
    })
    .filter((printer): printer is UsbPrinterInfo => printer !== null)
    .sort((first, second) => first.name.localeCompare(second.name));
};

class USBConnectionImpl extends PrinterConnectionBase {
  constructor(config: PrinterConfig, label: string) {
    super(config, label);
  }

  validate(): boolean {
    return !!(
      this.config.usbPrinterName && this.config.usbPrinterName.trim().length > 0
    );
  }

  getConnectionTypeName(): string {
    return "USB Connection";
  }

  async connect(): Promise<ConnectionResult> {
    const printerName = (this.config.usbPrinterName || "").trim();

    if (!printerName) {
      return {
        status: false,
        message: "backend.printer.no_usb_config",
      };
    }

    if (!this.label) {
      return {
        status: false,
        message: "backend.print.template_empty",
      };
    }

    if (process.platform !== "win32") {
      return {
        status: false,
        message: "backend.printer.usb_windows_required",
      };
    }

    try {
      await print(
        {
          type: "winspool",
          printerName,
          documentName: "MATZ Label Print App",
        },
        Buffer.from(this.label, "utf8"),
      );

      return {
        status: true,
        message: "backend.printer.label_sent_successfully",
      };
    } catch (error) {
      return {
        status: false,
        message: getUsbPrinterErrorMessage(error),
        rawError: getRawError(error),
      };
    }
  }
}

export default function USBConnection(
  config: PrinterConfig,
  label: string,
): Promise<ConnectionResult> {
  const connection = new USBConnectionImpl(config, label);

  return connection.execute();
}
