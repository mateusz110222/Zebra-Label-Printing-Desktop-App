import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiDownload, FiUpload } from "react-icons/fi";
import { ConfirmationModal, StatusBanner } from "../common";

export default function SettingsBackupCard({
  disabled,
}: {
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [action, setAction] = useState<"export" | "import" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(() => {
    const imported = sessionStorage.getItem("settings-backup-imported");
    return imported
      ? { type: "success", text: "settings_backup.import_success" }
      : null;
  });
  useEffect(() => {
    sessionStorage.removeItem("settings-backup-imported");
  }, []);
  const run = async (): Promise<void> => {
    if (!action) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await (action === "export"
        ? window.api.ExportSettingsBackup()
        : window.api.ImportSettingsBackup());
      if (!result.canceled) {
        if (action === "import" && result.status) {
          sessionStorage.setItem("settings-backup-imported", "true");
          window.location.reload();
          return;
        }
        setMessage({
          type: result.status ? "success" : "error",
          text: result.message || `settings_backup.${action}_error`,
        });
      }
    } catch {
      setMessage({ type: "error", text: `settings_backup.${action}_error` });
    } finally {
      setBusy(false);
      setAction(null);
    }
  };
  return (
    <section className="mb-5" aria-labelledby="settings-backup-title">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-xs">
        <h3
          id="settings-backup-title"
          className="font-medium text-slate-500 dark:text-slate-400"
        >
          {t("settings_backup.title")}
        </h3>
        <div className="flex flex-wrap justify-end gap-2">
          {(["export", "import"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled || busy}
              onClick={() => setAction(item)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 font-medium text-slate-700 enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:enabled:hover:bg-slate-800"
            >
              {item === "export" ? (
                <FiDownload aria-hidden="true" />
              ) : (
                <FiUpload aria-hidden="true" />
              )}
              {t(`settings_backup.${item}`)}
            </button>
          ))}
        </div>
      </div>
      {disabled && (
        <p className="mt-2 text-right text-xs text-slate-500 dark:text-slate-400">
          {t("settings_backup.unsaved")}
        </p>
      )}
      {message && (
        <div className="mt-3">
          <StatusBanner
            type={message.type}
            message={t(message.text)}
            onClose={() => setMessage(null)}
          />
        </div>
      )}
      <ConfirmationModal
        isOpen={action !== null}
        title={t(`settings_backup.${action || "export"}`)}
        message={t(`settings_backup.${action || "export"}_confirm`)}
        confirmLabel={t(`settings_backup.${action || "export"}`)}
        cancelLabel={t("common.cancel")}
        isProcessing={busy}
        onConfirm={() => void run()}
        onCancel={() => setAction(null)}
      />
    </section>
  );
}
