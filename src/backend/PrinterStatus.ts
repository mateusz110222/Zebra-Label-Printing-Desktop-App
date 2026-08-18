import { Socket } from "node:net";
import { SerialPort } from "serialport";
import type { PrinterConfig } from "./store";

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

const parseFlag = (value: string | undefined): boolean => value?.trim() === "1";

export const parseHostStatus = (rawStatus: string): PrinterStatusResult => {
  const lines = rawStatus
    .split("\x03")
    .map((line) =>
      line
        .replaceAll("\x02", "")
        .replaceAll("\r", "")
        .replaceAll("\n", "")
        .trim(),
    )
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: false,
      message: "backend.printer.status_unavailable",
      rawError: rawStatus.slice(0, 500),
    };
  }

  const first = lines[0].split(",");
  const second = lines[1].split(",");
  const details: PrinterStatusDetails = {
    paperOut: parseFlag(first[1]),
    paused: parseFlag(first[2]),
    bufferFull: parseFlag(first[5]),
    underTemperature: parseFlag(first[10]),
    overTemperature: parseFlag(first[11]),
    headOpen: parseFlag(second[2]),
    ribbonOut: parseFlag(second[3]),
    formatsInBuffer: Number.parseInt(first[4] || "0", 10) || 0,
    labelsRemaining: Number.parseInt(second[7] || "0", 10) || 0,
  };
  const ready = !Object.entries(details).some(
    ([key, value]) =>
      typeof value === "boolean" &&
      value &&
      key !== "formatsInBuffer" &&
      key !== "labelsRemaining",
  );

  let message = "backend.printer.ready";
  if (details.paperOut) message = "backend.printer.paper_out";
  else if (details.headOpen) message = "backend.printer.head_open";
  else if (details.ribbonOut) message = "backend.printer.ribbon_out";
  else if (details.paused) message = "backend.printer.paused";
  else if (details.bufferFull) message = "backend.printer.buffer_full";
  else if (details.overTemperature)
    message = "backend.printer.over_temperature";
  else if (details.underTemperature)
    message = "backend.printer.under_temperature";

  return {
    status: ready,
    reachable: true,
    ready,
    detailsAvailable: true,
    message,
    data: details,
  };
};

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
      autoOpen: false,
    });
    port.open((error) => {
      if (error) {
        resolve({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message: "backend.printer.com_open_error",
          rawError: error.message,
        });
        return;
      }
      port.close(() =>
        resolve({
          status: true,
          reachable: true,
          ready: true,
          detailsAvailable: false,
          message: "backend.printer.connected_com",
        }),
      );
    });
  });

export const queryPrinterStatus = (
  config: PrinterConfig,
): Promise<PrinterStatusResult> =>
  config.type === "IP"
    ? queryIpPrinterStatus(config)
    : queryComPrinterStatus(config);
