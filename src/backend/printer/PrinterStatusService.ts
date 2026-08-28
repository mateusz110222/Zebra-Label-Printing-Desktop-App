import { BrowserWindow, ipcMain } from "electron";
import { type PrinterConfig, store } from "../utils/store";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";
import { setLastKnownPrinterStatus } from "./PrinterActivity";

let inFlightStatusQuery: Promise<PrinterStatusResult> | null = null;
let pollerIntervalId: NodeJS.Timeout | null = null;
let isPollerRunning = false;

export const queryPrinterStatusSingleFlight = async (
  forceConfig?: PrinterConfig,
): Promise<PrinterStatusResult> => {
  if (inFlightStatusQuery) {
    return inFlightStatusQuery;
  }

  const config = forceConfig || store.get("printer");

  inFlightStatusQuery = (async () => {
    try {
      const result = await queryPrinterStatus(config);
      setLastKnownPrinterStatus(result);
      return result;
    } catch (error) {
      const fallback: PrinterStatusResult = {
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.error",
        rawError: error instanceof Error ? error.message : String(error),
      };
      setLastKnownPrinterStatus(fallback);
      return fallback;
    } finally {
      inFlightStatusQuery = null;
    }
  })();

  return inFlightStatusQuery;
};

export const broadcastPrinterStatus = (status: PrinterStatusResult): void => {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send("printer-status", status);
    }
  }
};

export const refreshAndBroadcastPrinterStatus =
  async (): Promise<PrinterStatusResult> => {
    const status = await queryPrinterStatusSingleFlight();
    broadcastPrinterStatus(status);
    return status;
  };

export const startPrinterStatusPoller = (intervalMs: number = 5000): void => {
  if (isPollerRunning) return;
  isPollerRunning = true;

  // Immediate initial status fetch & broadcast
  void refreshAndBroadcastPrinterStatus();

  pollerIntervalId = setInterval(() => {
    void refreshAndBroadcastPrinterStatus();
  }, intervalMs);
};

export const stopPrinterStatusPoller = (): void => {
  isPollerRunning = false;
  if (pollerIntervalId) {
    clearInterval(pollerIntervalId);
    pollerIntervalId = null;
  }
};

export default function SetupPrinterStatusHandlers(): void {
  ipcMain.handle("Get-PrinterStatus", async () => {
    return queryPrinterStatusSingleFlight();
  });
}
