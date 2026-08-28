import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CriticalErrorState, LoadingWrapper, StatusBanner } from "@renderer/components/common";
import { useTranslation } from "react-i18next";
import { MdOutlinePrint } from "react-icons/md";
import { BsExclamationTriangle, BsFileEarmarkX, BsPlusLg } from "react-icons/bs";
import { FiSearch, FiX } from "react-icons/fi";
import { useLabelsFormats } from "@renderer/hooks";
import { LabelCard } from "@renderer/components/Labels/LabelCard";

export function LabelsFormatsView(): React.JSX.Element {
  const { t } = useTranslation();

  const { data, actions } = useLabelsFormats();
  const [formatToDelete, setFormatToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!formatToDelete) return;

    setIsDeleting(true);
    await actions.handleDelete(formatToDelete);
    setIsDeleting(false);
    setFormatToDelete(null);
  }, [actions, formatToDelete]);

  // Keyboard shortcut listener for Modal (Esc to cancel, Enter to confirm)
  useEffect(() => {
    if (!formatToDelete) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setFormatToDelete(null);
      } else if (e.key === "Enter" && !isDeleting) {
        e.preventDefault();
        void confirmDelete();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDelete, formatToDelete, isDeleting]);

  const filteredFormats = useMemo(() => {
    if (!searchQuery.trim()) return data.labelsFormats;
    const q = searchQuery.toLowerCase().trim();
    return data.labelsFormats.filter((format) =>
      format.name.toLowerCase().includes(q),
    );
  }, [data.labelsFormats, searchQuery]);

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
      <div className="min-h-screen bg-slate-50/50 p-6 sm:p-8 font-sans text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          {/* Header Sekcji */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                  <MdOutlinePrint size={26} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {t("label_formats.title")}
                </h2>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-2xl">
                {t("label_formats.subtitle")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                {t("label_formats.found")}:{" "}
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {filteredFormats.length}
                </span>
                {searchQuery && ` / ${data.labelsFormats.length}`}
              </div>
              {data.canManage && (
                <button
                  type="button"
                  onClick={actions.handleCreateClick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-200 dark:shadow-none transition-all active:scale-95"
                >
                  <BsPlusLg size={16} />
                  {t("label_formats.new_template")}
                </button>
              )}
            </div>
          </div>

          {/* Search bar & Dynamiczny Baner */}
          <div className="space-y-4">
            {data.labelsFormats.length > 0 && (
              <div className="relative max-w-md">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("common.search", "Szukaj szablonu...")}
                  className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    title={t("common.clear", "Wyczyść")}
                  >
                    <FiX size={16} />
                  </button>
                )}
              </div>
            )}

            {data.uiMessage && (
              <StatusBanner
                type={data.uiMessage.type}
                message={data.uiMessage.text}
                details={data.uiMessage.details}
                onClose={() => actions.setUiMessage(null)}
              />
            )}
          </div>

          {/* Grid z Kartami */}
          {filteredFormats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {filteredFormats.map((format) => (
                <LabelCard
                  key={format.name}
                  format={format}
                  onClick={() => actions.handleCardClick(format.name)}
                  onDelete={() => setFormatToDelete(format.name)}
                  canManage={data.canManage}
                />
              ))}
            </div>
          ) : data.labelsFormats.length > 0 ? (
            /* Search Empty State */
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <FiSearch
                className="mx-auto text-slate-300 dark:text-slate-600 mb-3"
                size={40}
              />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {t("common.no_search_results", "Brak wyników wyszukiwania")}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t(
                  "common.no_search_results_desc",
                  "Nie znaleziono szablonu pasującego do frazy:",
                )}{" "}
                &quot;{searchQuery}&quot;
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors"
              >
                {t("common.clear_filter", "Wyczyść filtr")}
              </button>
            </div>
          ) : (
            /* General Empty State */
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600">
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

        {/* Modal usuwania */}
        {formatToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 animate-fadeIn">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
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
                  name: formatToDelete.replace(/\.[^/.]+$/, ""),
                })}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormatToDelete(null)}
                  disabled={isDeleting}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-60 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
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
