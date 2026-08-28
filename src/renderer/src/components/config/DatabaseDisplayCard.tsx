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
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6 min-h-[112px]">
          <div className="flex items-start gap-6">
            {/* Database icon */}
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400`}
            >
              <FiDatabase className="text-5xl" />
            </div>

            {/* Database details */}
            <div className="pt-0.5">
              <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                {t("config_view.database_connection")}
              </h3>
              <div>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100 font-mono">
                  {dbHost}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1 flex items-center gap-2">
                  <span>{t("config_view.db_user")}:</span>
                  <span className="font-mono">{dbUser}</span>
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1 flex items-center gap-2">
                  <span>{t("config_view.db_name")}:</span>
                  <span className="font-mono">{dbName}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="hidden md:flex items-center self-center shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
              {t("config_view.configured")}
            </span>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-4">
            <button
              type="button"
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
