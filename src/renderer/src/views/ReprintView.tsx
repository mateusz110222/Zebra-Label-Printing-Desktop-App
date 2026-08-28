import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Select from "react-select";
import { useNavigate } from "react-router-dom";

import { CriticalErrorState, LoadingWrapper, StatusBanner, SubmitButton } from "../components/common";
import { LabelPreview, PartDetailsCard } from "../components/print";
import { usePrintLabel } from "@renderer/hooks";
import { selectStyles } from "@renderer/config";
import { useTheme } from "@renderer/hooks/useThemeContext";
import { usePrinterStatus } from "@renderer/context/PrinterStatusContext";
import ReprintUnitDetails from "@renderer/components/print/ReprintUnitDetails";

export function ReprintView(): React.JSX.Element {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const { data, status, actions, isValid } = usePrintLabel("reprint");
  const { ready: livePrinterReady, statusMessage: livePrinterMessage } =
    usePrinterStatus();

  const canSubmit = isValid && livePrinterReady && !status.isPrinting;

  // Keyboard shortcut Ctrl+Enter / Ctrl+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "Enter" || e.key.toLowerCase() === "p")
      ) {
        if (canSubmit) {
          e.preventDefault();
          void actions.handlePrint();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canSubmit, actions]);

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
          {/* Printer Offline Banner */}
          {!livePrinterReady && (
            <div
              role="alert"
              className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950 shadow-sm dark:border-red-600 dark:bg-red-950/50 dark:text-red-100"
            >
              <h2 className="text-base sm:text-lg font-extrabold">
                {t("print_view.print_blocked_title", "Drukowanie zablokowane")}
              </h2>
              <p className="mt-1 text-sm font-semibold">
                {livePrinterMessage
                  ? t(livePrinterMessage)
                  : t("header.printer_offline")}
              </p>
              <button
                type="button"
                onClick={() => navigate("/health")}
                className="mt-3 inline-flex rounded-lg bg-red-700 px-4 py-2 text-xs sm:text-sm font-bold text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-600 dark:hover:bg-red-500 dark:focus:ring-offset-red-950"
              >
                {t("print_view.open_system_health")} →
              </button>
            </div>
          )}

          {/* Status Banner */}
          {status.uiMessage && (
            <div className="mb-6">
              <StatusBanner
                type={status.uiMessage.type}
                message={status.uiMessage.text}
                details={status.uiMessage.details}
                onClose={actions.clearUiMessage}
              />
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) {
                  void actions.handlePrint();
                }
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
                    value={data.selectedOption}
                    classNamePrefix="react-select"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={selectStyles}
                  />
                </div>

                {/* Part Details Card */}
                {data.selectedPart && (
                  <PartDetailsCard
                    part={data.selectedPart}
                    quantity={data.labelQuantity}
                    onQuantityChange={actions.handleQuantityChange}
                    onQuantityBlur={actions.handleQuantityBlur}
                  />
                )}

                {data.selectedPart && (
                  <ReprintUnitDetails
                    date={data.date}
                    onchangeDate={actions.handleDateChange}
                    serialNumber={data.serialNumber}
                    onchangeSerialNumber={actions.handleSerialNumberChange}
                  />
                )}

                <LabelPreview
                  isLoading={status.isPreviewLoading}
                  previewImage={data.previewImage}
                />
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 lg:px-8 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                  {!data.selectedPart
                    ? t("print_view.select_part_first")
                    : !livePrinterReady
                      ? t("header.printer_offline")
                      : t("print_view.ready_to_print")}
                </p>
                <SubmitButton
                  isLoading={status.isPrinting}
                  isDisabled={!canSubmit}
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
