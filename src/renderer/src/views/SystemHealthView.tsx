import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingWrapper, SystemHealthViewSkeleton } from "@renderer/components/common";

const statusColor = (ok: boolean): string =>
  ok
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";

const StatusPill = ({ ok }: { ok: boolean }): React.JSX.Element => {
  const { t } = useTranslation();
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusColor(ok)}`}
    >
      {t(ok ? "health.ok" : "health.problem")}
    </span>
  );
};

export function SystemHealthView(): React.JSX.Element {
  const { t } = useTranslation();
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const response = await window.api.GetSystemHealth();
      if (!response.status || !response.data) {
        setError(t(response.message || "health.load_error"));
        return;
      }
      setHealth(response.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("health.load_error"),
      );
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

  const overallClass =
    health?.overallStatus === "healthy"
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
      : health?.overallStatus === "warning"
        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
        : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40";

  return (
    <LoadingWrapper
      isLoading={loading && !health}
      skeleton={<SystemHealthViewSkeleton />}
    >
      <div className="min-h-full p-4 sm:p-6 lg:p-8 text-slate-800 dark:text-slate-100">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{t("health.title")}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("health.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? t("common.loading") : t("health.refresh")}
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
                  {t(`health.${health.overallStatus}`)}
                </div>
                <div className="mt-1 text-xs opacity-70">
                  {t("health.checked_at")}:{" "}
                  {new Date(health.checkedAt).toLocaleString()}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
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
                    <h2 className="font-bold">{t("health.printer")}</h2>
                    <StatusPill ok={health.printer.ready} />
                  </div>
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
                        <dt className="text-slate-500">{t("health.queue")}</dt>
                        <dd>
                          {health.printer.data.formatsInBuffer} /{" "}
                          {t("health.labels_remaining")}:{" "}
                          {health.printer.data.labelsRemaining}
                        </dd>
                      </div>
                    )}
                  </dl>
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
                      <dd className="break-all font-mono text-xs">
                        {health.templates.path}
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
                    <div>
                      <dt className="text-slate-500">
                        {t("health.storage_status")}
                      </dt>
                      <dd>{t(health.audit.message)}</dd>
                    </div>
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
                      <dd className="break-all font-mono text-xs">
                        {health.audit.path}
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
