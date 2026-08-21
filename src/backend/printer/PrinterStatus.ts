import { Socket } from "node:net";
import { SerialPort } from "serialport";
import type { PrinterConfig } from "../utils/store";
import { listUsbPrinters } from "./WindowsPrinter";
import { isAccessDenied, sleep } from "../system/SystemHealth";
import { parseHostStatus } from "../utils/parseHostStatus";

export interface PrinterStatusDetails {
  paperOut: boolean;
  paused: boolean;
  headOpen: boolean;
  ribbonOut: boolean;
  bufferFull: boolean;
  underTemperature: boolean;
  overTemperature: boolean;
  formatsInBuffer: number;
  labelsRemaining: number;
}

export interface PrinterStatusResult {
  status: boolean;
  reachable: boolean;
  ready: boolean;
  detailsAvailable: boolean;
  message: string;
  rawError?: string;
  data?: PrinterStatusDetails;
}

const queryIpPrinterStatus = (
  config: PrinterConfig,
): Promise<PrinterStatusResult> =>
  new Promise((resolve) => {
    if (!config.ip || !config.port) {
      resolve({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.no_ip_config",
      });
      return;
    }

    const socket = new Socket();
    let response = "";
    let settled = false;
    const finish = (result: PrinterStatusResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(2500);
    socket.connect(config.port, config.ip, () => socket.write("~HS", "ascii"));
    socket.on("data", (chunk) => {
      response += chunk.toString("ascii");
      if (response.split("\x03").length - 1 >= 3) {
        finish(parseHostStatus(response));
      }
    });
    socket.on("error", (error) =>
      finish({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.connection_error",
        rawError: error.message,
      }),
    );
    socket.on("timeout", () =>
      finish(
        response
          ? parseHostStatus(response)
          : {
              status: false,
              reachable: true,
              ready: false,
              detailsAvailable: false,
              message: "backend.printer.status_unavailable",
            },
      ),
    );
  });

const queryComPrinterStatus = (
  config: PrinterConfig,
): Promise<PrinterStatusResult> =>
  new Promise((resolve) => {
    if (!config.comPort) {
      resolve({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.no_com_port",
      });
      return;
    }

    const port = new SerialPort({
      path: config.comPort,
      baudRate: config.baudRate || 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });

    let response = "";
    let settled = false;

    const finish = (result: PrinterStatusResult): void => {
      if (settled) return;
      settled = true;

      if (port.isOpen) {
        port.close(() => resolve(result));
      } else {
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      finish(
        response
          ? parseHostStatus(response)
          : {
              status: false,
              reachable: true,
              ready: false,
              detailsAvailable: false,
              message: "backend.printer.com_no_response",
            },
      );
    }, 2500);

    port.open((error) => {
      if (error) {
        clearTimeout(timeout);

        finish({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message: "backend.printer.com_open_error",
          rawError: error.message,
        });

        return;
      }

      port.write("~HS", "ascii", (writeError) => {
        if (writeError) {
          clearTimeout(timeout);

          finish({
            status: false,
            reachable: true,
            ready: false,
            detailsAvailable: false,
            message: "backend.printer.com_write_error",
            rawError: writeError.message,
          });

          return;
        }

        port.drain((drainError) => {
          if (drainError) {
            clearTimeout(timeout);

            finish({
              status: false,
              reachable: true,
              ready: false,
              detailsAvailable: false,
              message: "backend.printer.com_write_error",
              rawError: drainError.message,
            });
          }
        });
      });
    });

    port.on("data", (chunk) => {
      response += chunk.toString("ascii");

      if (response.split("\x03").length - 1 >= 3) {
        clearTimeout(timeout);
        finish(parseHostStatus(response));
      }
    });

    port.on("error", (error) => {
      clearTimeout(timeout);

      finish({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.connection_error",
        rawError: error.message,
      });
    });
  });

const queryUsbPrinterStatus = async (
  config: PrinterConfig,
): Promise<PrinterStatusResult> => {
  if (!config.usbPrinterName?.trim()) {
    return {
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message: "backend.printer.no_usb_config",
    };
  }

  try {
    const configuredName = config.usbPrinterName.trim().toLocaleLowerCase();
    const printer = (await listUsbPrinters()).find(
      ({ name }) => name.toLocaleLowerCase() === configuredName,
    );
    if (!printer) {
      return {
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.usb_not_found",
      };
    }

    const ready = !printer.workOffline && printer.printerStatus !== 7;
    return {
      status: ready,
      reachable: true,
      ready,
      detailsAvailable: false,
      message: ready
        ? "backend.printer.connected_usb"
        : "backend.printer.usb_offline",
    };
  } catch (error) {
    return {
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message: "backend.printer.usb_status_error",
      rawError: error instanceof Error ? error.message : String(error),
    };
  }
};

const queryPrinterStatusOnce = (
  config: PrinterConfig,
): Promise<PrinterStatusResult> => {
  switch (config.type) {
    case "IP":
      return queryIpPrinterStatus(config);

    case "COM":
      return queryComPrinterStatus(config);

    case "USB":
      return queryUsbPrinterStatus(config);

    default:
      return Promise.resolve({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.unknown_connection",
      });
  }
};

export const queryPrinterStatus = async (
  config: PrinterConfig,
): Promise<PrinterStatusResult> => {
  let result = await queryPrinterStatusOnce(config);

  if (isAccessDenied(result.rawError)) {
    await sleep(1000);
    result = await queryPrinterStatusOnce(config);
  }
  return result;
};
