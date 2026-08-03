import React from "react";
import { useTranslation } from "react-i18next";
import { FiDatabase } from "react-icons/fi";

interface DatabaseConfigFormProps {
  host: string;
  onHostChange: (value: string) => void;
  user: string;
  onUserChange: (value: string) => void;
  pass: string;
  onPassChange: (value: string) => void;
  dbName: string;
  onDbNameChange: (value: string) => void;
}

export default function DatabaseConfigForm({
  host,
  onHostChange,
  user,
  onUserChange,
  pass,
  onPassChange,
  dbName,
  onDbNameChange,
}: DatabaseConfigFormProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden mt-6">
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
              value={host}
              onChange={(e) => onHostChange(e.target.value)}
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
              value={user}
              onChange={(e) => onUserChange(e.target.value)}
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
              value={pass}
              onChange={(e) => onPassChange(e.target.value)}
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
    </div>
  );
}
