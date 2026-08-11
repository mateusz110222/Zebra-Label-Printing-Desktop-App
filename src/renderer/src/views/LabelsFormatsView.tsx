import React, { useState } from "react";
import { CriticalErrorState, LoadingWrapper, StatusBanner } from "@renderer/components/common";
import { useTranslation } from "react-i18next";
import { MdOutlinePrint } from "react-icons/md";
import { BsExclamationTriangle, BsFileEarmarkX, BsPlusLg } from "react-icons/bs";
import { useLabelsFormats } from "@renderer/hooks";
import { LabelCard } from "@renderer/components/Labels/LabelCard";

export function LabelsFormatsView(): React.JSX.Element {
  const { t } = useTranslation();

  const { data, actions } = useLabelsFormats();
  const [formatToDelete, setFormatToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async (): Promise<void> => {
    if (!formatToDelete) return;

    setIsDeleting(true);
    await actions.handleDelete(formatToDelete);
    setIsDeleting(false);
    setFormatToDelete(null);
  };

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
      <div className="min-h-screen bg-slate-50/50 p-8 font-sans text-slate-800 dark:bg-slate-900 dark:text-slate-100">
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

            <div className="flex items-center gap-3">
              <div
                className="bg-white dark:bg-slate-800 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                {t("label_formats.found")}:{" "}
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {data.labelsFormats.length}
                </span>
              </div>
              {data.isLoggedIn && (
                <button
                  type="button"
                  onClick={actions.handleCreateClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-md shadow-indigo-200 dark:shadow-none transition-colors"
                >
                  <BsPlusLg size={16} />
                  {t("label_formats.new_template")}
                </button>
              )}
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
                  onClick={() => actions.handleCardClick(format.name)}
                  onDelete={() => setFormatToDelete(format.name)}
                  canManage={data.isLoggedIn}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600">
              {/* Ikona pustego stanu */}
              <BsFileEarmarkX
                className="mx-auto text-slate-300 dark:text-slate-600 mb-4"
                size={48}
              />
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                {t("label_formats.no_templates")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {t("label_formats.no_templates_message")}
              </p>
            </div>
          )}
        </div>
        {formatToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-red-50 p-3 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <BsExclamationTriangle size={22} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t("label_formats.delete_title")}
                </h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("label_formats.delete_confirmation", {
                  name: formatToDelete.replace(/\.[^/.]+$/, "")
                })}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormatToDelete(null)}
                  disabled={isDeleting}
                  className="rounded-lg px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-60 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-red-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none disabled:hover:bg-slate-300 disabled:active:scale-100"
                >
                  {isDeleting
                    ? t("label_formats.deleting")
                    : t("label_card.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingWrapper>
  );
}
