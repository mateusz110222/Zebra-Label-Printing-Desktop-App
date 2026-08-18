import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Select from "react-select";
import { useNavigate } from "react-router-dom";

import { CriticalErrorState, LoadingWrapper, StatusBanner, SubmitButton } from "../components/common";
import { LabelPreview, PartDetailsCard } from "../components/print";
import { usePrintLabel } from "@renderer/hooks";
import { selectStyles } from "@renderer/config";
import { useTheme } from "@renderer/hooks/useThemeContext";

export function PrintView(): React.JSX.Element {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const { data, status, actions, isValid } = usePrintLabel("print");
  const [health, setHealth] = useState<SystemHealthData | null>(null);

  useEffect(() => {
    let mounted = true;
    const refreshHealth = async (): Promise<void> => {
      const response = await window.api.GetSystemHealth().catch(() => null);
      if (mounted && response?.status && response.data)
        setHealth(response.data);
    };
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const systemAllowsPrint =
    !health ||
    (health.database.status && health.printer.ready && health.templates.status);
  const blockingReasons = health
    ? [
        !health.database.status
          ? !health.database.reachable
            ? t("print_view.block_database_unreachable")
            : !health.database.engineOk
              ? t("print_view.block_database_engine")
              : health.database.duplicateFamilies.length > 0
                ? t("print_view.block_database_duplicates")
                : t("print_view.block_database_time")
          : null,
        !health.printer.ready ? t(health.printer.message) : null,
        !health.templates.status ? t("print_view.block_templates") : null,
      ].filter((reason): reason is string => Boolean(reason))
    : [];

  if (status.criticalError) {
    return (
      <CriticalErrorState
        message={status.criticalError}
        onRetry={() => window.location.reload()}
        title={t("print_view.error")}
      />
    );
  }

  return (
    <LoadingWrapper isLoading={status.isLoading}>
      <div className="min-h-full p-4 sm:p-6 lg:p-8 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
        <div className="max-w-4xl w-full m-auto">
          {!systemAllowsPrint && (
            <div
              role="alert"
              className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950 shadow-sm dark:border-red-600 dark:bg-red-950/50 dark:text-red-100"
            >
              <h2 className="text-lg font-extrabold">
                {t("print_view.print_blocked_title")}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
                {blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {!health?.printer.ready && (
                <button
                  type="button"
                  onClick={() => navigate("/health")}
                  className="mt-3 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-600 dark:hover:bg-red-500 dark:focus:ring-offset-red-950"
                >
                  {t("print_view.open_system_health")} →
                </button>
              )}
            </div>
          )}

          {health && (
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800">
              {[
                ["health.database", health.database.status],
                ["health.printer", health.printer.ready],
                ["health.templates", health.templates.status],
              ].map(([label, ok]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-center gap-2"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                  <span className="font-semibold">{t(String(label))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Status Banner */}
          {status.uiMessage && !data.lastPrintSummary?.status && (
            <div className="mb-6">
              <StatusBanner
                type={status.uiMessage.type}
                message={status.uiMessage.text}
                details={status.uiMessage.details}
                onClose={actions.clearUiMessage}
              />
            </div>
          )}

          {data.lastPrintSummary?.status && (
            <div
              className={`mb-6 rounded-xl border p-5 ${
                data.lastPrintSummary.printerReady === false
                  ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              }`}
            >
              <h2 className="font-bold">
                {t(
                  data.lastPrintSummary.printerReady === false
                    ? "print_view.receipt_warning_title"
                    : "print_view.receipt_title",
                )}
              </h2>
              {data.lastPrintSummary.printerReady === false && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border-2 border-red-500 bg-red-100 p-3 text-red-950 dark:border-red-500 dark:bg-red-950/70 dark:text-red-100"
                >
                  <div className="text-xs font-extrabold uppercase tracking-wide">
                    {t("print_view.printer_problem")}
                  </div>
                  <div className="mt-1 text-lg font-extrabold">
                    {data.lastPrintSummary.printerStatusMessage
                      ? t(data.lastPrintSummary.printerStatusMessage)
                      : t("print_view.printer_status_not_confirmed")}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/health")}
                    className="mt-3 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-600 dark:hover:bg-red-500 dark:focus:ring-offset-red-950"
                  >
                    {t("print_view.open_system_health")} →
                  </button>
                </div>
              )}
              {data.lastPrintSummary.printerReady !== false && (
                <p className="mt-3 text-sm font-semibold">
                  {data.lastPrintSummary.printerStatusMessage
                    ? t(data.lastPrintSummary.printerStatusMessage)
                    : t("print_view.printer_status_not_confirmed")}
                </p>
              )}
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (isValid && systemAllowsPrint) void actions.handlePrint();
              }}
            >
              <div className="p-4 sm:p-6 lg:p-8">
                {/* Part Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100 mb-2">
                    {t("print_view.part_selection")}
                  </label>
                  <Select
                    key={theme}
                    autoFocus
                    options={data.options}
                    onChange={actions.handleSelectChange}
                    placeholder={t("print_view.select_part")}
                    isClearable
                    value={
                      data.selectedPart
                        ? {
                            value: data.selectedPart.Serial_Prefix,
                            label: `${data.selectedPart.Part_Description} (${data.selectedPart.Serial_Prefix})`,
                          }
                        : null
                    }
                    classNamePrefix="react-select"
                    styles={selectStyles}
                  />
                </div>

                {/* Part Details Card */}
                {data.selectedPart && (
                  <PartDetailsCard
                    part={data.selectedPart}
                    quantity={data.labelQuantity}
                    onQuantityChange={actions.handleQuantityChange}
                  />
                )}

                {/* Label Preview */}
                <LabelPreview
                  isLoading={status.isPreviewLoading}
                  previewImage={data.previewImage}
                />
                {data.selectedPart && (
                  <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                    {t("print_view.preview_example_notice")}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 lg:px-8 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                  {data.selectedPart
                    ? t("print_view.ready_to_print")
                    : t("print_view.select_part_first")}
                </p>
                <SubmitButton
                  isLoading={status.isPrinting}
                  isDisabled={!isValid || !systemAllowsPrint}
                  loadingText={t("print_view.printing")}
                  text={t("print_view.print_label")}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </LoadingWrapper>
  );
}
