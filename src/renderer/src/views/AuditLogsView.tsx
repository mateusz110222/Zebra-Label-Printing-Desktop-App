import React, {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  FiCheckCircle,
  FiChevronRight,
  FiX,
  FiDownload,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiXCircle,
} from "react-icons/fi";
import { useAuth } from "@renderer/context/AuthContext";
import {
  AuditLogsViewSkeleton,
  LoadingWrapper,
} from "@renderer/components/common";
import { extractError } from "@renderer/utils/errorUtils";

const PAGE_SIZE = 50;

type HistoryView = "print" | "audit";

type DeliveryState = "sent" | "failed";

interface AuditBatchLabel {
  batchPosition?: number;
  serialNumber?: string;
  fullSerialNumber?: string;
  julianDate?: string;
  bmsDate?: string;
  zplSha256?: string;
  deliveryState?: DeliveryState;
  printerMessage?: string | null;
  printerError?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readDiagnosticNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

const readDiagnosticErrors = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const parseBatchLabels = (value: unknown): AuditBatchLabel[] | null => {
  let candidate = value;

  // Compatibility with logs created by the previous
  // implementation where labels were JSON.stringify(...)
  // before being persisted.
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }

  if (!Array.isArray(candidate)) {
    return null;
  }

  return candidate.filter((item): item is AuditBatchLabel => isRecord(item));
};

const Detail = ({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.JSX.Element | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <span className="inline-flex max-w-full gap-1 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>

      <span className="min-w-0 font-medium [overflow-wrap:anywhere] text-slate-800 dark:text-slate-100">
        {String(value)}
      </span>
    </span>
  );
};

export function AuditLogsView(): React.JSX.Element {
  const { t, i18n } = useTranslation();

  const { isLoggedIn, CanEdit } = useAuth();

  const [activeView, setActiveView] = useState<HistoryView>("print");
  const [loadedView, setLoadedView] = useState<HistoryView>("print");

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);

  const [category, setCategory] = useState<AuditLogQuery["category"]>("all");

  const [statusFilter, setStatusFilter] =
    useState<AuditLogQuery["status"]>("all");

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [dateFrom, setDateFrom] = useState("");

  const [dateTo, setDateTo] = useState("");

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [showTabSkeleton, setShowTabSkeleton] = useState(false);

  const [isExporting, setIsExporting] = useState(false);

  const [message, setMessage] = useState("");

  const loadRequestId = useRef(0);

  const query = useMemo<AuditLogQuery>(
    () => ({
      scope: activeView,

      category: activeView === "print" ? "print" : category,

      status: statusFilter,

      search,

      dateFrom: dateFrom || undefined,

      dateTo: dateTo || undefined,

      page,

      pageSize: PAGE_SIZE,
    }),
    [activeView, category, dateFrom, dateTo, page, search, statusFilter],
  );

  const loadLogs = useCallback(async (): Promise<void> => {
    if (!isLoggedIn || !CanEdit) {
      loadRequestId.current += 1;

      return;
    }

    const requestId = ++loadRequestId.current;

    setIsLoading(true);
    setMessage("");

    try {
      const response = await window.api.GetAuditLogs(query);

      if (requestId !== loadRequestId.current) {
        return;
      }

      if (!response.status || !response.data) {
        setMessage(t(response.message || "backend.audit.read_error"));
        setEntries([]);
        setTotal(0);

        return;
      }

      setEntries(response.data.entries);

      setTotal(response.data.total);
    } catch (error) {
      if (requestId !== loadRequestId.current) {
        return;
      }

      const { message: errMessage } = extractError(error);
      setMessage(errMessage || t("backend.audit.read_error"));
      setEntries([]);
      setTotal(0);
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
        setIsInitialLoading(false);
        setLoadedView(activeView);
        setShowTabSkeleton(false);
      }
    }
  }, [CanEdit, isLoggedIn, query, t, activeView]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 0);

    return () => {
      window.clearTimeout(timer);

      loadRequestId.current += 1;
    };
  }, [loadLogs]);

  // Debounced live search with 350ms pause
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  const changeView = (view: HistoryView): void => {
    if (view === activeView) return;

    loadRequestId.current += 1;
    setIsLoading(true);
    setShowTabSkeleton(false);
    setActiveView(view);
    setPage(1);
    setMessage("");
  };

  useEffect(() => {
    if (activeView === loadedView) return;
    const timer = window.setTimeout(() => setShowTabSkeleton(true), 180);
    return () => window.clearTimeout(timer);
  }, [activeView, loadedView]);

  const applySearch = (event: FormEvent): void => {
    event.preventDefault();

    setPage(1);
    setSearch(searchInput);
  };

  const exportLogs = async (): Promise<void> => {
    setIsExporting(true);
    setMessage("");

    try {
      const response = await window.api.ExportAuditLogs({
        ...query,
        page: 1,
      });

      if (!response.status) {
        setMessage(t(response.message || "backend.audit.export_error"));
      } else if (!response.canceled) {
        setMessage(t("audit.export_success"));
      }
    } catch (error) {
      const { message: errMessage } = extractError(error);
      setMessage(errMessage || t("backend.audit.export_error"));
    } finally {
      setIsExporting(false);
    }
  };

  if (!isLoggedIn || !CanEdit) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <FiShield className="mx-auto mb-4 text-4xl text-slate-400 dark:text-slate-500" />

          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t("audit.access_restricted_title")}
          </h3>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("audit.access_restricted_message")}
          </p>
        </div>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isPrintView = loadedView === "print";

  return (
    <LoadingWrapper
      isLoading={isInitialLoading}
      skeleton={<AuditLogsViewSkeleton />}
    >
      <div className="min-h-full p-4 text-slate-800 sm:p-6 lg:p-8 dark:text-slate-100">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("audit.title")}
            </h2>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("audit.subtitle")}
            </p>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => changeView("print")}
              className={`flex items-center gap-4 rounded-xl border p-4 text-left transition ${
                activeView === "print"
                  ? "border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/40"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              <span className="rounded-lg bg-indigo-600 p-3 text-white">
                <FiPrinter size={22} />
              </span>

              <span>
                <span className="block font-bold">{t("audit.print_tab")}</span>

                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {t("audit.print_tab_description")}
                </span>
              </span>
            </button>

            <button
              onClick={() => changeView("audit")}
              className={`flex items-center gap-4 rounded-xl border p-4 text-left transition ${
                activeView === "audit"
                  ? "border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/40"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              <span className="rounded-lg bg-slate-700 p-3 text-white">
                <FiShield size={22} />
              </span>

              <span>
                <span className="block font-bold">{t("audit.audit_tab")}</span>

                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {t("audit.audit_tab_description")}
                </span>
              </span>
            </button>
          </div>

          {showTabSkeleton ? (
            <AuditLogsViewSkeleton contentOnly />
          ) : (
            <div inert={activeView !== loadedView}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">
                    {t(isPrintView ? "audit.print_title" : "audit.audit_title")}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t(
                      isPrintView
                        ? "audit.print_subtitle"
                        : "audit.audit_subtitle",
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void loadLogs()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <FiRefreshCw className={isLoading ? "animate-spin" : ""} />

                    {t("audit.refresh")}
                  </button>

                  <button
                    onClick={() => void exportLogs()}
                    disabled={isExporting}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <FiDownload />

                    {isExporting ? t("audit.exporting") : t("audit.export")}
                  </button>
                </div>
              </div>

              <form
                onSubmit={applySearch}
                className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex xl:col-span-2">
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder={
                      isPrintView
                        ? t("audit.print_search_placeholder")
                        : t("audit.audit_search_placeholder")
                    }
                    className="min-w-0 flex-1 rounded-l-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />

                  <button
                    type="submit"
                    aria-label={t("audit.search")}
                    className="rounded-r-lg bg-slate-800 px-3 text-white dark:bg-slate-600"
                  >
                    <FiSearch />
                  </button>
                </div>

                {isPrintView ? (
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {t("audit.category_print")}
                  </div>
                ) : (
                  <select
                    value={category}
                    onChange={(event) => {
                      setPage(1);

                      setCategory(
                        event.target.value as AuditLogQuery["category"],
                      );
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  >
                    <option value="all">{t("audit.category_all")}</option>

                    <option value="auth">{t("audit.category_auth")}</option>

                    <option value="config">{t("audit.category_config")}</option>

                    <option value="template">
                      {t("audit.category_template")}
                    </option>

                    <option value="system">{t("audit.category_system")}</option>
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);

                    setStatusFilter(
                      event.target.value as AuditLogQuery["status"],
                    );
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="all">{t("audit.status_all")}</option>

                  <option value="success">{t("audit.status_success")}</option>

                  <option value="failure">{t("audit.status_failure")}</option>
                </select>

                <input
                  type="date"
                  aria-label={t("audit.date_from")}
                  value={dateFrom}
                  onChange={(event) => {
                    setPage(1);
                    setDateFrom(event.target.value);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />

                <input
                  type="date"
                  aria-label={t("audit.date_to")}
                  value={dateTo}
                  onChange={(event) => {
                    setPage(1);
                    setDateTo(event.target.value);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </form>

              {message && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  {message}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div
                  className="h-[clamp(16rem,50dvh,42rem)] overflow-auto [scrollbar-gutter:stable]"
                  aria-busy={isLoading}
                >
                  {isPrintView ? (
                    <PrintHistoryTable
                      entries={entries}
                      isLoading={isLoading}
                      locale={i18n.language}
                      t={t}
                    />
                  ) : (
                    <AuditHistoryTable
                      entries={entries}
                      isLoading={isLoading}
                      locale={i18n.language}
                      t={t}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
                  <span className="text-slate-500" role="status">
                    {isLoading
                      ? t("common.loading")
                      : t("audit.total", { count: total })}
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      disabled={page <= 1 || isLoading}
                      onClick={() => setPage((value) => value - 1)}
                      className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600"
                    >
                      {t("audit.previous")}
                    </button>

                    <span>
                      {page} / {pageCount}
                    </span>

                    <button
                      disabled={page >= pageCount || isLoading}
                      onClick={() => setPage((value) => value + 1)}
                      className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600"
                    >
                      {t("audit.next")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </LoadingWrapper>
  );
}

interface HistoryTableProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  locale: string;
  t: ReturnType<typeof useTranslation>["t"];
}

const translateAuditDetailValue = (
  key: string,
  value: unknown,
  t: HistoryTableProps["t"],
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([itemKey, itemValue]) => `${itemKey} → ${String(itemValue)}`)
      .join(", ");
  }

  if (typeof value === "boolean") {
    return t(value ? "audit.value_yes" : "audit.value_no");
  }

  if (typeof value !== "string") {
    return value;
  }

  if (value.startsWith("backend.")) {
    return t(value, {
      defaultValue: value,
    });
  }

  if (key === "reason" && value.startsWith("AUTH_")) {
    return t(`backend.auth.${value}`, {
      defaultValue: value,
    });
  }

  if (key === "mode" && (value === "single" || value === "multiple")) {
    return t(`config_view.printer_mode_${value}`);
  }

  if (key === "source" && (value === "server" || value === "local")) {
    return t(`parts_config.source_${value}_title`);
  }

  return value;
};

const EmptyRow = ({
  isLoading,
  columns,
  t,
}: {
  isLoading: boolean;
  columns: number;
  t: HistoryTableProps["t"];
}): React.JSX.Element => (
  <tr>
    <td colSpan={columns} className="px-4 py-12 text-center text-slate-500">
      {t(isLoading ? "common.loading" : "audit.no_entries")}
    </td>
  </tr>
);

function HistoryDialog({
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactPortal {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => element?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none backdrop:bg-black/65 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <FiX size={20} />
        </button>
      </header>
      <div className="max-h-[72vh] overflow-auto p-5">{children}</div>
    </dialog>,
    document.body,
  );
}

function PrintHistoryTable({
  entries,
  isLoading,
  locale,
  t,
}: HistoryTableProps): React.JSX.Element {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  return (
    <table className="w-full min-w-[980px] table-fixed text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="w-[17%] px-4 py-3">{t("audit.time")}</th>

          <th className="w-[13%] px-4 py-3">{t("audit.result")}</th>

          <th className="w-[14%] px-4 py-3">{t("audit.user")}</th>

          <th className="w-[18%] px-4 py-3">{t("audit.part")}</th>

          <th className="w-[18%] px-4 py-3">{t("audit.serial")}</th>

          <th className="w-[20%] px-4 py-3">{t("audit.details")}</th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
        {entries.map((entry: AuditLogEntry) => {
          const labelsArray = parseBatchLabels(entry.details.labels);

          const isBatchEntry = entry.action === "BATCH_PRINT";
          const diagnostics = isRecord(entry.details.printerDiagnostics)
            ? entry.details.printerDiagnostics
            : null;
          const acknowledgements = isRecord(
            entry.details.printerAcknowledgements,
          )
            ? entry.details.printerAcknowledgements
            : null;
          const confirmed = readDiagnosticErrors(acknowledgements?.confirmed);
          const missing = readDiagnosticErrors(acknowledgements?.missing);
          const repeated = readDiagnosticErrors(acknowledgements?.repeated);
          const difference = readDiagnosticNumber(
            diagnostics?.differenceFromSent,
          );
          const diagnosticStatus =
            difference === null
              ? t("audit.diagnostics.unavailable")
              : difference === 0
                ? t("audit.diagnostics.match")
                : t("audit.diagnostics.difference", {
                    value: difference > 0 ? `+${difference}` : difference,
                  });
          const diagnosticTone =
            difference !== null && difference !== 0
              ? "font-semibold text-amber-800 dark:text-amber-300"
              : "text-slate-600 dark:text-slate-400";
          const diagnosticErrors = [
            {
              phase: "before_errors",
              messages: readDiagnosticErrors(diagnostics?.beforeErrors),
            },
            {
              phase: "after_errors",
              messages: readDiagnosticErrors(diagnostics?.afterErrors),
            },
          ];

          const canExpandBatch =
            isBatchEntry && labelsArray !== null && labelsArray.length > 0;

          const isBatchDialogOpen =
            canExpandBatch && selectedBatch === entry.id;

          const requestedQuantity =
            Number(entry.details.requestedQuantity) || labelsArray?.length || 1;

          const sentCount =
            entry.details.sentCount !== undefined
              ? Number(entry.details.sentCount)
              : labelsArray
                ? labelsArray.filter((label) => label.deliveryState === "sent")
                    .length
                : entry.status === "success"
                  ? requestedQuantity
                  : 0;

          return (
            <React.Fragment key={entry.id}>
              <tr
                className={`align-top hover:bg-slate-50/70 dark:hover:bg-slate-700/30 ${
                  canExpandBatch ? "cursor-pointer" : ""
                }`}
                onClick={
                  canExpandBatch ? () => setSelectedBatch(entry.id) : undefined
                }
              >
                <td className="overflow-hidden px-4 py-3">
                  <div className="flex items-center gap-2">
                    {canExpandBatch && (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={t("audit.modal.batch")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedBatch(entry.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-500 focus-visible:outline-2 dark:text-slate-400"
                      >
                        <FiChevronRight size={16} />
                      </button>
                    )}

                    <div>
                      <div className="whitespace-nowrap font-medium">
                        {new Date(entry.timestamp).toLocaleString(locale)}
                      </div>

                      <div
                        className="mt-1 truncate text-xs text-slate-500"
                        title={`${entry.workstation} · v${entry.appVersion}`}
                      >
                        {entry.workstation} · v{entry.appVersion}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={entry.status} t={t} />

                  <div className="mt-2 text-xs font-medium">
                    {t(`audit.actions.${entry.action}`, entry.action)}
                  </div>

                  {isBatchEntry && (
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {sentCount}/{requestedQuantity} {t("audit.sent", "sent")}
                      {entry.details.deliveryResult === "partial" &&
                        ` (${t("audit.partial", "partial")})`}
                    </div>
                  )}

                  {entry.status === "failure" &&
                    entry.details.message &&
                    !isBatchEntry && (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                        {t(String(entry.details.message), {
                          defaultValue: String(entry.details.message),
                        })}
                      </div>
                    )}
                </td>

                <td className="px-4 py-3 font-medium">{entry.actor}</td>

                <td className="px-4 py-3">
                  <div className="font-semibold">
                    {entry.details.partNumber}
                  </div>

                  <div className="mt-1 max-w-xs text-xs text-slate-500">
                    {entry.details.description}
                  </div>
                </td>

                <td className="px-4 py-3">
                  {isBatchEntry ? (
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {requestedQuantity} {t("audit.labels_count", "labels")}
                      {canExpandBatch && ` (${t("audit.modal.open")})`}
                    </div>
                  ) : (
                    <>
                      <div className="font-mono font-semibold">
                        {entry.details.fullSerialNumber ||
                          `${entry.details.serialPrefix || ""}${entry.details.serialNumber || ""}`}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <Detail
                          label={t("audit.prefix")}
                          value={entry.details.serialPrefix}
                        />

                        <Detail label="SN" value={entry.details.serialNumber} />
                      </div>
                    </>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex max-w-sm flex-wrap gap-1">
                    <Detail
                      label={t("audit.julian_date")}
                      value={entry.details.julianDate}
                    />

                    <Detail
                      label={t("audit.bms_date")}
                      value={entry.details.bmsDate}
                    />

                    <Detail
                      label={t("audit.selected_date")}
                      value={entry.details.selectedDate}
                    />

                    <Detail
                      label={t("audit.format")}
                      value={entry.details.labelFormat}
                    />
                    <Detail
                      label={t("audit.printer")}
                      value={entry.details.printerTarget}
                    />
                    <Detail
                      label={t("audit.printer_type")}
                      value={entry.details.printerType}
                    />
                  </div>

                  {acknowledgements ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <p
                        className={
                          missing.length || repeated.length
                            ? "font-semibold text-amber-800 dark:text-amber-300"
                            : undefined
                        }
                      >
                        {t("audit.ack.confirmed", {
                          count: confirmed.length,
                          expected: confirmed.length + missing.length,
                        })}
                      </p>
                      {missing.length > 0 && !canExpandBatch && (
                        <p className="break-words">
                          {t("audit.ack.missing")} {missing.join(", ")}
                        </p>
                      )}
                      {repeated.length > 0 && !canExpandBatch && (
                        <p className="break-words">
                          {t("audit.ack.repeated")} {repeated.join(", ")}
                        </p>
                      )}
                      {!canExpandBatch &&
                        typeof acknowledgements.error === "string" && (
                          <p className="break-words">
                            {acknowledgements.error}
                          </p>
                        )}
                    </div>
                  ) : (
                    isBatchEntry && (
                      <p className={`mt-2 text-xs ${diagnosticTone}`}>
                        {t("audit.diagnostics.title")} · {diagnosticStatus}
                      </p>
                    )
                  )}

                  {entry.details.printerError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {entry.details.printerError}
                    </div>
                  )}
                </td>
              </tr>

              {isBatchDialogOpen && labelsArray && (
                <HistoryDialog
                  title={t("audit.modal.batch")}
                  subtitle={`${entry.details.partNumber ?? "—"} · ${new Date(entry.timestamp).toLocaleString(locale)}`}
                  closeLabel={t("audit.modal.close")}
                  onClose={() => setSelectedBatch(null)}
                >
                  <section className="mb-4 rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800">
                    <h4 className="text-sm font-semibold">
                      {t("audit.diagnostics.title")}
                    </h4>
                    {diagnostics || acknowledgements ? (
                      <>
                        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                          {[
                            { key: "before", value: diagnostics?.before },
                            { key: "after", value: diagnostics?.after },
                            { key: "delta", value: diagnostics?.delta },
                            { key: "sent", value: sentCount },
                          ].map(({ key, value }) => (
                            <div key={key}>
                              <dt className="text-slate-600 dark:text-slate-400">
                                {t(`audit.diagnostics.${key}`)}
                              </dt>
                              <dd className="mt-0.5 text-right text-sm font-semibold tabular-nums">
                                {readDiagnosticNumber(value)?.toLocaleString(
                                  locale,
                                ) ?? "—"}
                              </dd>
                            </div>
                          ))}
                          {acknowledgements && (
                            <div>
                              <dt className="text-slate-600 dark:text-slate-400">
                                {t("audit.ack.metric")}
                              </dt>
                              <dd className="mt-0.5 text-right text-sm font-semibold tabular-nums">
                                {confirmed.length}/
                                {confirmed.length + missing.length}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {diagnosticErrors.map(
                          ({ phase, messages }) =>
                            messages.length > 0 && (
                              <div
                                key={phase}
                                className="mt-2 text-xs text-amber-800 dark:text-amber-300"
                              >
                                <span className="font-semibold">
                                  {t(`audit.diagnostics.${phase}`)}
                                </span>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                  {messages.map((message) => (
                                    <li key={message} className="break-words">
                                      {t(message, {
                                        defaultValue: message,
                                      })}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ),
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {t("audit.diagnostics.unavailable")}
                      </p>
                    )}
                    {acknowledgements &&
                      (missing.length > 0 ||
                        repeated.length > 0 ||
                        typeof acknowledgements.error === "string") && (
                        <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                          {missing.length > 0 && (
                            <p className="break-words text-amber-800 dark:text-amber-300">
                              {t("audit.ack.missing")} {missing.join(", ")}
                            </p>
                          )}
                          {repeated.length > 0 && (
                            <p className="break-words text-amber-800 dark:text-amber-300">
                              {t("audit.ack.repeated")} {repeated.join(", ")}
                            </p>
                          )}
                          {typeof acknowledgements.error === "string" && (
                            <p className="break-words text-amber-800 dark:text-amber-300">
                              {acknowledgements.error}
                            </p>
                          )}
                        </div>
                      )}
                  </section>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {t("audit.batch_labels_title", "Batch labels")}
                        </div>

                        <div className="mt-0.5 text-xs text-slate-500">
                          {requestedQuantity}{" "}
                          {t("audit.labels_count", "labels")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {sentCount > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <FiCheckCircle size={13} />
                            {sentCount} {t("audit.sent", "Sent")}
                          </span>
                        )}

                        {requestedQuantity - sentCount > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            <FiXCircle size={13} />
                            {requestedQuantity - sentCount}{" "}
                            {t("audit.failed", "Failed")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <tr>
                            <th className="w-16 px-4 py-2.5">#</th>

                            <th className="px-4 py-2.5">
                              {t("audit.serial", "Serial")}
                            </th>

                            <th className="px-4 py-2.5">
                              {t("audit.julian_date", "Julian date")}
                            </th>

                            <th className="px-4 py-2.5">
                              {t("audit.bms_date", "BMS date")}
                            </th>

                            <th className="w-36 px-4 py-2.5">
                              {t("audit.result", "Result")}
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {labelsArray.map((label, index) => {
                            const isSent = label.deliveryState === "sent";

                            return (
                              <tr
                                key={`${entry.id}-${label.batchPosition ?? index}`}
                                className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              >
                                <td className="px-4 py-3 text-sm font-semibold text-slate-400">
                                  {label.batchPosition ?? index + 1}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                                    {label.fullSerialNumber ||
                                      label.serialNumber ||
                                      "-"}
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                  {label.julianDate || "-"}
                                </td>

                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                  {label.bmsDate || "-"}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                        isSent
                                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                          : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                      }`}
                                    >
                                      {isSent ? (
                                        <FiCheckCircle size={13} />
                                      ) : (
                                        <FiXCircle size={13} />
                                      )}

                                      {isSent
                                        ? t("audit.sent", "Sent")
                                        : t("audit.failed", "Failed")}
                                    </span>

                                    {label.printerError && (
                                      <span
                                        className="max-w-[300px] truncate text-xs text-red-500"
                                        title={label.printerError}
                                      >
                                        {label.printerError}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </HistoryDialog>
              )}
            </React.Fragment>
          );
        })}

        {entries.length === 0 && (
          <EmptyRow isLoading={isLoading} columns={6} t={t} />
        )}
      </tbody>
    </table>
  );
}

const getAuditActionLabel = (
  entry: AuditLogEntry,
  t: HistoryTableProps["t"],
): string => {
  if (
    entry.action === "PRINTER_CONFIG_CHANGED" &&
    entry.details.deletedPrinter
  ) {
    return t("audit.actions.PRINTER_DELETED");
  }
  return t(`audit.actions.${entry.action}`, entry.action);
};

function AuditHistoryTable({
  entries,
  isLoading,
  locale,
  t,
}: HistoryTableProps): React.JSX.Element {
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const details = selected?.details;
  const before = isRecord(details?.before) ? details.before : {};
  const after = isRecord(details?.after) ? details.after : {};
  const hasComparison =
    details !== undefined && "before" in details && "after" in details;
  const changedFields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ]
    .filter((key) => !/password|secret|token/i.test(key))
    .filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
  return (
    <>
      <table className="w-full min-w-[980px] table-fixed text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="w-[17%] px-4 py-3">{t("audit.time")}</th>

            <th className="w-[13%] px-4 py-3">{t("audit.event")}</th>

            <th className="w-[14%] px-4 py-3">{t("audit.user")}</th>

            <th className="w-[12%] px-4 py-3">{t("audit.category")}</th>

            <th className="w-[44%] px-4 py-3">{t("audit.details")}</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-700/30"
            >
              <td className="whitespace-nowrap py-3 pr-4 pl-12">
                <div className="font-medium">
                  {new Date(entry.timestamp).toLocaleString(locale)}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {entry.workstation} · v{entry.appVersion}
                </div>
              </td>

              <td className="px-4 py-3">
                <StatusBadge status={entry.status} t={t} />

                <div className="mt-2 font-semibold">
                  {getAuditActionLabel(entry, t)}
                </div>
              </td>

              <td className="px-4 py-3 font-medium">{entry.actor}</td>

              <td className="px-4 py-3">
                {t(`audit.category_${entry.category}`)}
              </td>

              <td className="px-4 py-3">
                <div className="flex max-w-2xl flex-wrap gap-1">
                  {Object.entries(entry.details)
                    .filter(
                      ([key]) =>
                        key !== "before" &&
                        key !== "after" &&
                        !/password|secret|token/i.test(key),
                    )
                    .map(([key, value]) => (
                      <Detail
                        key={key}
                        label={t(`audit.fields.${key}`, key)}
                        value={translateAuditDetailValue(key, value, t)}
                      />
                    ))}
                </div>
                {(entry.category === "config" ||
                  entry.category === "template") && (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setSelected(entry)}
                    className="mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-slate-700 hover:underline focus-visible:outline-2 dark:text-slate-200"
                  >
                    {t("audit.modal.changes")}{" "}
                    <FiChevronRight aria-hidden="true" size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}

          {entries.length === 0 && (
            <EmptyRow isLoading={isLoading} columns={5} t={t} />
          )}
        </tbody>
      </table>
      {selected && (
        <HistoryDialog
          title={getAuditActionLabel(selected, t)}
          subtitle={`${selected.actor} · ${new Date(selected.timestamp).toLocaleString(locale)}`}
          closeLabel={t("audit.modal.close")}
          onClose={() => setSelected(null)}
        >
          {changedFields.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-slate-100 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="w-1/4 px-4 py-2">
                      {t("audit.modal.field")}
                    </th>
                    <th scope="col" className="px-4 py-2">
                      {t("audit.modal.before")}
                    </th>
                    <th scope="col" className="px-4 py-2">
                      {t("audit.modal.after")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {changedFields.map((key) => (
                    <tr key={key} className="align-top">
                      <th
                        scope="row"
                        className="break-words px-4 py-3 font-medium"
                      >
                        {t(`audit.fields.${key}`, key)}
                      </th>
                      {[before[key], after[key]].map((value, index) => (
                        <td
                          key={index}
                          className="whitespace-pre-wrap break-words px-4 py-3"
                        >
                          {value === null || value === undefined || value === ""
                            ? "—"
                            : String(
                                translateAuditDetailValue(key, value, t),
                              ) || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t(
                hasComparison
                  ? "audit.modal.no_changes"
                  : "audit.modal.no_comparison",
              )}
            </p>
          )}
          {details?.credentialsChanged === true && (
            <p className="mt-3 text-sm">
              {t("audit.modal.credentials_changed")}
            </p>
          )}
          {details?.localPartsChanged === true && (
            <p className="mt-3 text-sm">{t("audit.modal.parts_changed")}</p>
          )}
        </HistoryDialog>
      )}
    </>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: AuditLogEntry["status"];

  t: HistoryTableProps["t"];
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
        status === "success"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {t(`audit.status_${status}`)}
    </span>
  );
}
