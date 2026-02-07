import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { UiMessage, ConnectionType } from "../types";

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

    const [isProcessing, setIsProcessing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [hasConfig, setHasConfig] = useState(false);

    const extractError = (err: unknown): { message: string; details?: string } => {
        const message = err instanceof Error ? err.message : String(err);
        const details =
            typeof err === "object" && err !== null && "rawError" in err
                ? (err as { rawError: string }).rawError
                : undefined;
        return { message, details };
    };

    useEffect(() => {
        let isMounted = true;

        const init = async (): Promise<void> => {
            setIsInitializing(true);
            try {
                const serialPortsResp =
                    await window.electron.ipcRenderer.invoke("get-serialPorts");

                if (!isMounted) return;
                if (serialPortsResp.status) setSerialPorts(serialPortsResp.data);

                const configResponse =
                    await window.electron.ipcRenderer.invoke("get-printer-config");

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
            } catch (err) {
                if (!isMounted) return;
                const { message } = extractError(err);
                setCriticalError(message);
            } finally {
                if (isMounted) setIsInitializing(false);
            }
        };
        init();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleAction = async (action: "SAVE" | "TEST"): Promise<void> => {
        setIsProcessing(true);
        setUiMessage(null);

        const payload = {
            type: connectionType,
            ip: connectionType === "IP" ? ipAddress : null,
            port: connectionType === "IP" ? parseInt(port) : null,
            comPort: connectionType === "COM" ? selectedCom : null,
            baudRate: connectionType === "COM" ? baudRate : null,
        };

        const channel =
            action === "SAVE" ? "save-printer-config" : "test-printer-connection";

        try {
            const resp = await window.electron.ipcRenderer.invoke(channel, payload);

            if (resp.status) {
                setUiMessage({
                    type: "success",
                    text:
                        action === "SAVE"
                            ? t("config_view.save_success")
                            : t("config_view.test_success"),
                    details:
                        resp.message !== "backend.printer.label_sent_successfully"
                            ? t(resp.message)
                            : undefined,
                });

                if (action === "SAVE") {
                    const configResponse =
                        await window.electron.ipcRenderer.invoke("get-printer-config");
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
                    details: t(resp.message),
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
        const serialPortsResp =
            await window.electron.ipcRenderer.invoke("get-serialPorts");
        if (serialPortsResp.status) setSerialPorts(serialPortsResp.data);
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
        connectionType === "IP"
            ? isValidIpAddress(ipAddress) && port.length > 1 && parseInt(port) > 0
            : selectedCom.length > 0;

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
        },
        isValid,
    };
}
