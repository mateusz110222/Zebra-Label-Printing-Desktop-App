import React, { useEffect, useState } from "react";
import { CriticalErrorState, StatusBanner } from "@renderer/components/common";
import { useTranslation } from "react-i18next";

interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

export default function LabelsFormats(): React.JSX.Element {
  const [criticalError, setcriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const GetLabelsFormats = async (): Promise<void> => {
      try {
        const response =
          await window.electron.ipcRenderer.invoke("GetLabelsFormats");

        if (!response.status) {
          setcriticalError(response.message || String(response));
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        setcriticalError(errMsg);
      }
    };
    GetLabelsFormats();
  }, []);

  if (criticalError) {
    return (
      <CriticalErrorState
        message={criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  return (
    <div className="p-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {t("config_view.title", "Konfiguracja Drukarki")}
            </h2>
            <p className="text-slate-500 mt-2">
              {t(
                "config_view.subtitle",
                "Zarządzaj połączeniem z drukarką Zebra.",
              )}
            </p>
          </div>
        </div>

        {/* Dynamiczny Baner */}
        {uiMessage && (
          <StatusBanner
            type={uiMessage.type}
            message={uiMessage.text}
            details={uiMessage.details}
            onClose={() => setUiMessage(null)}
          />
        )}
      </div>
    </div>
  );
}
