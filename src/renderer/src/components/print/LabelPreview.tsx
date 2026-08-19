import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiEye, FiPrinter } from "react-icons/fi";

interface LabelPreviewProps {
  isLoading: boolean;
  previewImage: string | null;
}

export default function LabelPreview({
  isLoading,
  previewImage,
}: LabelPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-3 transition-colors duration-200 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            <FiEye className="text-lg" />
          </div>

          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {t("print_view.preview_title")}
            </h3>

            {previewImage && (
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                {isExpanded
                  ? t("print_view.preview_hide_hint")
                  : t("print_view.preview_click_hint")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {previewImage && !isExpanded && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("print_view.preview_available")}
            </span>
          )}

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600">
            <FiChevronDown
              className={`text-lg transition-transform duration-300 ease-in-out ${isExpanded ? "rotate-180" : "rotate-0"}`}
            />
          </div>
        </div>
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div
            className={`flex min-h-30 max-h-45 items-center justify-center p-3 transition-all duration-300 ease-in-out ${isExpanded ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.98] opacity-0"}`}
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-indigo-200 border-t-indigo-600 dark:border-indigo-800 dark:border-t-indigo-400" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t("print_view.preview_loading")}
                </p>
              </div>
            ) : previewImage ? (
              <img
                src={previewImage}
                alt={t("print_view.preview_alt")}
                className="h-auto max-h-37.5 max-w-full rounded border border-slate-200 shadow-md dark:border-slate-600"
              />
            ) : (
              <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
                <FiPrinter className="text-xl" />
                <p className="text-sm">{t("print_view.preview_hint")}</p>
              </div>
            )}
          </div>
          <p className="my-2 text-center text-xs text-slate-500 dark:text-slate-400">
            {t("print_view.preview_example_notice")}
          </p>
        </div>
      </div>
    </div>
  );
}
