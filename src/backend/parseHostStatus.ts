import { PrinterStatusDetails, PrinterStatusResult } from "./PrinterStatus";

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
