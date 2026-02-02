import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CriticalErrorState, StatusBanner } from "../components/common";
import {
  NoConfigCard,
  ConnectionDisplayCard,
  ConfigFormCard,
} from "../components/config";
import { useAuth } from "@renderer/context/AuthContext";

type ConnectionType = "IP" | "COM" | "USB";

interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

export default function ConfigView(): React.JSX.Element {
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    const init = async (): Promise<void> => {
      setIsInitializing(true);
      try {
        const serialPortsResp =
          await window.electron.ipcRenderer.invoke("get-serialPorts");

        if (serialPortsResp.status) setSerialPorts(serialPortsResp.data);

        const configResponse =
          await window.electron.ipcRenderer.invoke("get-printer-config");

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
        const errMsg = err instanceof Error ? err.message : String(err);
        setCriticalError(errMsg);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
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
      const errMsg = err instanceof Error ? err.message : String(err);
      setUiMessage({
        type: "error",
        text: t("config_view.critical_error"),
        details: t(errMsg),
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

  const isValid =
    connectionType === "IP"
      ? ipAddress.length >= 7 && port.length > 1
      : selectedCom.length > 0;

  if (criticalError) {
    return (
      <CriticalErrorState
        message={criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  if (isInitializing) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 font-sans text-slate-800">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-12 flex flex-col justify-center items-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium">
                {t("config_view.loading_system")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t("config_view.title")}
          </h2>
          <p className="text-slate-500 mt-1 sm:mt-2 text-sm sm:text-base">
            {t("config_view.subtitle")}
          </p>
        </div>

        {/* Status banner */}
        {uiMessage && (
          <div className="mb-6">
            <StatusBanner
              type={uiMessage.type}
              message={uiMessage.text}
              details={uiMessage.details}
              onClose={() => setUiMessage(null)}
            />
          </div>
        )}

        {/* Main card - conditional rendering */}
        {!hasConfig && !CanEdit ? (
          <NoConfigCard />
        ) : !isEditing && hasConfig ? (
          <ConnectionDisplayCard
            connectionType={connectionType}
            ipAddress={ipAddress}
            port={port}
            comPort={displayedCom}
            baudRate={displayedBaudRate}
            canEdit={CanEdit}
            isProcessing={isProcessing}
            onTest={() => handleAction("TEST")}
            onEdit={() => setIsEditing(true)}
          />
        ) : (
          <ConfigFormCard
            connectionType={connectionType}
            onConnectionTypeChange={setConnectionType}
            ipAddress={ipAddress}
            onIpAddressChange={setIpAddress}
            port={port}
            onPortChange={setPort}
            selectedCom={selectedCom}
            onComChange={setSelectedCom}
            baudRate={baudRate}
            onBaudRateChange={setBaudRate}
            serialPorts={serialPorts}
            onRefreshPorts={handleRefreshPorts}
            isProcessing={isProcessing}
            isValid={isValid}
            onSave={() => handleAction("SAVE")}
            onCancel={() => setIsEditing(false)}
          />
        )}
      </div>
    </div>
  );
}
