import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiLock,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiTag,
} from "react-icons/fi";
import type { PrinterConfig } from "@renderer/types";

interface Props {
  printers: PrinterConfig[];
  formats: string[];
  assignments: Record<string, string>;
  isProcessing: boolean;
  readOnly?: boolean;
  onSave: (assignments: Record<string, string>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

const getPrinterName = (printer: PrinterConfig): string =>
  printer.name ||
  (printer.type === "IP"
    ? `${printer.ip}:${printer.port ?? 9100}`
    : printer.type === "COM"
      ? printer.comPort || "COM"
      : printer.usbPrinterName || "USB");

const sanitizeAssignments = (
  assignments: Record<string, string>,
  formats: string[],
  printers: PrinterConfig[],
): Record<string, string> => {
  const availableFormats = new Set(formats);
  const availablePrinters = new Set(printers.map(getPrinterName));
  return Object.fromEntries(
    Object.entries(assignments).filter(
      ([format, printer]) =>
        availableFormats.has(format) && availablePrinters.has(printer),
    ),
  );
};

export default function FormatPrinterAssignmentsCard({
  printers,
  formats,
  assignments,
  isProcessing,
  readOnly = false,
  onSave,
  onRefresh,
  onDirtyChange,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    sanitizeAssignments(assignments, formats, printers),
  );
  const [query, setQuery] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [bulkPrinter, setBulkPrinter] = useState("");

  const sortedFormats = useMemo(
    () =>
      [...formats].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      ),
    [formats],
  );
  const validDraft = sanitizeAssignments(draft, formats, printers);
  const unassigned = useMemo(
    () => sortedFormats.filter((format) => !validDraft[format]),
    [sortedFormats, validDraft],
  );
  const assignedCount = sortedFormats.length - unassigned.length;
  const visibleFormats = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortedFormats.filter(
      (format) =>
        (!onlyUnassigned || !validDraft[format]) &&
        (!normalizedQuery ||
          format.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [onlyUnassigned, query, sortedFormats, validDraft]);
  const savedAssignments = sanitizeAssignments(assignments, formats, printers);
  const isDirty =
    JSON.stringify(Object.entries(validDraft).sort()) !==
    JSON.stringify(Object.entries(savedAssignments).sort());

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const assignPrinter = (format: string, printerName: string): void => {
    setDraft((current) => {
      const next = { ...current };
      if (printerName) next[format] = printerName;
      else delete next[format];
      return next;
    });
  };

  const applyBulkPrinter = (): void => {
    if (!bulkPrinter) return;
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(
        visibleFormats.map((format) => [format, bulkPrinter]),
      ),
    }));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t("printer_routing.title")}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {t("printer_routing.subtitle")}
            </p>
          </div>
          {readOnly ? (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              <FiLock /> {t("printer_routing.read_only")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
            >
              <FiRefreshCw /> {t("printer_routing.refresh_formats")}
            </button>
          )}
        </div>

        {printers.length === 0 ? (
          <p className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
            {t("printer_routing.no_printers")}
          </p>
        ) : formats.length === 0 ? (
          <p className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
            {t("printer_routing.no_formats")}
          </p>
        ) : (
          <div className="mt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <FiTag className="text-lg text-indigo-500" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("printer_routing.formats_count")}
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {sortedFormats.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <FiPrinter className="text-lg text-indigo-500" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("printer_routing.printers_count")}
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {printers.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <FiCheckCircle className="text-lg text-emerald-500" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("printer_routing.assigned_count")}
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {assignedCount}/{sortedFormats.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50 lg:grid-cols-[minmax(14rem,1fr)_auto_minmax(14rem,0.75fr)_auto] lg:items-center">
                <label className="relative block">
                  <span className="sr-only">{t("printer_routing.search")}</span>
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("printer_routing.search_placeholder")}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={onlyUnassigned}
                    onChange={(event) =>
                      setOnlyUnassigned(event.target.checked)
                    }
                    className="h-4 w-4 accent-indigo-600"
                  />
                  {t("printer_routing.only_unassigned")}
                </label>
                {!readOnly && (
                  <>
                    <select
                      value={bulkPrinter}
                      onChange={(event) => setBulkPrinter(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900"
                    >
                      <option value="">
                        {t("printer_routing.bulk_printer")}
                      </option>
                      {printers.map((printer) => {
                        const printerName = getPrinterName(printer);
                        return (
                          <option key={printerName} value={printerName}>
                            {printerName}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      disabled={!bulkPrinter || visibleFormats.length === 0}
                      onClick={applyBulkPrinter}
                      className="rounded-lg border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                    >
                      {t("printer_routing.apply_visible", {
                        count: visibleFormats.length,
                      })}
                    </button>
                  </>
                )}
              </div>
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)_2.5rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 sm:grid">
                <span>{t("printer_routing.format_column")}</span>
                <span>{t("printer_routing.printer_column")}</span>
                <span className="sr-only">{t("printer_routing.status")}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {visibleFormats.map((format) => {
                  const isAssigned = Boolean(draft[format]);
                  return (
                    <div
                      key={format}
                      className="grid grid-cols-1 items-center gap-3 bg-white px-4 py-3 transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/40 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)_2.5rem] sm:gap-4 sm:px-5"
                    >
                      <div className="min-w-0">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 sm:hidden">
                          {t("printer_routing.format_column")}
                        </span>
                        <span className="inline-block max-w-full truncate rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-sm font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          {format}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 sm:hidden">
                          {t("printer_routing.printer_column")}
                        </span>
                        {readOnly ? (
                          <div
                            className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                              isAssigned
                                ? "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                                : "bg-indigo-50/50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-300"
                            }`}
                          >
                            <FiPrinter className="shrink-0 text-indigo-500" />
                            <span className="truncate">
                              {draft[format] ||
                                t("printer_routing.not_assigned")}
                            </span>
                          </div>
                        ) : (
                          <select
                            value={draft[format] || ""}
                            onChange={(event) =>
                              assignPrinter(format, event.target.value)
                            }
                            className={`w-full rounded-lg border px-3 py-2.5 text-sm font-medium shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-900 ${
                              isAssigned
                                ? "border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:text-slate-100"
                                : "border-indigo-300 bg-indigo-50/50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/20 dark:text-indigo-300"
                            }`}
                          >
                            <option value="">
                              {t("printer_routing.select_printer")}
                            </option>
                            {printers.map((printer) => {
                              const printerName = getPrinterName(printer);
                              return (
                                <option key={printerName} value={printerName}>
                                  {printerName}
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </div>
                      <div
                        className="hidden justify-center sm:flex"
                        title={t(
                          isAssigned
                            ? "printer_routing.assigned"
                            : "printer_routing.not_assigned",
                        )}
                      >
                        {isAssigned ? (
                          <FiCheckCircle className="text-xl text-emerald-500" />
                        ) : (
                          <FiAlertCircle className="text-xl text-indigo-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleFormats.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t("printer_routing.no_filter_results")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 flex flex-col gap-4 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:-mx-8 sm:-mb-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            {unassigned.length > 0 ? (
              <p className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-300">
                <FiAlertCircle className="shrink-0 text-lg" />
                {t("printer_routing.unassigned_count", {
                  count: unassigned.length,
                })}
              </p>
            ) : (
              formats.length > 0 && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <FiCheckCircle className="shrink-0 text-lg" />
                  {t("printer_routing.all_assigned")}
                </p>
              )
            )}
          </div>
          {readOnly ? (
            <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 sm:ml-auto">
              <FiLock className="shrink-0" />
              {t("printer_routing.read_only_hint")}
            </p>
          ) : (
            <button
              type="button"
              disabled={isProcessing || printers.length === 0}
              onClick={() => void onSave(validDraft)}
              className="w-full rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
            >
              {isProcessing
                ? t("config_view.saving")
                : isDirty
                  ? t("printer_routing.save")
                  : t("printer_routing.saved")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
