import React from "react";
import { useTranslation } from "react-i18next";
import { FiDatabase } from "react-icons/fi";

interface DatabaseConfigCardProps {
  dbHost: string;
  onDbHostChange: (value: string) => void;
  dbUser: string;
  onDbUserChange: (value: string) => void;
  dbPass: string;
  onDbPassChange: (value: string) => void;
  dbName: string;
  onDbNameChange: (value: string) => void;
  isProcessing: boolean;
  isValid: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export default function DatabaseConfigCard({
                                             dbHost,
                                             onDbHostChange,
                                             dbUser,
                                             onDbUserChange,
                                             dbPass,
                                             onDbPassChange,
                                             dbName,
                                             onDbNameChange,
                                             isProcessing,
                                             isValid,
                                             onSave,
                                             onCancel
                                           }: DatabaseConfigCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-8">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6 flex items-center">
          <FiDatabase className="mr-3 text-indigo-500" />
          {t("config_view.database_title")}
        </h3>
        <div className="space-y-6">
          {/* Host field */}
          <div className="group">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {t("config_view.db_host")}
            </label>
            <input
              className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={dbHost}
              onChange={(e) => onDbHostChange(e.target.value)}
              placeholder={t("config_view.db_host_placeholder")}
            />
          </div>

          {/* User field */}
          <div className="group">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {t("config_view.db_user")}
            </label>
            <input
              className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={dbUser}
              onChange={(e) => onDbUserChange(e.target.value)}
              placeholder={t("config_view.db_user_placeholder")}
            />
          </div>

          {/* Password field */}
          <div className="group">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {t("config_view.db_password")}
            </label>
            <input
              className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              type="password"
              value={dbPass}
              onChange={(e) => onDbPassChange(e.target.value)}
              placeholder={t("config_view.db_password_placeholder")}
            />
          </div>

          {/* Database name field */}
          <div className="group">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {t("config_view.db_name")}
            </label>
            <input
              className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={dbName}
              onChange={(e) => onDbNameChange(e.target.value)}
              placeholder={t("config_view.db_name_placeholder")}
            />
          </div>
        </div>
      </div>

      {/* Form actions */}
      <div className="p-8 pt-0">
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
            className={`inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
              isValid && !isProcessing
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
