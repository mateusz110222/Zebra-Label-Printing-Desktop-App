import React from "react";
import { useTranslation } from "react-i18next";
import { FiHardDrive, FiServer } from "react-icons/fi";

interface PartsSourceDisplayCardProps {
  source: "server" | "local";
  operation: string;
  canEdit: boolean;
  onEdit: () => void;
}

export default function PartsSourceDisplayCard({
  source,
  operation,
  canEdit,
  onEdit,
}: PartsSourceDisplayCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const isServer = source === "server";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6 min-h-[112px]">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              {isServer ? (
                <FiServer className="text-5xl" />
              ) : (
                <FiHardDrive className="text-5xl" />
              )}
            </div>
            <div className="pt-0.5">
              <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                {t("parts_config.title")}
              </h3>
              <div>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                  {t(`parts_config.source_${source}_title`)}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1 flex items-center gap-2">
                  <span>{t("parts_config.operation")}:</span>
                  <span className="font-mono">{operation || "—"}</span>
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
