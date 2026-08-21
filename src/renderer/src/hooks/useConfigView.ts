import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionType, UiMessage, UsbPrinterInfo } from "../types";
import { extractError } from "../utils/errorUtils";
import { useAuth } from "../context/AuthContext";

interface UseConfigData {
  connectionType: ConnectionType;
  ipAddress: string;
  port: string;
  selectedCom: string;
  baudRate: number;
  serialPorts: string[];
  displayedCom: string;
  displayedBaudRate: number;
  selectedUsbPrinter: string;
  displayedUsbPrinter: string;
  usbPrinters: UsbPrinterInfo[];
  hasConfig: boolean;
  hasDatabaseConfig: boolean;
  isPrinterEditing: boolean;
  isDatabaseEditing: boolean;
  dbHost: string;
  dbUser: string;
  dbPass: string;
  dbName: string;
}

interface UseConfigStatus {
  isInitializing: boolean;
  isPrinterProcessing: boolean;
  isDatabaseProcessing: boolean;
  criticalError: string | null;
  uiMessage: UiMessage | null;
}

interface UseConfigActions {
  setConnectionType: (type: ConnectionType) => void;
  setIpAddress: (ip: string) => void;
  setPort: (port: string) => void;
  setSelectedCom: (com: string) => void;
  setBaudRate: (rate: number) => void;
  setSelectedUsbPrinter: (name: string) => void;
  handleRefreshPorts: () => Promise<void>;
  handleRefreshUsbPrinters: () => Promise<void>;
  handlePrinterAction: (action: "SAVE" | "TEST") => Promise<void>;
  handleDatabaseSave: () => Promise<void>;
  beginPrinterEdit: () => void;
  cancelPrinterEdit: () => void;
  beginDatabaseEdit: () => void;
  cancelDatabaseEdit: () => void;
  setUiMessage: (msg: UiMessage | null) => void;
  setDbHost: (host: string) => void;
  setDbUser: (user: string) => void;
  setDbPass: (pass: string) => void;
  setDbName: (name: string) => void;
}

interface UseConfigViewReturn {
  data: UseConfigData;
  status: UseConfigStatus;
  actions: UseConfigActions;
  isPrinterValid: boolean;
  isDatabaseValid: boolean;
}

interface PrinterDraft {
  connectionType: ConnectionType;
  ipAddress: string;
  port: string;
  selectedCom: string;
  baudRate: number;
  selectedUsbPrinter: string;
}

interface DatabaseDraft {
  dbHost: string;
  dbUser: string;
  dbPass: string;
  dbName: string;
}

const DEFAULT_PRINTER_DRAFT: PrinterDraft = {
  connectionType: "IP",
  ipAddress: "",
  port: "9100",
  selectedCom: "",
  baudRate: 9600,
  selectedUsbPrinter: "",
};

const DEFAULT_DATABASE_DRAFT: DatabaseDraft = {
  dbHost: "",
  dbUser: "",
  dbPass: "",
  dbName: "",
};

export function useConfigView(): UseConfigViewReturn {
  const { t } = useTranslation();
  const { CanEdit } = useAuth();

  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [connectionType, setConnectionType] = useState<ConnectionType>("IP");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("9100");
  const [selectedCom, setSelectedCom] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [displayedCom, setDisplayedCom] = useState("");
  const [displayedBaudRate, setDisplayedBaudRate] = useState(9600);
  const [selectedUsbPrinter, setSelectedUsbPrinter] = useState("");
  const [displayedUsbPrinter, setDisplayedUsbPrinter] = useState("");
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinterInfo[]>([]);

  const [dbHost, setDbHost] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("");

  const [isPrinterProcessing, setIsPrinterProcessing] = useState(false);
  const [isDatabaseProcessing, setIsDatabaseProcessing] = useState(false);
  const [isPrinterEditing, setIsPrinterEditing] = useState(false);
  const [isDatabaseEditing, setIsDatabaseEditing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [hasDatabaseConfig, setHasDatabaseConfig] = useState(false);
  const savedPrinterDraft = useRef<PrinterDraft>(DEFAULT_PRINTER_DRAFT);
  const savedDatabaseDraft = useRef<DatabaseDraft>(DEFAULT_DATABASE_DRAFT);

  const applyPrinterDraft = (draft: PrinterDraft): void => {
    setConnectionType(draft.connectionType);
    setIpAddress(draft.ipAddress);
    setPort(draft.port);
    setSelectedCom(draft.selectedCom);
    setBaudRate(draft.baudRate);
    setDisplayedCom(draft.selectedCom);
    setDisplayedBaudRate(draft.baudRate);
    setSelectedUsbPrinter(draft.selectedUsbPrinter);
    setDisplayedUsbPrinter(draft.selectedUsbPrinter);
  };

  const applyDatabaseDraft = (draft: DatabaseDraft): void => {
    setDbHost(draft.dbHost);
    setDbUser(draft.dbUser);
    setDbPass(draft.dbPass);
    setDbName(draft.dbName);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async (): Promise<void> => {
      setIsInitializing(true);
      try {
        const serialPortsResp = await window.api.GetSerialPorts();

        if (!isMounted) return;
        if (serialPortsResp.status)
          setSerialPorts(serialPortsResp.data as string[]);

        const usbPrintersResp = await window.api.GetUsbPrinters();
        if (!isMounted) return;
        if (usbPrintersResp.status && usbPrintersResp.data) {
          setUsbPrinters(usbPrintersResp.data);
        }

        const configResponse = await window.api.GetPrinterConfig();

        if (!isMounted) return;
        if (configResponse.status && configResponse.data) {
          const cfg = configResponse.data;

          const printerDraft: PrinterDraft = {
            connectionType: cfg.type,
            ipAddress: cfg.type === "IP" ? cfg.ip : "",
            port:
              cfg.type === "IP"
                ? (cfg.port ?? 9100).toString()
                : "9100",
            selectedCom: cfg.type === "COM" ? cfg.comPort : "",
            baudRate:
              cfg.type === "COM"
                ? (cfg.baudRate ?? 9600)
                : 9600,
            selectedUsbPrinter:
              cfg.type === "USB"
                ? cfg.usbPrinterName
                : "",
          };
          savedPrinterDraft.current = printerDraft;
          applyPrinterDraft(printerDraft);

          const isIpValid = cfg.type === "IP" && cfg.ip;
          const isComValid = cfg.type === "COM" && cfg.comPort;
          const isUsbValid = cfg.type === "USB" && cfg.usbPrinterName;

          if (isIpValid || isComValid || isUsbValid) {
            setHasConfig(true);
            setIsPrinterEditing(false);
          }
        }

        const dbConfigResponse = await window.api.GetDatabaseConfig();
        if (!isMounted) return;
        if (dbConfigResponse.status && dbConfigResponse.data) {
          const dbConfig = dbConfigResponse.data;
          const databaseDraft: DatabaseDraft = {
            dbHost: dbConfig.host || "",
            dbUser: dbConfig.user || "",
            dbPass: CanEdit ? dbConfig.password || "" : "",
            dbName: dbConfig.database || "",
          };
          savedDatabaseDraft.current = databaseDraft;
          applyDatabaseDraft(databaseDraft);
          setHasDatabaseConfig(
            Boolean(dbConfig.host || dbConfig.user || dbConfig.database),
          );
          setIsDatabaseEditing(false);
        }
      } catch (err) {
        if (!isMounted) return;
        const { message } = extractError(err);
        setCriticalError(t(message));
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };
    init();

    return () => {
      isMounted = false;
    };
  }, [CanEdit, t]);

  const handlePrinterAction = async (
    action: "SAVE" | "TEST",
  ): Promise<void> => {
    setIsPrinterProcessing(true);
    setUiMessage(null);

    try {
      const payload: PrinterPayload =
        connectionType === "IP"
          ? {
            type: "IP",
            ip: ipAddress,
            port: parseInt(port, 10),
          }
          : connectionType === "COM"
            ? {
              type: "COM",
              comPort: selectedCom,
              baudRate,
            }
            : {
              type: "USB",
              usbPrinterName: selectedUsbPrinter,
            };

      const resp =
        action === "SAVE"
          ? await window.api.SavePrinterConfig(payload)
          : await window.api.TestPrinterConnection(payload);

      if (resp.status) {
        setUiMessage({
          type: "success",
          text:
            action === "SAVE"
              ? t("config_view.save_success")
              : t("config_view.test_success"),
          details:
            resp.message !== "backend.printer.label_sent_successfully"
              ? t(resp.message || "")
              : undefined,
        });

        if (action === "SAVE") {
          const savedDraft: PrinterDraft = {
            connectionType,
            ipAddress,
            port,
            selectedCom,
            baudRate,
            selectedUsbPrinter,
          };
          savedPrinterDraft.current = savedDraft;
          applyPrinterDraft(savedDraft);
          setHasConfig(true);
          setIsPrinterEditing(false);
        }
      } else {
        setUiMessage({
          type: "error",
          text:
            action === "SAVE"
              ? t("config_view.save_error")
              : t("config_view.test_error"),
          details: t(resp.message || ""),
        });
      }
    } catch (err) {
      const { message } = extractError(err);
      setUiMessage({
        type: "error",
        text: t("config_view.critical_error"),
        details: t(message),
      });
    } finally {
      setIsPrinterProcessing(false);
    }
  };

  const handleDatabaseSave = async (): Promise<void> => {
    setIsDatabaseProcessing(true);
    setUiMessage(null);

    try {
      const response = await window.api.SaveDatabaseConfig({
        host: dbHost,
        user: dbUser,
        password: dbPass,
        database: dbName,
      });
      if (!response.status) {
        setUiMessage({
          type: "error",
          text: t("config_view.save_error"),
          details: t(response.message || ""),
        });
        return;
      }

      savedDatabaseDraft.current = { dbHost, dbUser, dbPass, dbName };
      setHasDatabaseConfig(true);
      setIsDatabaseEditing(false);
      setUiMessage({
        type: "success",
        text: t("config_view.save_success"),
      });
    } catch (err) {
      const { message } = extractError(err);
      setUiMessage({
        type: "error",
        text: t("config_view.critical_error"),
        details: t(message),
      });
    } finally {
      setIsDatabaseProcessing(false);
    }
  };

  const cancelPrinterEdit = (): void => {
    applyPrinterDraft(savedPrinterDraft.current);
    setIsPrinterEditing(false);
  };

  const cancelDatabaseEdit = (): void => {
    applyDatabaseDraft(savedDatabaseDraft.current);
    setIsDatabaseEditing(false);
  };

  const handleRefreshPorts = async (): Promise<void> => {
    const serialPortsResp = await window.api.GetSerialPorts();
    if (serialPortsResp.status)
      setSerialPorts(serialPortsResp.data as string[]);
  };

  const handleRefreshUsbPrinters = async (): Promise<void> => {
    const response = await window.api.GetUsbPrinters();
    if (response.status && response.data) setUsbPrinters(response.data);
  };

  const isValidIpAddress = (ip: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    return ip.split(".").every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  };

  const parsedPort = Number(port);
  const isPrinterValid =
    connectionType === "IP"
      ? isValidIpAddress(ipAddress) &&
        Number.isInteger(parsedPort) &&
        parsedPort >= 1 &&
        parsedPort <= 65535
      : connectionType === "COM"
        ? selectedCom.length > 0
        : selectedUsbPrinter.trim().length > 0;
  const isDatabaseValid =
    dbHost.trim().length > 0 &&
    dbUser.trim().length > 0 &&
    dbName.trim().length > 0;

  return {
    data: {
      connectionType,
      ipAddress,
      port,
      selectedCom,
      baudRate,
      serialPorts,
      displayedCom,
      displayedBaudRate,
      selectedUsbPrinter,
      displayedUsbPrinter,
      usbPrinters,
      hasConfig,
      hasDatabaseConfig,
      isPrinterEditing,
      isDatabaseEditing,
      dbHost,
      dbUser,
      dbPass,
      dbName,
    },
    status: {
      isInitializing,
      isPrinterProcessing,
      isDatabaseProcessing,
      criticalError,
      uiMessage,
    },
    actions: {
      setConnectionType,
      setIpAddress,
      setPort,
      setSelectedCom,
      setBaudRate,
      setSelectedUsbPrinter,
      handleRefreshPorts,
      handleRefreshUsbPrinters,
      handlePrinterAction,
      handleDatabaseSave,
      beginPrinterEdit: () => setIsPrinterEditing(true),
      cancelPrinterEdit,
      beginDatabaseEdit: () => setIsDatabaseEditing(true),
      cancelDatabaseEdit,
      setUiMessage,
      setDbHost,
      setDbUser,
      setDbPass,
      setDbName,
    },
    isPrinterValid,
    isDatabaseValid,
  };
}
