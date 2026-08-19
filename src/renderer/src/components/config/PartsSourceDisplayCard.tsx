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
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-inner dark:bg-indigo-900/30 dark:text-indigo-400">
              {isServer ? (
                <FiServer className="text-5xl" />
              ) : (
                <FiHardDrive className="text-5xl" />
              )}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("parts_config.title")}
              </h3>
              <p className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                {t(`parts_config.source_${source}_title`)}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                {t("parts_config.operation")}: {operation || "—"}
              </p>
            </div>
          </div>
          <span className="hidden rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-500/30 md:inline-flex">
            ● {t("config_view.configured")}
          </span>
        </div>

        {canEdit && (
          <div className="mt-8 flex justify-end border-t border-slate-100 pt-6 dark:border-slate-700">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95"
            >
              {t("config_view.change_config")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
