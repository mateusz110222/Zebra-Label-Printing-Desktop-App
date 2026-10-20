import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Select from "react-select";
import {
  FiArrowLeft,
  FiArrowUpRight,
  FiEdit3,
  FiMaximize,
  FiPrinter,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import {
  CriticalErrorState,
  LoadingWrapper,
  StatusBanner,
  SubmitButton,
} from "../components/common";
import { LabelPreview, PartDetailsCard } from "../components/print";
import { usePrintLabel } from "@renderer/hooks";
import { getSelectStyles } from "@renderer/config";
import { useTheme } from "@renderer/hooks/useThemeContext";
import { usePrinterStatus } from "@renderer/context/PrinterStatusContext";
import ReprintUnitDetails from "@renderer/components/print/ReprintUnitDetails";
import { ScannedReprintView } from "./ScannedReprintView";

function ManualReprintView(): React.JSX.Element {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();

  const { data, status, actions, isValid } = usePrintLabel("reprint");
  const { ready: livePrinterReady, statusMessage: livePrinterMessage } =
    usePrinterStatus();

  const printerAllowsPrint =
    data.hasAssignedPrinter && (data.usesMultiplePrinters || livePrinterReady);
  const canSubmit = isValid && printerAllowsPrint && !status.isPrinting;

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
        <div className="max-w-5xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {t("reprint.title")}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
              {t("reprint.subtitle")}
            </p>
          </div>
          {/* Printer Offline Banner */}
          {!data.usesMultiplePrinters && !livePrinterReady && (
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
                    autoFocus
                    options={data.options}
                    onChange={actions.handleSelectChange}
                    placeholder={t("print_view.select_part")}
                    isClearable
                    value={data.selectedOption}
                    classNamePrefix="react-select"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={getSelectStyles(resolvedTheme === "dark")}
                  />
                </div>

                {/* Part Details Card */}
                {data.selectedPart && (
                  <PartDetailsCard
                    part={data.selectedPart}
                    assignedPrinter={data.assignedPrinter}
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
                    : !data.date || !data.serialNumber.trim()
                      ? t("reprint.complete_details")
                      : !data.hasAssignedPrinter
                        ? t("backend.printer.format_not_assigned")
                        : !data.usesMultiplePrinters && !livePrinterReady
                          ? t("header.printer_offline")
                          : t("print_view.ready_to_print")}
                </p>
                <SubmitButton
                  isLoading={status.isPrinting}
                  isDisabled={!canSubmit}
                  loadingText={t("print_view.printing")}
                  text={t("reprint.print_label")}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </LoadingWrapper>
  );
}

export function ReprintView(): React.JSX.Element {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"manual" | "scan" | null>(null);
  const [isScanPrinting, setIsScanPrinting] = useState(false);

  return (
    <div className="min-h-full text-slate-800 dark:text-slate-100">
      {mode ? (
        <>
          <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
            <button
              type="button"
              disabled={isScanPrinting}
              onClick={() => setMode(null)}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <FiArrowLeft /> {t("reprint.change_method")}
            </button>
          </div>
          {mode === "manual" ? (
            <ManualReprintView />
          ) : (
            <ScannedReprintView onPrintingChange={setIsScanPrinting} />
          )}
        </>
      ) : (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="mb-10 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <FiPrinter size={23} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {t("reprint.title")}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {t("reprint.choose_method")}
              </p>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {(["manual", "scan"] as const).map((method, index) => {
              const Icon = method === "manual" ? FiEdit3 : FiMaximize;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setMode(method)}
                  className="group relative flex min-h-72 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-400 hover:shadow-lg motion-reduce:transform-none dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-400 sm:p-8"
                >
                  <div className="mb-10 flex w-full items-start justify-between">
                    <div
                      className={
                        method === "scan"
                          ? "rounded-xl bg-teal-50 p-3 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                          : "rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
                      }
                    >
                      <Icon size={26} />
                    </div>
                    <span className="font-mono text-xs tracking-widest text-slate-400 dark:text-slate-500">
                      0{index + 1}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    {t(`reprint.method_${method}`)}
                  </h2>
                  <p className="mb-7 mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {t(`reprint.method_${method}_description`)}
                  </p>
                  <span className="mt-auto flex w-full items-center justify-between border-t border-slate-100 pt-5 text-sm font-semibold text-indigo-600 dark:border-slate-700 dark:text-indigo-300">
                    {t(`reprint.method_${method}_action`)}
                    <FiArrowUpRight
                      size={20}
                      className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
