import React from "react";
import { CriticalErrorState, StatusBanner, LoadingWrapper } from "@renderer/components/common";
import { useTranslation } from "react-i18next";
import { MdOutlinePrint } from "react-icons/md";
import { BsFileEarmarkX } from "react-icons/bs";
import { useLabelsFormats } from "@renderer/hooks";
import { LabelCard } from "@renderer/components/Labels/LabelCard";

export function LabelsFormatsView(): React.JSX.Element {
  const { t } = useTranslation();

  const { data, actions } = useLabelsFormats();

  if (data.criticalError) {
    return (
      <CriticalErrorState
        message={data.criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  return (
    <LoadingWrapper isLoading={data.isLoading}>
      <div className="min-h-full bg-slate-50/50 dark:bg-transparent p-8 font-sans text-slate-800 dark:text-slate-100">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header Sekcji */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                  {/* Ikona drukarki */}
                  <MdOutlinePrint size={28} />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {t("label_formats.title")}
                </h2>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl">
                {t("label_formats.subtitle")}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
              {t("label_formats.found")}:{" "}
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                {data.labelsFormats.length}
              </span>
            </div>
          </div>

          {/* Dynamiczny Baner */}
          {data.uiMessage && (
            <StatusBanner
              type={data.uiMessage.type}
              message={data.uiMessage.text}
              details={data.uiMessage.details}
              onClose={() => actions.setUiMessage(null)}
            />
          )}

          {/* Grid z Kartami */}
          {data.labelsFormats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {data.labelsFormats.map((format) => (
                <LabelCard
                  key={format.name}
                  format={format}
                  isExpanded={data.expandedCard === format.name}
                  onClick={() => actions.handleCardClick(format.name)}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600">
              {/* Ikona pustego stanu */}
              <BsFileEarmarkX className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                {t("label_formats.no_templates")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {t("label_formats.no_templates_message")}
              </p>
            </div>
          )}
        </div>
      </div>
    </LoadingWrapper>
  );
}
