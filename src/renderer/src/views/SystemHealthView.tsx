import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LoadingWrapper,
  SystemHealthViewSkeleton,
} from "@renderer/components/common";
import { extractError } from "@renderer/utils/errorUtils";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiCopy,
  FiRefreshCw,
} from "react-icons/fi";

const statusColor = (ok: boolean): string =>
  ok
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";

const StatusPill = ({ ok }: { ok: boolean }): React.JSX.Element => {
  const { t } = useTranslation();
  if (ok) {
    return (
      <FiCheckCircle
        className="text-xl text-emerald-500"
        aria-label={t("health.ok")}
        title={t("health.ok")}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${statusColor(ok)}`}
    >
      <FiAlertCircle /> {t("health.problem")}
    </span>
  );
};

const CopyableValue = ({ value }: { value: string }): React.JSX.Element => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard write may fail if document is not focused or permission denied
    }
  };

  return (
    <div className="mt-1 flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900/60">
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={value}>
        {value || "—"}
      </span>
      {value && (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
          aria-label={t(copied ? "health.copied" : "health.copy")}
          title={t(copied ? "health.copied" : "health.copy")}
        >
          {copied ? <FiCheckCircle /> : <FiCopy />}
        </button>
      )}
    </div>
  );
};

export function SystemHealthView(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState({ computerTimeMs: 0, monotonicMs: 0 });
  const [databaseClock, setDatabaseClock] = useState<{
    serverTimeMs: number;
    responseDelayMs: number;
    receivedAtMonoMs: number;
  } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const response = await window.api.GetSystemHealth();
      if (!response.status || !response.data) {
        setError(t(response.message || "health.load_error"));
        return;
      }
      const receivedAtMs = Date.now();
      const receivedAtMonoMs = performance.now();
      setDatabaseClock(
        response.data.database.serverTimeMs === null
          ? null
          : {
              serverTimeMs: response.data.database.serverTimeMs,
              responseDelayMs: Math.max(
                0,
                receivedAtMs - response.data.database.computerTimeMs,
              ),
              receivedAtMonoMs,
            },
      );
      setClock({ computerTimeMs: receivedAtMs, monotonicMs: receivedAtMonoMs });
      setHealth(response.data);
    } catch (caught) {
      const { message: errMessage } = extractError(caught);
      setError(errMessage || t("health.load_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(
      () =>
        setClock({
          computerTimeMs: Date.now(),
          monotonicMs: performance.now(),
        }),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const databaseTimeMs = databaseClock
    ? databaseClock.serverTimeMs +
      databaseClock.responseDelayMs +
      (clock.monotonicMs - databaseClock.receivedAtMonoMs)
    : null;
  const formatTime = (timeMs: number): string =>
    new Date(timeMs).toLocaleString(i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  const showTimeError =
    health?.database.reachable &&
    (health.database.timeDriftMs === null ||
      health.database.timeDriftMs > 30_000);

  const overallClass =
    health?.overallStatus === "healthy"
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
      : health?.overallStatus === "warning"
        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
        : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40";
  const displayedPrinters = health
    ? health.printers?.length
      ? health.printers
      : [health.printer]
    : [];
  const readyPrinterCount = displayedPrinters.filter(
    (printer) => printer.ready,
  ).length;

  return (
    <LoadingWrapper
      isLoading={loading && !health}
      skeleton={<SystemHealthViewSkeleton />}
    >
      <div className="min-h-full p-4 sm:p-6 lg:p-8 text-slate-800 dark:text-slate-100">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {t("health.title")}
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
                {t("health.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} />
              {loading ? t("health.refreshing") : t("health.refresh")}
            </button>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          {health && (
            <>
              <div className={`mb-5 rounded-xl border p-4 ${overallClass}`}>
                <div className="text-sm font-semibold">
                  {t("health.overall")}
                </div>
                <div className="mt-1 text-xl font-bold">
                  {t(
                    health.overallStatus === "error"
                      ? "health.critical"
                      : `health.${health.overallStatus}`,
                  )}
                </div>
                <div className="mt-1 text-xs opacity-70">
                  {t("health.checked_at")}:{" "}
                  {new Date(health.checkedAt).toLocaleString()}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold">{t("health.database")}</h2>
                    <StatusPill ok={health.database.status} />
                  </div>
                  <dl className="space-y-3 text-sm">
                    {!health.database.status && (
                      <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/60 dark:text-red-200">
                        <dt className="font-semibold">
                          {health.database.message.map((message) => (
                            <div key={message}>{t(message)}</div>
                          ))}
                        </dt>

                        {health.database.rawError && (
                          <dd className="mt-2 whitespace-pre-line break-all font-mono text-xs opacity-80">
                            {health.database.rawError}
                          </dd>
                        )}
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500">{t("health.target")}</dt>
                      <dd className="break-all font-mono">
                        {health.database.configuredHost || "—"} /{" "}
                        {health.database.configuredDatabase || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("health.server")}</dt>
                      <dd>{health.database.serverHostname || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("health.engine")}</dt>
                      <dd>
                        {health.database.engine || "—"} ·{" "}
                        {health.database.engineOk
                          ? t("health.transactional")
                          : t("health.not_transactional")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">
                        {t("health.time_drift")}
                      </dt>
                      <dd>
                        {health.database.timeDriftMs === null
                          ? "—"
                          : `${Math.round(health.database.timeDriftMs / 1000)} s`}
                      </dd>
                    </div>
                    {showTimeError && (
                      <>
                        <div>
                          <dt className="text-slate-500">
                            {t("health.computer_time")}
                          </dt>
                          <dd className="font-mono tabular-nums">
                            {formatTime(clock.computerTimeMs)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">
                            {t("health.database_time")}
                          </dt>
                          <dd className="font-mono tabular-nums">
                            {databaseTimeMs === null
                              ? "—"
                              : formatTime(databaseTimeMs)}
                          </dd>
                        </div>
                      </>
                    )}
                    <div>
                      <dt className="text-slate-500">
                        {t("health.duplicates")}
                      </dt>
                      <dd className="break-all">
                        {health.database.duplicateFamilies.length === 0
                          ? t("health.none")
                          : health.database.duplicateFamilies
                              .map((item) => `${item.name} (${item.count})`)
                              .join(", ")}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold">
                        {t(
                          displayedPrinters.length > 1
                            ? "health.printers"
                            : "health.printer",
                        )}
                      </h2>
                      {displayedPrinters.length > 1 && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {t("health.printers_ready", {
                            ready: readyPrinterCount,
                            total: displayedPrinters.length,
                          })}
                        </p>
                      )}
                    </div>
                    <StatusPill
                      ok={
                        displayedPrinters.length > 0 &&
                        readyPrinterCount === displayedPrinters.length
                      }
                    />
                  </div>
                  {displayedPrinters.length > 1 ? (
                    <div className="space-y-3">
                      {displayedPrinters.map((printer) => (
                        <article
                          key={`${printer.name}-${printer.type}-${printer.target}`}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-semibold">
                                  {printer.name || printer.target}
                                </h3>
                                {printer.active && (
                                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    {t("health.active")}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                                {printer.type}: {printer.target}
                              </p>
                            </div>
                            <StatusPill ok={printer.ready} />
                          </div>

                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            <div>
                              <span className="text-slate-500">
                                {t("health.connection")}:{" "}
                              </span>
                              <span className="font-medium">
                                {t(
                                  printer.reachable
                                    ? "health.reachable"
                                    : "health.unreachable",
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">
                                {t("health.device_status")}:{" "}
                              </span>
                              <span className="font-medium">
                                {t(printer.message)}
                              </span>
                            </div>
                          </div>

                          {printer.data && (
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {t("health.queue")}:{" "}
                              {printer.data.formatsInBuffer} ·{" "}
                              {t("health.labels_remaining")}:{" "}
                              {printer.data.labelsRemaining}
                            </p>
                          )}
                          {printer.rawError && (
                            <p className="mt-2 break-all rounded-lg bg-red-50 p-2 font-mono text-xs text-red-800 dark:bg-red-950/60 dark:text-red-200">
                              {printer.rawError}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <dl className="space-y-3 text-sm">
                      {!health.printer.ready && health.printer.rawError && (
                        <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/60 dark:text-red-200">
                          <dt className="font-semibold">
                            {t(health.printer.message)}
                          </dt>
                          <dd className="mt-1 break-all font-mono text-xs">
                            {health.printer.rawError}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-slate-500">{t("health.target")}</dt>
                        <dd className="font-mono">
                          {health.printer.type}: {health.printer.target}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          {t("health.connection")}
                        </dt>
                        <dd>
                          {t(
                            health.printer.reachable
                              ? "health.reachable"
                              : "health.unreachable",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          {t("health.device_status")}
                        </dt>
                        <dd>{t(health.printer.message)}</dd>
                      </div>
                      {health.printer.data && (
                        <div>
                          <dt className="text-slate-500">
                            {t("health.queue")}
                          </dt>
                          <dd>
                            {health.printer.data.formatsInBuffer} /{" "}
                            {t("health.labels_remaining")}:{" "}
                            {health.printer.data.labelsRemaining}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold">{t("health.templates")}</h2>
                    <StatusPill ok={health.templates.status} />
                  </div>
                  <dl className="space-y-3 text-sm">
                    {!health.templates.status && (
                      <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/60 dark:text-red-200">
                        <dt className="font-semibold">
                          {t(health.templates.message)}
                        </dt>
                        {health.templates.rawError && (
                          <dd className="mt-1 break-all font-mono text-xs">
                            {health.templates.rawError}
                          </dd>
                        )}
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500">
                        {t("health.template_count")}
                      </dt>
                      <dd className="text-2xl font-bold">
                        {health.templates.count}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("health.path")}</dt>
                      <dd>
                        <CopyableValue value={health.templates.path} />
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold">{t("health.audit")}</h2>
                    <StatusPill ok={health.audit.status} />
                  </div>
                  <dl className="space-y-3 text-sm">
                    {!health.audit.status && (
                      <div>
                        <dt className="text-slate-500">
                          {t("health.storage_status")}
                        </dt>
                        <dd>{t(health.audit.message)}</dd>
                      </div>
                    )}
                    {health.audit.rawError && (
                      <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/60 dark:text-red-200">
                        <dt className="font-semibold">
                          {t("health.write_error_details")}
                        </dt>
                        <dd className="mt-1 break-all font-mono text-xs">
                          {health.audit.rawError}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500">{t("health.path")}</dt>
                      <dd>
                        <CopyableValue value={health.audit.path} />
                      </dd>
                    </div>
                    {health.audit.lastFailureAt && (
                      <div>
                        <dt className="text-slate-500">
                          {t("health.last_failure")}
                        </dt>
                        <dd>
                          {new Date(
                            health.audit.lastFailureAt,
                          ).toLocaleString()}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </LoadingWrapper>
  );
}
