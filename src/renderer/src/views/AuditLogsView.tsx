import React, { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiDownload, FiPrinter, FiRefreshCw, FiSearch, FiShield } from "react-icons/fi";
import { useAuth } from "@renderer/context/AuthContext";
import { AuditLogsViewSkeleton, LoadingWrapper } from "@renderer/components/common";

const PAGE_SIZE = 50;
type HistoryView = "print" | "audit";

const Detail = ({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.JSX.Element | null => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="inline-flex gap-1 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span className="font-medium text-slate-800 dark:text-slate-100">
        {String(value)}
      </span>
    </span>
  );
};

export function AuditLogsView(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { isLoggedIn, CanEdit } = useAuth();
  const [activeView, setActiveView] = useState<HistoryView>("print");
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
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState("");

  const query: AuditLogQuery = {
    scope: activeView,
    category: activeView === "print" ? "print" : category,
    status: statusFilter,
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const loadLogs = useCallback(async (): Promise<void> => {
    if (!isLoggedIn || !CanEdit) return;
    setIsLoading(true);
    setMessage("");
    try {
      const response = await window.api.GetAuditLogs(query);
      if (!response.status || !response.data) {
        setMessage(t(response.message || "backend.audit.read_error"));
        return;
      }
      setEntries(response.data.entries);
      setTotal(response.data.total);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("backend.audit.read_error"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    CanEdit,
    activeView,
    category,
    dateFrom,
    dateTo,
    isLoggedIn,
    page,
    search,
    statusFilter,
    t,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const changeView = (view: HistoryView): void => {
    setActiveView(view);
    setPage(1);
    setEntries([]);
    setMessage("");
  };

  const applySearch = (event: FormEvent): void => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const exportLogs = async (): Promise<void> => {
    setIsExporting(true);
    setMessage("");
    try {
      const response = await window.api.ExportAuditLogs({ ...query, page: 1 });
      if (!response.status) {
        setMessage(t(response.message || "backend.audit.export_error"));
      } else if (!response.canceled) {
        setMessage(t("audit.export_success"));
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("backend.audit.export_error"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!isLoggedIn || !CanEdit) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <h2 className="text-xl font-bold">
            {t("audit.access_denied_title")}
          </h2>
          <p className="mt-2 text-sm">{t("audit.access_denied_message")}</p>
        </div>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isPrintView = activeView === "print";

  return (
    <LoadingWrapper
      isLoading={isLoading && entries.length === 0 && !message}
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
                isPrintView
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
                !isPrintView
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

          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">
                {t(isPrintView ? "audit.print_title" : "audit.audit_title")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t(
                  isPrintView ? "audit.print_subtitle" : "audit.audit_subtitle",
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
            className={`mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 ${isPrintView ? "xl:grid-cols-5" : "xl:grid-cols-6"} dark:border-slate-700 dark:bg-slate-800`}
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
            {!isPrintView && (
              <select
                value={category}
                onChange={(event) => {
                  setPage(1);
                  setCategory(event.target.value as AuditLogQuery["category"]);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="all">{t("audit.category_all")}</option>
                <option value="auth">{t("audit.category_auth")}</option>
                <option value="config">{t("audit.category_config")}</option>
                <option value="template">{t("audit.category_template")}</option>
                <option value="system">{t("audit.category_system")}</option>
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as AuditLogQuery["status"]);
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
            <div className="overflow-x-auto">
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
              <span className="text-slate-500">
                {t("audit.total", { count: total })}
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

function PrintHistoryTable({
  entries,
  isLoading,
  locale,
  t,
}: HistoryTableProps): React.JSX.Element {
  return (
    <table className="w-full min-w-[1250px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3">{t("audit.time")}</th>
          <th className="px-4 py-3">{t("audit.result")}</th>
          <th className="px-4 py-3">{t("audit.user")}</th>
          <th className="px-4 py-3">{t("audit.part")}</th>
          <th className="px-4 py-3">{t("audit.serial")}</th>
          <th className="px-4 py-3">{t("audit.dates_format")}</th>
          <th className="px-4 py-3">{t("audit.printer")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
        {entries.map((entry) => (
          <tr
            key={entry.id}
            className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-700/30"
          >
            <td className="whitespace-nowrap px-4 py-3">
              <div className="font-medium">
                {new Date(entry.timestamp).toLocaleString(locale)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {entry.workstation} · v{entry.appVersion}
              </div>
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={entry.status} t={t} />
              <div className="mt-2 text-xs font-medium">
                {t(`audit.actions.${entry.action}`, entry.action)}
              </div>
            </td>
            <td className="px-4 py-3 font-medium">{entry.actor}</td>
            <td className="px-4 py-3">
              <div className="font-semibold">{entry.details.partNumber}</div>
              <div className="mt-1 max-w-xs text-xs text-slate-500">
                {entry.details.description}
              </div>
            </td>
            <td className="px-4 py-3">
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
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="font-medium">{entry.details.printerTarget}</div>
              <div className="mt-1 text-xs text-slate-500">
                {entry.details.printerType}
              </div>
              {entry.details.printerError && (
                <div className="mt-2 text-xs text-red-600">
                  {entry.details.printerError}
                </div>
              )}
            </td>
          </tr>
        ))}
        {entries.length === 0 && (
          <EmptyRow isLoading={isLoading} columns={7} t={t} />
        )}
      </tbody>
    </table>
  );
}

function AuditHistoryTable({
  entries,
  isLoading,
  locale,
  t,
}: HistoryTableProps): React.JSX.Element {
  return (
    <table className="w-full min-w-[950px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3">{t("audit.time")}</th>
          <th className="px-4 py-3">{t("audit.event")}</th>
          <th className="px-4 py-3">{t("audit.user")}</th>
          <th className="px-4 py-3">{t("audit.category")}</th>
          <th className="px-4 py-3">{t("audit.details")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
        {entries.map((entry) => (
          <tr
            key={entry.id}
            className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-700/30"
          >
            <td className="whitespace-nowrap px-4 py-3">
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
                {t(`audit.actions.${entry.action}`, entry.action)}
              </div>
            </td>
            <td className="px-4 py-3 font-medium">{entry.actor}</td>
            <td className="px-4 py-3">
              {t(`audit.category_${entry.category}`)}
            </td>
            <td className="px-4 py-3">
              <div className="flex max-w-2xl flex-wrap gap-1">
                {Object.entries(entry.details)
                  .filter(([key]) => !/password|secret|token/i.test(key))
                  .map(([key, value]) => (
                    <Detail
                      key={key}
                      label={t(`audit.fields.${key}`, key)}
                      value={value}
                    />
                  ))}
              </div>
            </td>
          </tr>
        ))}
        {entries.length === 0 && (
          <EmptyRow isLoading={isLoading} columns={5} t={t} />
        )}
      </tbody>
    </table>
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
