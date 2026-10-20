import { BrowserWindow, ipcMain } from "electron";
import { type PrinterConfig, store } from "../utils/store";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";
import { setLastKnownPrinterStatus } from "./PrinterActivity";
import {
  getConfiguredPrinters,
  getPrinterName,
  getPrinterRoutingConfig,
} from "./PrinterConfigs";
import {
  isMainRendererAuthorized,
  isPreviewAuthorized,
} from "../auth/IsAutorized";

export interface PrinterFleetStatus extends PrinterStatusResult {
  printerMode: "single" | "multiple";
  totalPrinters: number;
  readyPrinters: number;
}

const inFlightStatusQueries = new Map<string, Promise<PrinterStatusResult>>();
let pollerIntervalId: NodeJS.Timeout | null = null;
let isPollerRunning = false;

const getConfigFlightKey = (config?: PrinterConfig): string => {
  if (!config) return "default";
  if (config.type === "IP") {
    return `IP:${config.ip || ""}:${config.port ?? 9100}`;
  }
  if (config.type === "COM") {
    return `COM:${config.comPort || ""}:${config.baudRate ?? 9600}`;
  }
  return `USB:${config.usbPrinterName || ""}`;
};

export const queryPrinterStatusSingleFlight = async (
  forceConfig?: PrinterConfig,
): Promise<PrinterStatusResult> => {
  const config = forceConfig || store.get("printer");
  const key = getConfigFlightKey(config);
  const existing = inFlightStatusQueries.get(key);
  if (existing) {
    return existing;
  }

  const queryPromise = (async () => {
    try {
      const result = await queryPrinterStatus(config);
      if (!forceConfig) {
        setLastKnownPrinterStatus(result);
      }
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
      if (!forceConfig) {
        setLastKnownPrinterStatus(fallback);
      }
      return fallback;
    } finally {
      inFlightStatusQueries.delete(key);
    }
  })();

  inFlightStatusQueries.set(key, queryPromise);
  return queryPromise;
};

const withFleetStatus = async (
  activeStatus: PrinterStatusResult,
): Promise<PrinterFleetStatus> => {
  const mode = getPrinterRoutingConfig().mode;
  const configuredPrinters = getConfiguredPrinters();
  if (mode === "single") {
    return {
      ...activeStatus,
      printerMode: mode,
      totalPrinters: configuredPrinters.length > 0 ? 1 : 0,
      readyPrinters: activeStatus.ready ? 1 : 0,
    };
  }

  const activePrinter = store.get("printer") as PrinterConfig | undefined;
  const activeName = activePrinter ? getPrinterName(activePrinter) : "";
  const statuses = await Promise.all(
    configuredPrinters.map(async (printer) => {
      if (getPrinterName(printer) === activeName) return activeStatus;
      try {
        return await queryPrinterStatusSingleFlight(printer);
      } catch {
        return { ready: false };
      }
    }),
  );

  return {
    ...activeStatus,
    printerMode: mode,
    totalPrinters: configuredPrinters.length,
    readyPrinters: statuses.filter((status) => status.ready).length,
  };
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
  async (): Promise<PrinterFleetStatus> => {
    const activeStatus = await queryPrinterStatusSingleFlight();
    const status = await withFleetStatus(activeStatus);
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
  ipcMain.handle("Get-PrinterStatus", async (event) => {
    if (
      event?.sender &&
      !isMainRendererAuthorized(event) &&
      !isPreviewAuthorized(event)
    ) {
      return {
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.audit.unauthorized",
      };
    }
    const activeStatus = await queryPrinterStatusSingleFlight();
    return withFleetStatus(activeStatus);
  });
}
