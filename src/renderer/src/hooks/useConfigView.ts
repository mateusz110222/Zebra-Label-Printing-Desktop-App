import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionType, LocalPart, PrinterConfig, PrinterMode, UiMessage, UsbPrinterInfo } from "../types";
import { extractError } from "../utils/errorUtils";
import { useAuth } from "../context/AuthContext";

type PartsSource = "server" | "local";

interface UseConfigData {
  printerName: string;
  printers: PrinterConfig[];
  printerMode: PrinterMode;
  formatAssignments: Record<string, string>;
  availableLabelFormats: string[];
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
  hasPartsConfig: boolean;

  isPrinterEditing: boolean;
  isDatabaseEditing: boolean;
  isPartsEditing: boolean;

  dbHost: string;
  dbUser: string;
  dbPass: string;
  dbName: string;

  partsSource: PartsSource;
  partsOperation: string;
  partsServer: string;
  partsConfigPath: string;
  localParts: LocalPart[];
}

interface UseConfigStatus {
  isInitializing: boolean;
  isPrinterProcessing: boolean;
  isDatabaseProcessing: boolean;
  isPartsProcessing: boolean;
  isRoutingProcessing: boolean;
  criticalError: string | null;
  uiMessage: UiMessage | null;
}

interface UseConfigActions {
  setPrinterName: (name: string) => void;
  setConnectionType: (type: ConnectionType) => void;
  setIpAddress: (ip: string) => void;
  setPort: (port: string) => void;
  setSelectedCom: (com: string) => void;
  setBaudRate: (rate: number) => void;
  setSelectedUsbPrinter: (name: string) => void;

  handleRefreshPorts: () => Promise<void>;
  handleRefreshUsbPrinters: () => Promise<void>;

  handlePrinterAction: (action: "SAVE" | "TEST") => Promise<void>;
  handlePrinterModeChange: (mode: PrinterMode) => Promise<void>;
  handleFormatAssignmentsSave: (
    assignments: Record<string, string>,
  ) => Promise<void>;
  refreshLabelFormats: () => Promise<void>;
  handleDatabaseSave: () => Promise<void>;

  handlePartsSave: (
    source: PartsSource,
    operation: string,
    server: string,
    configPath: string,
    parts: LocalPart[],
  ) => Promise<void>;

  beginPrinterEdit: () => void;
  beginAddPrinter: () => void;
  selectPrinter: (name: string) => Promise<void>;
  deletePrinter: (name: string) => Promise<void>;
  cancelPrinterEdit: () => void;

  beginDatabaseEdit: () => void;
  cancelDatabaseEdit: () => void;

  beginPartsEdit: () => void;
  cancelPartsEdit: () => void;

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
  printerName: string;
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

interface PartsDraft {
  source: PartsSource;
  operation: string;
  server: string;
  configPath: string;
  localParts: LocalPart[];
}

const DEFAULT_PRINTER_DRAFT: PrinterDraft = {
  printerName: "",
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

const DEFAULT_PARTS_DRAFT: PartsDraft = {
  source: "server",
  operation: "",
  server: "",
  configPath: "",
  localParts: [],
};

const getPrinterDisplayName = (printer: PrinterConfig): string =>
  printer.name?.trim() ||
  (printer.type === "IP"
    ? `${printer.ip || ""}:${printer.port ?? 9100}`
    : printer.type === "COM"
      ? printer.comPort || ""
      : printer.usbPrinterName || "");

export function useConfigView(): UseConfigViewReturn {
  const { t } = useTranslation();
  const { CanEdit } = useAuth();

  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Printer
  const [printerName, setPrinterName] = useState("");
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [printerMode, setPrinterMode] = useState<PrinterMode>("single");
  const [formatAssignments, setFormatAssignments] = useState<
    Record<string, string>
  >({});
  const [availableLabelFormats, setAvailableLabelFormats] = useState<string[]>(
    [],
  );
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

  // Database
  const [dbHost, setDbHost] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("");

  // Parts
  const [partsSource, setPartsSource] = useState<PartsSource>("server");
  const [partsOperation, setPartsOperation] = useState("");
  const [partsServer, setPartsServer] = useState("");
  const [partsConfigPath, setPartsConfigPath] = useState("");
  const [localParts, setLocalParts] = useState<LocalPart[]>([]);

  // Processing
  const [isPrinterProcessing, setIsPrinterProcessing] = useState(false);
  const [isDatabaseProcessing, setIsDatabaseProcessing] = useState(false);
  const [isPartsProcessing, setIsPartsProcessing] = useState(false);
  const [isRoutingProcessing, setIsRoutingProcessing] = useState(false);

  // Editing
  const [isPrinterEditing, setIsPrinterEditing] = useState(false);
  const [isDatabaseEditing, setIsDatabaseEditing] = useState(false);
  const [isPartsEditing, setIsPartsEditing] = useState(false);

  // Has config
  const [hasConfig, setHasConfig] = useState(false);
  const [hasDatabaseConfig, setHasDatabaseConfig] = useState(false);
  const [hasPartsConfig, setHasPartsConfig] = useState(false);

  const savedPrinterDraft = useRef<PrinterDraft>(DEFAULT_PRINTER_DRAFT);
  const savedDatabaseDraft = useRef<DatabaseDraft>(DEFAULT_DATABASE_DRAFT);
  const savedPartsDraft = useRef<PartsDraft>(DEFAULT_PARTS_DRAFT);

  const applyPrinterDraft = (draft: PrinterDraft): void => {
    setPrinterName(draft.printerName);
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

  const applyPartsDraft = (draft: PartsDraft): void => {
    setPartsSource(draft.source);
    setPartsOperation(draft.operation);
    setPartsServer(draft.server);
    setPartsConfigPath(draft.configPath);
    setLocalParts(draft.localParts);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async (): Promise<void> => {
      setIsInitializing(true);

      try {
        const [
          serialPortsResp,
          usbPrintersResp,
          configResponse,
          dbConfigResponse,
          partsConfigResponse,
          routingResponse,
          partsResponse,
        ] = await Promise.all([
          window.api.GetSerialPorts(),
          window.api.GetUsbPrinters(),
          window.api.GetPrinterConfig(),
          window.api.GetDatabaseConfig(),
          window.api.GetPartsConfig(),
          window.api.GetPrinterRoutingConfig(),
          window.api.GetParts(),
        ]);

        if (!isMounted) return;

        if (serialPortsResp.status && serialPortsResp.data) {
          setSerialPorts(serialPortsResp.data);
        }

        if (usbPrintersResp.status && usbPrintersResp.data) {
          setUsbPrinters(usbPrintersResp.data);
        }

        if (routingResponse.status && routingResponse.data) {
          setPrinterMode(routingResponse.data.mode);
          setFormatAssignments(routingResponse.data.formatAssignments);
        }

        if (partsResponse.status && Array.isArray(partsResponse.data)) {
          setAvailableLabelFormats(
            Array.from(
              new Set(
                partsResponse.data
                  .map((part) => part.Label_Format?.trim())
                  .filter((format): format is string => Boolean(format)),
              ),
            ).sort((first, second) => first.localeCompare(second)),
          );
        }

        if (configResponse.status && configResponse.data) {
          const cfg = configResponse.data;

          const configuredPrintersRaw = Array.isArray(cfg.printers)
            ? cfg.printers
            : [cfg];
          const configuredPrinters = configuredPrintersRaw.map((printer) => ({
            ...printer,
            name: getPrinterDisplayName(printer),
          }));
          setPrinters(configuredPrinters);

          const isIpValid = cfg.type === "IP" && cfg.ip;
          const isComValid = cfg.type === "COM" && cfg.comPort;
          const isUsbValid = cfg.type === "USB" && cfg.usbPrinterName;
          const hasConfiguredTarget = Boolean(
            isIpValid || isComValid || isUsbValid,
          );

          const printerDraft: PrinterDraft = {
            printerName: hasConfiguredTarget
              ? cfg.name || getPrinterDisplayName(cfg)
              : "",
            connectionType: cfg.type,
            ipAddress: cfg.type === "IP" ? cfg.ip : "",
            port: cfg.type === "IP" ? (cfg.port ?? 9100).toString() : "9100",
            selectedCom: cfg.type === "COM" ? cfg.comPort : "",
            baudRate: cfg.type === "COM" ? (cfg.baudRate ?? 9600) : 9600,
            selectedUsbPrinter: cfg.type === "USB" ? cfg.usbPrinterName : "",
          };

          savedPrinterDraft.current = printerDraft;
          applyPrinterDraft(printerDraft);

          if (hasConfiguredTarget) {
            setHasConfig(true);
            setIsPrinterEditing(false);
          }
        }

        // Database config
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

        // Parts config
        if (partsConfigResponse.status && partsConfigResponse.data) {
          const config = partsConfigResponse.data;

          const partsDraft: PartsDraft = {
            source: config.source,
            operation: config.operation,
            server: config.server,
            configPath: config.configPath,
            localParts: config.localParts,
          };

          savedPartsDraft.current = partsDraft;
          applyPartsDraft(partsDraft);

          setHasPartsConfig(
            config.server.trim().length > 0 ||
              config.configPath.trim().length > 0 ||
              config.source === "local" ||
              config.localParts.length > 0,
          );

          setIsPartsEditing(false);
        } else if (!partsConfigResponse.status) {
          setUiMessage({
            type: "error",
            text: t("parts_config.load_error"),
            details: partsConfigResponse.message
              ? t(partsConfigResponse.message)
              : undefined,
          });
        }
      } catch (err) {
        if (!isMounted) return;

        const { message } = extractError(err);
        setCriticalError(t(message));
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    void init();

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
              name: printerName.trim(),
              type: "IP",
              ip: ipAddress,
              port: parseInt(port, 10),
            }
          : connectionType === "COM"
            ? {
                name: printerName.trim(),
                type: "COM",
                comPort: selectedCom,
                baudRate,
              }
            : {
                name: printerName.trim(),
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
            printerName: printerName.trim(),
            connectionType,
            ipAddress,
            port,
            selectedCom,
            baudRate,
            selectedUsbPrinter,
          };

          savedPrinterDraft.current = savedDraft;
          applyPrinterDraft(savedDraft);

          const savedConfig = payload as PrinterConfig;
          setPrinters((current) => {
            const key = (savedConfig.name || "").toLocaleUpperCase();
            const index = current.findIndex(
              (printer) => (printer.name || "").toLocaleUpperCase() === key,
            );
            return index === -1
              ? [...current, savedConfig]
              : current.map((printer, printerIndex) =>
                  printerIndex === index ? savedConfig : printer,
                );
          });

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

  const savePrinterRouting = async (
    mode: PrinterMode,
    assignments: Record<string, string>,
  ): Promise<boolean> => {
    setIsRoutingProcessing(true);
    setUiMessage(null);
    try {
      const response = await window.api.SavePrinterRoutingConfig({
        mode,
        formatAssignments: assignments,
      });
      if (!response.status) {
        setUiMessage({
          type: "error",
          text: t(response.message || "backend.config.save_fail"),
          details: response.rawError,
        });
        return false;
      }
      return true;
    } catch (error) {
      const { message } = extractError(error);
      setUiMessage({ type: "error", text: t(message) });
      return false;
    } finally {
      setIsRoutingProcessing(false);
    }
  };

  const handlePrinterModeChange = async (mode: PrinterMode): Promise<void> => {
    if (mode === printerMode) return;
    if (await savePrinterRouting(mode, formatAssignments)) {
      setPrinterMode(mode);
      setUiMessage({
        type: "success",
        text: t("backend.config.printer_routing_saved"),
      });
    }
  };

  const handleFormatAssignmentsSave = async (
    assignments: Record<string, string>,
  ): Promise<void> => {
    if (await savePrinterRouting("multiple", assignments)) {
      setPrinterMode("multiple");
      setFormatAssignments(assignments);
      setUiMessage({
        type: "success",
        text: t("backend.config.printer_routing_saved"),
      });
    }
  };

  const refreshLabelFormats = async (): Promise<void> => {
    const response = await window.api.GetParts();
    if (!response.status || !Array.isArray(response.data)) {
      setUiMessage({
        type: "error",
        text: t("parts_config.formats_load_error"),
        details: response.message ? t(response.message) : undefined,
      });
      return;
    }

    setAvailableLabelFormats(
      Array.from(
        new Set(
          response.data
            .map((part) => part.Label_Format?.trim())
            .filter((format): format is string => Boolean(format)),
        ),
      ).sort((first, second) => first.localeCompare(second)),
    );
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

      savedDatabaseDraft.current = {
        dbHost,
        dbUser,
        dbPass,
        dbName,
      };

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

  const handlePartsSave = async (
    source: PartsSource,
    operation: string,
    server: string,
    configPath: string,
    parts: LocalPart[],
  ): Promise<void> => {
    if (!CanEdit) return;

    setIsPartsProcessing(true);
    setUiMessage(null);

    try {
      const response = await window.api.SavePartsConfig({
        source,
        operation: operation.trim(),
        server: server.trim(),
        configPath: configPath.trim(),
        localParts: parts,
      });

      if (!response.status) {
        setUiMessage({
          type: "error",
          text: t("parts_config.save_error"),
          details: response.message ? t(response.message) : undefined,
        });

        return;
      }

      const savedDraft: PartsDraft = {
        source,
        operation: operation.trim(),
        server: server.trim(),
        configPath: configPath.trim(),
        localParts: parts.map((part) => ({ ...part })),
      };

      savedPartsDraft.current = savedDraft;
      applyPartsDraft(savedDraft);

      setHasPartsConfig(
        savedDraft.server.length > 0 ||
          savedDraft.configPath.length > 0 ||
          savedDraft.source === "local" ||
          savedDraft.localParts.length > 0,
      );

      setIsPartsEditing(false);

      setUiMessage({
        type: "success",
        text: t("parts_config.save_success"),
      });
    } catch (err) {
      const { message } = extractError(err);

      setUiMessage({
        type: "error",
        text: t("parts_config.save_error"),
        details: t(message),
      });
    } finally {
      setIsPartsProcessing(false);
    }
  };

  const cancelPrinterEdit = (): void => {
    applyPrinterDraft(savedPrinterDraft.current);
    setIsPrinterEditing(false);
  };

  const beginAddPrinter = (): void => {
    applyPrinterDraft({
      ...DEFAULT_PRINTER_DRAFT,
      printerName: "",
    });
    setIsPrinterEditing(true);
  };

  const selectPrinter = async (name: string): Promise<void> => {
    const selected = printers.find((printer) => printer.name === name);
    if (!selected) return;

    const response = await window.api.SetActivePrinter(name);
    if (!response.status) {
      setUiMessage({
        type: "error",
        text: t(response.message || "backend.config.printer_not_found"),
        details: response.rawError,
      });
      return;
    }

    const draft: PrinterDraft = {
      printerName: selected.name || "",
      connectionType: selected.type,
      ipAddress: selected.type === "IP" ? selected.ip || "" : "",
      port: selected.type === "IP" ? String(selected.port ?? 9100) : "9100",
      selectedCom: selected.type === "COM" ? selected.comPort || "" : "",
      baudRate: selected.type === "COM" ? (selected.baudRate ?? 9600) : 9600,
      selectedUsbPrinter:
        selected.type === "USB" ? selected.usbPrinterName || "" : "",
    };

    savedPrinterDraft.current = draft;
    applyPrinterDraft(draft);
    setIsPrinterEditing(false);
  };

  const deletePrinter = async (name: string): Promise<void> => {
    const response = await window.api.DeletePrinterConfig(name);
    if (!response.status) {
      setUiMessage({
        type: "error",
        text: t(response.message || "backend.config.printer_not_found"),
      });
      return;
    }

    const remaining = printers.filter((printer) => printer.name !== name);
    setPrinters(remaining);
    setFormatAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, printer]) =>
            printer.toLocaleUpperCase() !== name.toLocaleUpperCase(),
        ),
      ),
    );
    if (printerName === name) {
      if (remaining[0]?.name) await selectPrinter(remaining[0].name);
      else {
        applyPrinterDraft(DEFAULT_PRINTER_DRAFT);
        setHasConfig(false);
      }
    }
    setUiMessage({
      type: "success",
      text: t("backend.config.printer_deleted"),
    });
  };

  const cancelDatabaseEdit = (): void => {
    applyDatabaseDraft(savedDatabaseDraft.current);
    setIsDatabaseEditing(false);
  };

  const cancelPartsEdit = (): void => {
    applyPartsDraft(savedPartsDraft.current);
    setIsPartsEditing(false);
  };

  const handleRefreshPorts = async (): Promise<void> => {
    const serialPortsResp = await window.api.GetSerialPorts();

    if (serialPortsResp.status && serialPortsResp.data) {
      setSerialPorts(serialPortsResp.data);
    }
  };

  const handleRefreshUsbPrinters = async (): Promise<void> => {
    const usbPrintersResp = await window.api.GetUsbPrinters();

    if (usbPrintersResp.status && usbPrintersResp.data) {
      setUsbPrinters(usbPrintersResp.data);
    }
  };

  const isValidIpAddress = (ip: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

    if (!ipRegex.test(ip)) {
      return false;
    }

    return ip.split(".").every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  };

  const parsedPort = Number(port);

  const isPrinterValid =
    printerName.trim().length > 0 &&
    (connectionType === "IP"
      ? isValidIpAddress(ipAddress) &&
        Number.isInteger(parsedPort) &&
        parsedPort >= 1 &&
        parsedPort <= 65535
      : connectionType === "COM"
        ? selectedCom.length > 0
        : selectedUsbPrinter.trim().length > 0);

  const isDatabaseValid =
    dbHost.trim().length > 0 &&
    dbUser.trim().length > 0 &&
    dbName.trim().length > 0;

  return {
    data: {
      printerName,
      printers,
      printerMode,
      formatAssignments,
      availableLabelFormats,
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
      hasPartsConfig,

      isPrinterEditing,
      isDatabaseEditing,
      isPartsEditing,

      dbHost,
      dbUser,
      dbPass,
      dbName,

      partsSource,
      partsOperation,
      partsServer,
      partsConfigPath,
      localParts,
    },

    status: {
      isInitializing,
      isPrinterProcessing,
      isDatabaseProcessing,
      isPartsProcessing,
      isRoutingProcessing,
      criticalError,
      uiMessage,
    },

    actions: {
      setPrinterName,
      setConnectionType,
      setIpAddress,
      setPort,
      setSelectedCom,
      setBaudRate,
      setSelectedUsbPrinter,

      handleRefreshPorts,
      handleRefreshUsbPrinters,

      handlePrinterAction,
      handlePrinterModeChange,
      handleFormatAssignmentsSave,
      refreshLabelFormats,
      handleDatabaseSave,
      handlePartsSave,

      beginPrinterEdit: () => setIsPrinterEditing(true),
      beginAddPrinter,
      selectPrinter,
      deletePrinter,
      cancelPrinterEdit,

      beginDatabaseEdit: () => setIsDatabaseEditing(true),
      cancelDatabaseEdit,

      beginPartsEdit: () => setIsPartsEditing(true),
      cancelPartsEdit,

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
