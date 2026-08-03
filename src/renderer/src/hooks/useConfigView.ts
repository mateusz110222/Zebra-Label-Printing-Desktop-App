import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionType, UiMessage } from "../types";
import { extractError } from "../utils/errorUtils";

interface UseConfigData {
  connectionType: ConnectionType;
  ipAddress: string;
  port: string;
  selectedCom: string;
  baudRate: number;
  serialPorts: string[];
  displayedCom: string;
  displayedBaudRate: number;
  hasConfig: boolean;
  isEditing: boolean;
  dbHost: string;
  dbUser: string;
  dbPass: string;
  dbName: string;
}

interface UseConfigStatus {
  isInitializing: boolean;
  isProcessing: boolean;
  criticalError: string | null;
  uiMessage: UiMessage | null;
}

interface UseConfigActions {
  setConnectionType: (type: ConnectionType) => void;
  setIpAddress: (ip: string) => void;
  setPort: (port: string) => void;
  setSelectedCom: (com: string) => void;
  setBaudRate: (rate: number) => void;
  handleRefreshPorts: () => Promise<void>;
  handleAction: (action: "SAVE" | "TEST") => Promise<void>;
  setIsEditing: (isEditing: boolean) => void;
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
  isValid: boolean;
}

export function useConfigView(): UseConfigViewReturn {
  const { t } = useTranslation();

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

  const [dbHost, setDbHost] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const init = async (): Promise<void> => {
      setIsInitializing(true);
      try {
        const serialPortsResp = await window.api.GetSerialPorts();

        if (!isMounted) return;
        if (serialPortsResp.status)
          setSerialPorts(serialPortsResp.data as string[]);

        const configResponse = await window.api.GetPrinterConfig();

        if (!isMounted) return;
        if (configResponse.status && configResponse.data) {
          const cfg = configResponse.data;

          setConnectionType(cfg.type);
          if (cfg.ip) setIpAddress(cfg.ip);
          if (cfg.port) setPort(cfg.port.toString());

          if (cfg.comPort) {
            setDisplayedCom(cfg.comPort);
            setSelectedCom("");
          }
          if (cfg.baudRate) {
            setBaudRate(cfg.baudRate);
            setDisplayedBaudRate(cfg.baudRate);
          }

          const isIpValid = cfg.type === "IP" && cfg.ip;
          const isComValid = cfg.type === "COM" && cfg.comPort;

          if (isIpValid || isComValid) {
            setHasConfig(true);
            setIsEditing(false);
          }
        }

        const dbConfigResponse = await window.api.GetSettings("database");
        if (dbConfigResponse) {
          setDbHost(dbConfigResponse.host || "");
          setDbUser(dbConfigResponse.user || "");
          setDbPass(dbConfigResponse.password || "");
          setDbName(dbConfigResponse.database || "");
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
  }, [t]);

  const handleAction = async (action: "SAVE" | "TEST"): Promise<void> => {
    setIsProcessing(true);
    setUiMessage(null);

    if (action === "SAVE") {
      window.api.SetSettings("database", {
        host: dbHost,
        user: dbUser,
        password: dbPass,
        database: dbName,
      });
    }

    const payload = {
      type: connectionType,
      ip: connectionType === "IP" ? ipAddress : undefined,
      port: connectionType === "IP" ? parseInt(port) : undefined,
      comPort: connectionType === "COM" ? selectedCom : undefined,
      baudRate: connectionType === "COM" ? baudRate : undefined,
    };

    const channel =
      action === "SAVE" ? "save-printer-config" : "test-printer-connection";

    try {
      const resp = await window.api.SavePrinterConfig(channel, payload);

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
          const configResponse = await window.api.GetPrinterConfig();
          if (configResponse.status && configResponse.data) {
            const cfg = configResponse.data;
            setConnectionType(cfg.type || "IP");
            setIpAddress(cfg.ip || "");
            setPort((cfg.port || 9100).toString());
            setDisplayedCom(cfg.comPort || "");
            setDisplayedBaudRate(cfg.baudRate || 9600);
            setSelectedCom(cfg.comPort || "");
            setBaudRate(cfg.baudRate || 9600);
            setHasConfig(true);
          }
          setIsEditing(false);
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
      setIsProcessing(false);
    }
  };

  const handleRefreshPorts = async (): Promise<void> => {
    const serialPortsResp = await window.api.GetSerialPorts();
    if (serialPortsResp.status)
      setSerialPorts(serialPortsResp.data as string[]);
  };

  const isValidIpAddress = (ip: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    return ip.split(".").every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  };

  const isValid =
    (connectionType === "IP"
      ? isValidIpAddress(ipAddress) && port.length > 1 && parseInt(port) > 0
      : selectedCom.length > 0) &&
    dbHost.length > 0 &&
    dbUser.length > 0 &&
    dbName.length > 0;

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
      hasConfig,
      isEditing,
      dbHost,
      dbUser,
      dbPass,
      dbName,
    },
    status: {
      isInitializing,
      isProcessing,
      criticalError,
      uiMessage,
    },
    actions: {
      setConnectionType,
      setIpAddress,
      setPort,
      setSelectedCom,
      setBaudRate,
      handleRefreshPorts,
      handleAction,
      setIsEditing,
      setUiMessage,
      setDbHost,
      setDbUser,
      setDbPass,
      setDbName,
    },
    isValid,
  };
}
