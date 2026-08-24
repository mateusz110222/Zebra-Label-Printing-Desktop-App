import type { PrinterStatusResult } from "./PrinterStatus";

let activePrintBatches = 0;
let pendingPrintBatches = 0;
let lastKnownStatus: PrinterStatusResult | undefined;
const activeStatusQueries = new Set<Promise<void>>();

const getStatusWithoutQuery = (): PrinterStatusResult =>
  lastKnownStatus || {
    status: true,
    reachable: true,
    ready: true,
    detailsAvailable: false,
    message: "backend.printer.ready",
  };

export const runPrinterStatusQuery = async (
  query: () => Promise<PrinterStatusResult>,
): Promise<PrinterStatusResult> => {
  if (activePrintBatches > 0 || pendingPrintBatches > 0) {
    return getStatusWithoutQuery();
  }

  let markQueryFinished: () => void = () => undefined;
  const queryFinished = new Promise<void>((resolve) => {
    markQueryFinished = resolve;
  });
  activeStatusQueries.add(queryFinished);

  try {
    const result = await query();

    if (activePrintBatches === 0 && pendingPrintBatches === 0) {
      lastKnownStatus = result;
      return result;
    }

    return getStatusWithoutQuery();
  } finally {
    activeStatusQueries.delete(queryFinished);
    markQueryFinished();
  }
};

export const beginPrinterBatch = async (
  statusBeforeSend: PrinterStatusResult,
): Promise<() => void> => {
  pendingPrintBatches += 1;

  try {
    if (activeStatusQueries.size > 0) {
      await Promise.allSettled([...activeStatusQueries]);
    }

    lastKnownStatus = statusBeforeSend;
    activePrintBatches += 1;
  } finally {
    pendingPrintBatches -= 1;
  }

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activePrintBatches = Math.max(0, activePrintBatches - 1);
  };
};
