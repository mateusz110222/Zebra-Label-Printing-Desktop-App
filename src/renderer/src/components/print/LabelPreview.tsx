import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiPrinter, FiChevronDown, FiChevronUp } from "react-icons/fi";

interface LabelPreviewProps {
  isLoading: boolean;
  previewImage: string | null;
}

export default function LabelPreview({
  isLoading,
  previewImage,
}: LabelPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
      {/* Header - clickable to toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between hover:bg-slate-150 dark:hover:bg-slate-700 transition-colors"
      >
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t("print_view.preview_title")}
        </h3>
        <div className="flex items-center gap-2">
          {previewImage && !isExpanded && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("print_view.preview_available", "Podgląd dostępny")}
            </span>
          )}
          {isExpanded ? (
            <FiChevronUp className="text-slate-500 dark:text-slate-400" />
          ) : (
            <FiChevronDown className="text-slate-500 dark:text-slate-400" />
          )}
        </div>
      </button>

      {/* Content - collapsible */}
      {isExpanded && (
        <div className="p-3 flex items-center justify-center min-h-30 max-h-45">
          {isLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-3 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {t("print_view.preview_loading")}
              </p>
            </div>
          ) : previewImage ? (
            <img
              src={previewImage}
              alt={t("print_view.preview_alt")}
              className="max-w-full max-h-37.5 h-auto shadow-md rounded border border-slate-200 dark:border-slate-600"
            />
          ) : (
            <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
              <FiPrinter className="text-xl" />
              <p className="text-sm">{t("print_view.preview_hint")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
