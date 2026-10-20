import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Select from "react-select";
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
import { extractError } from "@renderer/utils/errorUtils";

const HEALTH_TTL_MS = 45_000;

export function PrintView(): React.JSX.Element {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();

  const { data, status, actions, isValid } = usePrintLabel("print");
  const { ready: livePrinterReady, statusMessage: livePrinterMessage } =
    usePrinterStatus();
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [healthIsLoading, setHealthIsLoading] = useState(true);
  const [healthError, setHealthError] = useState("");
  const [healthIsStale, setHealthIsStale] = useState(true);
  const [verifiedPostPrintSummary, setVerifiedPostPrintSummary] =
    useState<PrintLabelResult | null>(null);
  const healthRequestId = useRef(0);
  const healthExpiryTimer = useRef<number | null>(null);
  const postPrintVerificationPendingRef = useRef(false);

  const clearUiMessage = actions.clearUiMessage;
  const refreshHealth = useCallback(
    async (showLoading = true): Promise<boolean> => {
      const requestId = ++healthRequestId.current;
      if (showLoading) setHealthIsLoading(true);

      try {
        const response = await window.api.GetSystemHealth();
        if (requestId !== healthRequestId.current) return false;

        if (!response.status || !response.data) {
          setHealthError(t(response.message || "health.load_error"));
          setHealthIsStale(true);
          return false;
        }

        setHealth(response.data);
        setHealthError("");
        setHealthIsStale(false);
        if (healthExpiryTimer.current !== null) {
          window.clearTimeout(healthExpiryTimer.current);
        }
        healthExpiryTimer.current = window.setTimeout(
          () => setHealthIsStale(true),
          HEALTH_TTL_MS,
        );
        return true;
      } catch (caught) {
        if (requestId !== healthRequestId.current) return false;
        const { message: errMessage } = extractError(caught);
        setHealthError(errMessage || t("health.load_error"));
        setHealthIsStale(true);
        return false;
      } finally {
        if (showLoading && requestId === healthRequestId.current) {
          setHealthIsLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshHealth(), 0);
    const interval = window.setInterval(() => {
      if (!postPrintVerificationPendingRef.current) void refreshHealth(false);
    }, 30_000);
    return () => {
      healthRequestId.current += 1;
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      if (healthExpiryTimer.current !== null) {
        window.clearTimeout(healthExpiryTimer.current);
      }
    };
  }, [refreshHealth]);

  const assignedPrinterHealth =
    data.usesMultiplePrinters &&
    data.hasAssignedPrinter &&
    health?.printers?.length
      ? health.printers.find(
          (p) =>
            (p.name || p.target).trim().toLocaleUpperCase() ===
            data.assignedPrinter.trim().toLocaleUpperCase(),
        )
      : undefined;
  const assignedPrinterOffline =
    data.usesMultiplePrinters &&
    data.selectedPart !== null &&
    data.hasAssignedPrinter &&
    assignedPrinterHealth !== undefined &&
    !assignedPrinterHealth.ready;

  const printerWarningBlocksPrint =
    !data.usesMultiplePrinters &&
    data.lastPrintSummary?.printerReady === false &&
    !(
      verifiedPostPrintSummary === data.lastPrintSummary &&
      health?.printer.ready === true &&
      livePrinterReady
    );
  const auditWarningBlocksPrint =
    data.lastPrintSummary?.auditPersisted === false;
  const postPrintWarning =
    data.lastPrintSummary?.status === false ||
    printerWarningBlocksPrint ||
    auditWarningBlocksPrint;
  const postPrintVerificationPending =
    postPrintWarning && verifiedPostPrintSummary !== data.lastPrintSummary;

  useEffect(() => {
    postPrintVerificationPendingRef.current = postPrintVerificationPending;
  }, [postPrintVerificationPending]);

  useEffect(() => {
    if (!postPrintWarning) return;
    const summaryToVerify = data.lastPrintSummary;
    let active = true;
    let retryTimer: number | null = null;

    const verifyHealth = async (): Promise<void> => {
      const responseApplied = await refreshHealth(false);
      if (!active) return;

      if (responseApplied) {
        setVerifiedPostPrintSummary(summaryToVerify);
        return;
      }

      retryTimer = window.setTimeout(() => void verifyHealth(), 5_000);
    };

    const refreshTimer = window.setTimeout(() => void verifyHealth(), 0);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [data.lastPrintSummary, postPrintWarning, refreshHealth]);

  useEffect(() => {
    const printerRecovered =
      status.uiMessage !== null &&
      data.lastPrintSummary?.printerReady === false &&
      verifiedPostPrintSummary === data.lastPrintSummary &&
      health?.printer.ready === true &&
      livePrinterReady;

    if (printerRecovered) {
      clearUiMessage();
    }
  }, [
    status.uiMessage,
    data.lastPrintSummary,
    verifiedPostPrintSummary,
    health?.printer.ready,
    livePrinterReady,
    clearUiMessage,
  ]);

  const effectiveHealthIsStale = healthIsStale || postPrintVerificationPending;

  const systemAllowsPrint =
    health !== null &&
    !healthIsLoading &&
    !effectiveHealthIsStale &&
    !healthError &&
    health.database.status &&
    (data.usesMultiplePrinters
      ? !assignedPrinterOffline
      : health.printer.ready && livePrinterReady) &&
    health.templates.status &&
    health.audit.status;
  const blockingReasons = [
    !health
      ? healthIsLoading
        ? t("print_view.block_health_checking")
        : healthError || t("print_view.block_health_unavailable")
      : healthIsStale || postPrintVerificationPending || healthError
        ? healthError ||
          t(
            postPrintVerificationPending
              ? "print_view.block_health_checking"
              : "print_view.block_health_stale",
          )
        : null,
    health
      ? [
          !health.database.status
            ? !health.database.reachable
              ? t("print_view.block_database_unreachable")
              : !health.database.engineOk
                ? t("print_view.block_database_engine")
                : (health.database.duplicateFamilies ?? []).length > 0
                  ? t("print_view.block_database_duplicates")
                  : t("print_view.block_database_time")
            : null,
          !data.hasAssignedPrinter
            ? t("backend.printer.format_not_assigned")
            : assignedPrinterOffline
              ? t(assignedPrinterHealth?.message || "header.printer_offline")
              : printerWarningBlocksPrint
                ? t(
                    data.lastPrintSummary?.printerStatusMessage ||
                      "print_view.printer_status_not_confirmed",
                  )
                : !data.usesMultiplePrinters &&
                    (!health.printer.ready || !livePrinterReady)
                  ? t(livePrinterMessage || health.printer.message)
                  : null,
          !health.templates.status ? t("print_view.block_templates") : null,
          !health.audit.status ? t("print_view.block_audit") : null,
        ]
      : [
          !data.hasAssignedPrinter
            ? t("backend.printer.format_not_assigned")
            : printerWarningBlocksPrint
              ? t(
                  data.lastPrintSummary?.printerStatusMessage ||
                    "print_view.printer_status_not_confirmed",
                )
              : !data.usesMultiplePrinters && !livePrinterReady
                ? t(
                    livePrinterMessage ||
                      "print_view.printer_status_not_confirmed",
                  )
                : null,
          auditWarningBlocksPrint ? t("print_view.block_audit") : null,
        ],
  ]
    .flat()
    .filter((reason): reason is string => Boolean(reason));
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const hasSystemBlockingReason = uniqueBlockingReasons.length > 0;
  const receiptHasWarning =
    data.lastPrintSummary?.printerReady === false ||
    data.lastPrintSummary?.auditPersisted === false;

  const canSubmit =
    isValid &&
    data.hasAssignedPrinter &&
    systemAllowsPrint &&
    !status.isPrinting;
  const currentStep = !data.selectedPart ? 1 : data.previewImage ? 3 : 2;

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
              {t("print_view.title")}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
              {t("print_view.subtitle")}
            </p>
          </div>
          {!systemAllowsPrint && (
            <div
              role="alert"
              className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950 shadow-sm dark:border-red-600 dark:bg-red-950/50 dark:text-red-100"
            >
              <h2 className="text-lg font-extrabold">
                {t("print_view.print_blocked_title")}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
                {uniqueBlockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => navigate("/health")}
                className="mt-3 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-600 dark:hover:bg-red-500 dark:focus:ring-offset-red-950"
              >
                {t("print_view.open_system_health")} →
              </button>
            </div>
          )}

          {/* Status Banner */}
          {status.uiMessage &&
            !hasSystemBlockingReason &&
            !data.lastPrintSummary?.status && (
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
                receiptHasWarning
                  ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              }`}
            >
              <h2 className="font-bold">
                {t(
                  data.lastPrintSummary.printerReady === false
                    ? "print_view.receipt_warning_title"
                    : data.lastPrintSummary.auditPersisted === false
                      ? "print_view.receipt_audit_warning_title"
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
              {data.lastPrintSummary.auditPersisted === false && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border-2 border-red-500 bg-red-100 p-3 text-red-950 dark:border-red-500 dark:bg-red-950/70 dark:text-red-100"
                >
                  <div className="text-xs font-extrabold uppercase tracking-wide">
                    {t("print_view.audit_problem")}
                  </div>
                  <div className="mt-1 text-lg font-extrabold">
                    {t(
                      data.lastPrintSummary.auditStatusMessage ||
                        "backend.audit.storage_unavailable",
                    )}
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
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void actions.handlePrint();
              }}
            >
              <div className="p-4 sm:p-6 lg:p-8">
                <ol
                  aria-label={t("print_view.title")}
                  className="mb-8 grid grid-cols-3 gap-2"
                >
                  {[
                    t("print_view.step_select"),
                    t("print_view.step_preview"),
                    t("print_view.step_print"),
                  ].map((label, index) => {
                    const number = index + 1;
                    const isActive = number === currentStep;
                    const isComplete = number < currentStep;

                    return (
                      <li
                        key={label}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold sm:text-sm ${
                          isActive
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                            : isComplete
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                            isActive
                              ? "bg-indigo-600 text-white"
                              : isComplete
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {isComplete ? "✓" : number}
                        </span>
                        <span className="hidden truncate sm:inline">
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ol>

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

                {/* Label Preview */}
                <LabelPreview
                  isLoading={status.isPreviewLoading}
                  previewImage={data.previewImage}
                />
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 lg:px-8 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                  {!systemAllowsPrint
                    ? t("print_view.print_blocked_title")
                    : data.selectedPart
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
