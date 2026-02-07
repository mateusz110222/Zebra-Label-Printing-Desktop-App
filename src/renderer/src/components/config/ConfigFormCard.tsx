import React from "react";
import { useTranslation } from "react-i18next";
import { FiWifi } from "react-icons/fi";
import { LuPlug2 } from "react-icons/lu";
import ConnectionTabs from "./ConnectionTabs";

type ConnectionType = "IP" | "COM" | "USB";

interface ConfigFormCardProps {
  connectionType: ConnectionType;
  onConnectionTypeChange: (type: ConnectionType) => void;
  ipAddress: string;
  onIpAddressChange: (value: string) => void;
  port: string;
  onPortChange: (value: string) => void;
  selectedCom: string;
  onComChange: (value: string) => void;
  baudRate: number;
  onBaudRateChange: (value: number) => void;
  serialPorts: string[];
  onRefreshPorts: () => void;
  isProcessing: boolean;
  isValid: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export default function ConfigFormCard({
  connectionType,
  onConnectionTypeChange,
  ipAddress,
  onIpAddressChange,
  port,
  onPortChange,
  selectedCom,
  onComChange,
  baudRate,
  onBaudRateChange,
  serialPorts,
  onRefreshPorts,
  isProcessing,
  isValid,
  onSave,
  onCancel,
}: ConfigFormCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      {/* Tab navigation */}
      <ConnectionTabs
        activeTab={connectionType}
        onTabChange={onConnectionTypeChange}
      />

      {/* Form content */}
      <div className="p-8">
        <div className="space-y-6">
          {connectionType === "IP" && (
            <>
              {/* IP Address field */}
              <div className="group">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t("config_view.ip_address")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <FiWifi className="text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                  </div>
                  <input
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    value={ipAddress}
                    onChange={(e) => onIpAddressChange(e.target.value)}
                    placeholder={t("config_view.ip_placeholder")}
                  />
                </div>
              </div>

              {/* Port field */}
              <div className="group">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t("config_view.port")}
                </label>
                <input
                  className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  type="number"
                  value={port}
                  onChange={(e) => onPortChange(e.target.value)}
                  placeholder={t("config_view.port_placeholder")}
                />
              </div>
            </>
          )}

          {connectionType === "COM" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* COM Port select */}
              <div className="group">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t("config_view.port_com")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LuPlug2 className="text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                  </div>
                  <select
                    className="w-full pl-11 pr-10 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                    value={selectedCom || ""}
                    onClick={onRefreshPorts}
                    onChange={(e) => onComChange(e.target.value)}
                  >
                    <option value="" disabled>
                      {t("config_view.select_from_list")}
                    </option>
                    {serialPorts.length === 0 && (
                      <option disabled>{t("config_view.no_ports")}</option>
                    )}
                    {serialPorts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <svg
                      className="w-4 h-4 text-slate-400 dark:text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Baud rate select */}
              <div className="group">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t("config_view.baud_rate")}
                </label>
                <div className="relative">
                  <select
                    className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                    value={baudRate}
                    onChange={(e) => onBaudRateChange(Number(e.target.value))}
                  >
                    {BAUD_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <svg
                      className="w-4 h-4 text-slate-400 dark:text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form actions */}
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={onCancel}
            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {t("config_view.cancel")}
          </button>

          <button
            onClick={onSave}
            disabled={!isValid || isProcessing}
            className={`inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${isValid && !isProcessing
                ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                : "bg-slate-300 dark:bg-slate-600 cursor-not-allowed"
              }`}
          >
            {isProcessing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
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
                {t("config_view.saving")}
              </>
            ) : (
              t("config_view.save")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
