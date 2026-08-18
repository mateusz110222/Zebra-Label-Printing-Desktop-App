import React from "react";
import { useTranslation } from "react-i18next";
import { FiDatabase } from "react-icons/fi";

interface DatabaseDisplayCardProps {
  dbHost: string;
  dbUser: string;
  dbName: string;
  canEdit: boolean;
  onEdit: () => void;
}

export default function DatabaseDisplayCard({
  dbHost,
  dbUser,
  dbName,
  canEdit,
  onEdit,
}: DatabaseDisplayCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Database icon */}
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400`}
            >
              <FiDatabase className="text-5xl" />
            </div>

            {/* Database details */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                {t("config_view.database_connection")}
              </h3>
              <div>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 font-mono tracking-tight">
                  {dbHost}
                </p>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center gap-2">
                  <span className="text-sm">{t("config_view.db_user")}:</span>
                  <span className="font-mono">{dbUser}</span>
                </p>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center gap-2">
                  <span className="text-sm">{t("config_view.db_name")}:</span>
                  <span className="font-mono">{dbName}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="hidden md:block">
            <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30">
              ● {t("config_view.configured")}
            </span>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-4">
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all active:scale-95"
            >
              {t("config_view.change_config")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
