import React, { createContext, useContext, useEffect, useState } from "react";
import { extractError } from "../utils/errorUtils";

export interface PrinterStatusState {
  isOnline: boolean;
  statusMessage: string;
  rawError: string;
  reachable: boolean;
  ready: boolean;
  detailsAvailable: boolean;
  details?: PrinterStatusDetails;
  isLoading: boolean;
  printerMode: "single" | "multiple";
  totalPrinters: number;
  readyPrinters: number;
  refreshStatus: () => Promise<void>;
}

const defaultState: PrinterStatusState = {
  isOnline: false,
  statusMessage: "",
  rawError: "",
  reachable: false,
  ready: false,
  detailsAvailable: false,
  isLoading: true,
  printerMode: "single",
  totalPrinters: 0,
  readyPrinters: 0,
  refreshStatus: async () => undefined,
};

const PrinterStatusContext = createContext<PrinterStatusState>(defaultState);

export function PrinterStatusProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<Omit<PrinterStatusState, "refreshStatus">>(
    {
      isOnline: false,
      statusMessage: "",
      rawError: "",
      reachable: false,
      ready: false,
      detailsAvailable: false,
      isLoading: true,
      printerMode: "single",
      totalPrinters: 0,
      readyPrinters: 0,
    },
  );

  const handleStatusUpdate = React.useCallback(
    (res: {
      status?: boolean;
      reachable?: boolean;
      ready?: boolean;
      detailsAvailable?: boolean;
      data?: PrinterStatusDetails;
      message?: string;
      rawError?: string;
      printerMode?: "single" | "multiple";
      totalPrinters?: number;
      readyPrinters?: number;
    }): void => {
      setState({
        isOnline: Boolean(res.status),
        reachable: Boolean(res.reachable),
        ready: Boolean(res.ready),
        detailsAvailable: Boolean(res.detailsAvailable),
        details: res.data,
        statusMessage:
          res.message ||
          (res.status ? "header.connected" : "header.disconnected"),
        rawError: res.rawError || "",
        isLoading: false,
        printerMode: res.printerMode || "single",
        totalPrinters: res.totalPrinters ?? 0,
        readyPrinters: res.readyPrinters ?? 0,
      });
    },
    [],
  );

  const refreshStatus = React.useCallback(async (): Promise<void> => {
    try {
      if (window.api?.GetPrinterStatus) {
        const response = await window.api.GetPrinterStatus();
        handleStatusUpdate(response);
      }
    } catch (err) {
      console.error(
        "[PrinterStatusContext] Failed to fetch printer status:",
        err,
      );
      const { message: errMessage, details } = extractError(err);
      setState((prev) => ({
        ...prev,
        isOnline: false,
        ready: false,
        statusMessage: "backend.printer.status_error",
        rawError: details || errMessage,
        isLoading: false,
      }));
    }
  }, [handleStatusUpdate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    let unsubscribe: (() => void) | undefined;
    if (window.api?.OnPrinterStatusChanged) {
      unsubscribe = window.api.OnPrinterStatusChanged((status) => {
        handleStatusUpdate(status);
      });
    }

    return () => {
      window.clearTimeout(timer);
      if (unsubscribe) unsubscribe();
    };
  }, [handleStatusUpdate, refreshStatus]);

  return (
    <PrinterStatusContext.Provider value={{ ...state, refreshStatus }}>
      {children}
    </PrinterStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrinterStatus(): PrinterStatusState {
  return useContext(PrinterStatusContext);
}
