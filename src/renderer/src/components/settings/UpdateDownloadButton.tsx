import { BiDownload, BiLoaderAlt, BiPowerOff } from "react-icons/bi";
import React from "react";
import { useTranslation } from "react-i18next";

interface ButtonsProps {
  data: {
    updateStatus: string;
    errorMessage: string;
    progressPercent: number;
  };
  ReadyOnClick: () => void;
  UpdateOnClick: () => void;
}

export default function UpdateButtonsAndMessage({
  data,
  ReadyOnClick,
  UpdateOnClick,
}: ButtonsProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (data.updateStatus === "ready") {
    return (
      <button
        onClick={ReadyOnClick}
        className="w-full h-9 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 animate-pulse"
      >
        <BiPowerOff className="w-4 h-4" />
        {t("update.restart_and_update")}
      </button>
    );
  }

  if (!["available", "ready"].includes(data.updateStatus)) {
    return (
      <>
        <button
          onClick={UpdateOnClick}
          disabled={data.updateStatus === "checking"}
          className="w-full h-9 bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-400 text-xs py-2 px-3 rounded transition-colors flex justify-center items-center gap-2"
        >
          {data.updateStatus === "checking" && (
            <BiLoaderAlt className="animate-spin h-4 w-4 text-white" />
          )}
          {data.updateStatus === "checking"
            ? t("update.checking")
            : t("update.check_update")}
        </button>

        <div className="min-h-5 flex flex-col items-center justify-center">
          {data.updateStatus === "latest" && (
            <p className="text-xs text-center text-green-600 font-medium">
              {t("update.latest_version")}
            </p>
          )}
          {data.updateStatus === "error" && (
            <div className="w-full bg-red-50 border border-red-100 rounded p-2 mt-1">
              <p className="text-xs text-center text-red-600 font-bold mb-1">
                {t("update.error_occurred")}
              </p>
              <p className="text-[10px] text-red-500 text-center wrap-break-word leading-tight font-mono">
                {data.errorMessage || t("update.connection_error")}
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  if (data.updateStatus === "available") {
    return (
      <div className="relative w-full h-9 bg-slate-100 rounded-md overflow-hidden border border-slate-200 cursor-wait">
        <div
          className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${data.progressPercent}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center z-10 gap-2">
          <BiDownload className="text-white animate-bounce w-4 h-4" />
          <span className="text-xs font-medium text-white drop-shadow-md">
            {t("update.downloading")} {data.progressPercent}%
          </span>
        </div>
      </div>
    );
  }
  return null;
}
