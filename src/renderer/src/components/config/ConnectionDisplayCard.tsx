import React from "react";
import { useTranslation } from "react-i18next";
import { FiWifi, FiPlay } from "react-icons/fi";
import { LuPlug2 } from "react-icons/lu";

interface ConnectionDisplayCardProps {
  connectionType: "IP" | "COM" | "USB";
  ipAddress: string;
  port: string;
  comPort: string;
  baudRate: number;
  canEdit: boolean;
  isProcessing: boolean;
  onTest: () => void;
  onEdit: () => void;
}

export default function ConnectionDisplayCard({
  connectionType,
  ipAddress,
  port,
  comPort,
  baudRate,
  canEdit,
  isProcessing,
  onTest,
  onEdit,
}: ConnectionDisplayCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
      <div className="p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Connection icon */}
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner ${
                connectionType === "IP"
                  ? "bg-indigo-50 text-indigo-600"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              {connectionType === "IP" ? (
                <FiWifi className="text-5xl" />
              ) : (
                <LuPlug2 className="text-5xl" />
              )}
            </div>

            {/* Connection details */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {t("config_view.active_connection")}
              </h3>
              {connectionType === "IP" ? (
                <div>
                  <p className="text-3xl font-bold text-slate-800 font-mono tracking-tight">
                    {ipAddress}
                  </p>
                  <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
                    <span className="text-sm">{t("config_view.port")}:</span>
                    <span className="font-mono">{port}</span>
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-slate-800 font-mono tracking-tight">
                    {comPort}
                  </p>
                  <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
                    <span className="text-sm">
                      {t("config_view.baud_rate")}:
                    </span>
                    <span className="font-mono">{baudRate}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className="hidden md:block">
            <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              ● {t("config_view.configured")}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-end gap-4">
          <button
            onClick={onTest}
            disabled={isProcessing}
            className="group flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 transition-all duration-200"
          >
            {isProcessing ? (
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <FiPlay className="text-lg group-hover:scale-110 transition-transform" />
            )}
            <span>{t("config_view.test_connection")}</span>
          </button>

          {canEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all active:scale-95"
            >
              {t("config_view.change_config")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
