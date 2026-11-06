import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { StatusBanner } from "../common";
import { parseMonitoringConfiguration } from "../../utils/parseMonitoringConfiguration";

const empty = { url: "", stationId: "", synthetic: false };
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

export default function MonitoringConfigCard({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pastedConfiguration, setPastedConfiguration] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    key: string;
  }>();

  useEffect(() => {
    let active = true;
    void window.api
      .GetMonitoringConfig()
      .then((result) => {
        if (!active) return;
        if (!result.status) {
          setMessage({
            type: "error",
            key: result.message ?? "monitoring.read_error",
          });
        } else if (result.data) {
          const { url, stationId, synthetic, hasToken } = result.data;
          setDraft({ url, stationId, synthetic });
          setSaved({ url, stationId, synthetic });
          setHasToken(hasToken);
        }
      })
      .catch(() => {
        if (active) setMessage({ type: "error", key: "monitoring.read_error" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const identityChanged =
    draft.url !== saved.url ||
    draft.stationId !== saved.stationId ||
    draft.synthetic !== saved.synthetic;
  const dirty = identityChanged || token.length > 0;
  useEffect(() => {
    onDirtyChange(dirty || pastedConfiguration.length > 0);
    return () => onDirtyChange(false);
  }, [dirty, pastedConfiguration, onDirtyChange]);

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const result = await window.api.SaveMonitoringConfig({ ...draft, token });
      if (result.status) {
        setSaved(draft);
        setHasToken(true);
        setToken("");
        setPastedConfiguration("");
        setShowPaste(false);
        setMessage({ type: "success", key: "monitoring.saved" });
      } else {
        setMessage({
          type: "error",
          key: result.message ?? "monitoring.save_error",
        });
      }
    } catch {
      setMessage({ type: "error", key: "monitoring.save_error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <header className="rounded-t-xl bg-slate-50 px-5 py-4 dark:bg-slate-900/40 sm:px-6">
        <h2 className="text-lg font-semibold">{t("monitoring.title")}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("monitoring.description")}
        </p>
      </header>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        {message && (
          <StatusBanner
            type={message.type}
            message={t(message.key)}
            onClose={() => setMessage(undefined)}
          />
        )}
        {loading ? (
          <p role="status" className="text-sm">
            {t("monitoring.loading")}
          </p>
        ) : (
          <form onSubmit={save} className="space-y-5">
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600"
              onClick={() => setShowPaste((open) => !open)}
            >
              {t("monitoring.paste_configuration")}
            </button>
            {showPaste && (
              <div className="space-y-2">
                <label htmlFor="monitoring-paste" className="block text-sm">
                  {t("monitoring.paste_hint")}
                </label>
                <textarea
                  id="monitoring-paste"
                  value={pastedConfiguration}
                  onChange={(event) =>
                    setPastedConfiguration(event.target.value)
                  }
                  maxLength={4096}
                  rows={6}
                  disabled={saving}
                  className={inputClass}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  disabled={saving || !pastedConfiguration.trim()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600"
                  onClick={() => {
                    try {
                      const config =
                        parseMonitoringConfiguration(pastedConfiguration);
                      setDraft({
                        url: config.url,
                        stationId: config.stationId,
                        synthetic: config.synthetic,
                      });
                      setToken(config.token);
                      setPastedConfiguration("");
                      setShowPaste(false);
                      setMessage({
                        type: "success",
                        key: "monitoring.paste_success",
                      });
                    } catch {
                      setMessage({ type: "error", key: "monitoring.invalid" });
                    }
                  }}
                >
                  {t("monitoring.apply_configuration")}
                </button>
              </div>
            )}
            <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
              <label className="min-w-0 space-y-1.5 text-sm font-medium">
                <span className="block">{t("monitoring.url")}</span>
                <input
                  type="url"
                  required
                  maxLength={2048}
                  className={inputClass}
                  value={draft.url}
                  placeholder="http://10.142.11.66:8083"
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                />
              </label>
              <label className="min-w-0 space-y-1.5 text-sm font-medium">
                <span className="block">{t("monitoring.station")}</span>
                <input
                  required
                  pattern="[a-zA-Z0-9_\-]{1,64}"
                  maxLength={64}
                  className={inputClass}
                  value={draft.stationId}
                  placeholder="audi-label-01"
                  onChange={(event) =>
                    setDraft({ ...draft, stationId: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span className="block">{t("monitoring.token")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={32}
                  maxLength={256}
                  required={!hasToken || identityChanged}
                  className={inputClass}
                  value={token}
                  placeholder={
                    hasToken && !identityChanged
                      ? t("monitoring.token_saved")
                      : undefined
                  }
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <label className="flex items-start gap-3 pt-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={draft.synthetic}
                  onChange={(event) =>
                    setDraft({ ...draft, synthetic: event.target.checked })
                  }
                />
                <span>
                  <span className="block font-medium">
                    {t("monitoring.synthetic")}
                  </span>
                  <span className="block text-slate-600 dark:text-slate-300">
                    {t("monitoring.synthetic_hint")}
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t("monitoring.restart_hint")}
              </p>
              <button
                type="submit"
                disabled={!dirty || saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {t(saving ? "monitoring.saving" : "common.save")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
