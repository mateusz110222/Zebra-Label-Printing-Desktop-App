import type { PrinterStatusResult } from "./PrinterStatus";

const MAX_SHUTDOWN_WAIT_MS = 180000;

let activePrintBatches = 0;
let pendingPrintBatches = 0;
let lastKnownStatus: PrinterStatusResult | undefined;
const activeStatusQueries = new Set<Promise<void>>();

let queueTail: Promise<void> = Promise.resolve();
let printBatchGeneration = 0;
const printPauses = new Set<symbol>();

export const pausePrintsForUpdate = (): (() => void) => {
  const pause = Symbol();
  printPauses.add(pause);
  return () => {
    printPauses.delete(pause);
  };
};

export const getPrintBatchGeneration = (): number => printBatchGeneration;

const getStatusWithoutQuery = (): PrinterStatusResult =>
  lastKnownStatus || {
    status: true,
    reachable: true,
    ready: true,
    detailsAvailable: false,
    message: "backend.printer.ready",
  };

export const setLastKnownPrinterStatus = (
  status: PrinterStatusResult,
): void => {
  lastKnownStatus = status;
};

export const isPrintQueueBusy = (): boolean =>
  activePrintBatches > 0 || pendingPrintBatches > 0;

export const waitForPrintQueueIdle = async (
  timeoutMs = MAX_SHUTDOWN_WAIT_MS,
): Promise<boolean> => {
  if (!isPrintQueueBusy()) return true;

  const deadline = Date.now() + timeoutMs;
  while (isPrintQueueBusy()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return false;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(100, remaining)),
    );
  }
  return true;
};

export const runPrinterStatusQuery = async (
  query: () => Promise<PrinterStatusResult>,
): Promise<PrinterStatusResult> => {
  if (isPrintQueueBusy()) {
    return getStatusWithoutQuery();
  }

  let markQueryFinished: () => void = () => undefined;
  const queryFinished = new Promise<void>((resolve) => {
    markQueryFinished = resolve;
  });
  activeStatusQueries.add(queryFinished);

  try {
    const result = await query();

    if (!isPrintQueueBusy()) {
      lastKnownStatus = result;
      return result;
    }

    return getStatusWithoutQuery();
  } finally {
    activeStatusQueries.delete(queryFinished);
    markQueryFinished();
  }
};

export const beginPrinterBatch = async (): Promise<() => void> => {
  if (printPauses.size) throw new Error("backend.print.error");
  printBatchGeneration++;
  pendingPrintBatches += 1;

  let releaseLock: () => void = () => undefined;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const previousTail = queueTail;
  queueTail = queueTail.then(() => currentLock).catch(() => currentLock);

  try {
    await previousTail;

    if (activeStatusQueries.size > 0) {
      await Promise.allSettled([...activeStatusQueries]);
    }

    activePrintBatches += 1;
  } finally {
    pendingPrintBatches = Math.max(0, pendingPrintBatches - 1);
  }

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activePrintBatches = Math.max(0, activePrintBatches - 1);
    releaseLock();
  };
};

export const resetPrinterActivityForTests = (): void => {
  activePrintBatches = 0;
  pendingPrintBatches = 0;
  lastKnownStatus = undefined;
  activeStatusQueries.clear();
  queueTail = Promise.resolve();
  printPauses.clear();
  printBatchGeneration = 0;
};
