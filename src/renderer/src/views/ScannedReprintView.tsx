import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiMaximize, FiPrinter, FiSearch } from "react-icons/fi";
import { LabelPreview } from "../components/print";
import { StatusBanner } from "../components/common";
import type { UiMessage } from "../types";

type ScannedLabel = NonNullable<
  Awaited<ReturnType<Window["api"]["LookupReprintSerial"]>>["data"]
>;

export function ScannedReprintView({
  onPrintingChange,
}: {
  onPrintingChange: (printing: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [label, setLabel] = useState<ScannedLabel | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [message, setMessage] = useState<UiMessage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requests = useRef({ id: 0, mounted: false, printing: false });

  useEffect(() => {
    const state = requests.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      state.id++;
    };
  }, []);

  const lookup = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!input.trim() || isLookingUp || requests.current.printing) return;
    const request = ++requests.current.id;
    const current = (): boolean =>
      requests.current.mounted && request === requests.current.id;
    setLabel(null);
    setPreview(null);
    setMessage(null);
    setIsLookingUp(true);
    try {
      const response = await window.api.LookupReprintSerial(input);
      if (!current()) return;
      if (!response.status || !response.data) {
        setMessage({
          type: "error",
          text: t(response.message || "reprint.scan_lookup_failed"),
          details: response.rawError,
        });
        return;
      }
      setLabel(response.data);
      const image = await window.api.GetPrintPreview({
        part: response.data.part,
        date: response.data.date,
        serialNumber: response.data.serialNumber,
      });
      if (!current()) return;
      if (image.status && image.data) setPreview(image.data);
      else
        setMessage({
          type: "error",
          text: t(image.message || "label_editor.preview_error"),
          details: image.rawError,
        });
    } catch (error) {
      if (current())
        setMessage({
          type: "error",
          text: t("reprint.scan_lookup_failed"),
          details: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (requests.current.mounted) {
        // Input changes invalidate the response but must still unlock the form.
        setIsLookingUp(false);
      }
    }
  };

  const print = async (): Promise<void> => {
    if (!label || isLookingUp || requests.current.printing) return;
    const now = new Date();
    if (
      (now.getHours() === 23 && now.getMinutes() >= 55) ||
      (now.getHours() === 0 && now.getMinutes() <= 5)
    ) {
      setMessage({
        type: "error",
        text: t("print_view.printing_blocked_midnight"),
      });
      return;
    }
    requests.current.printing = true;
    setIsPrinting(true);
    onPrintingChange(true);
    setMessage(null);
    try {
      const response = await window.api.ReprintLabel({
        part: label.part,
        date: label.date,
        serialNumber: label.serialNumber,
        quantity: 1,
      });
      if (!requests.current.mounted) return;
      setMessage({
        type:
          response.status && response.auditPersisted !== false
            ? "success"
            : "error",
        text: t(
          response.message ||
            (response.status
              ? "backend.reprint.success"
              : "backend.print.error"),
        ),
        details:
          response.auditPersisted === false
            ? t(
                response.auditStatusMessage ||
                  "backend.audit.storage_unavailable",
              )
            : response.rawError ||
              (response.status ? label.fullSerialNumber : undefined),
      });
      if (response.status) {
        setLabel(null);
        setPreview(null);
        setInput("");
      }
    } catch (error) {
      if (requests.current.mounted)
        setMessage({
          type: "error",
          text: t("backend.print.error"),
          details: error instanceof Error ? error.message : String(error),
        });
    } finally {
      requests.current.printing = false;
      onPrintingChange(false);
      if (requests.current.mounted) {
        setIsPrinting(false);
        window.setTimeout(() => {
          if (requests.current.mounted) inputRef.current?.focus();
        }, 0);
      }
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mb-7">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">
          <FiMaximize />
          {t("reprint.method_scan")}
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("reprint.scan_title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {t("reprint.scan_subtitle")}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <form
          onSubmit={(event) => void lookup(event)}
          className="border-b border-slate-100 p-5 dark:border-slate-700 sm:p-8"
        >
          <label
            htmlFor="reprint-scan"
            className="mb-3 block text-sm font-bold"
          >
            {t("reprint.scan_input")}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <FiMaximize
                size={22}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-300"
              />
              <input
                id="reprint-scan"
                ref={inputRef}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={input}
                disabled={isPrinting}
                onChange={(event) => {
                  requests.current.id++;
                  setInput(event.target.value);
                  setLabel(null);
                  setPreview(null);
                  setMessage(null);
                }}
                placeholder="PC66849999A262780009"
                aria-describedby="reprint-scan-hint"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-4 pl-12 pr-4 font-mono text-base tracking-wide text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white sm:text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLookingUp || isPrinting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <FiSearch />
              {t(
                isLookingUp ? "reprint.scan_searching" : "reprint.scan_lookup",
              )}
            </button>
          </div>
          <p
            id="reprint-scan-hint"
            className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400"
          >
            {t("reprint.scan_hint")}
          </p>
        </form>

        <div
          className="p-5 sm:p-8"
          aria-live="polite"
          aria-busy={isLookingUp || isPrinting}
        >
          {message && (
            <StatusBanner
              type={message.type}
              message={message.text}
              details={message.details}
              onClose={() => setMessage(null)}
            />
          )}
          {label ? (
            <div>
              <div className="mb-5 flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300">
                <FiCheckCircle />
                {t("reprint.scan_found")}
              </div>
              <p className="mb-2 break-all font-mono text-xl font-bold tracking-wide sm:text-2xl">
                {label.fullSerialNumber}
              </p>
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                {label.part.Part_Description}
              </p>
              <dl className="mb-6 grid grid-cols-2 gap-5 rounded-xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/50 sm:grid-cols-3">
                {[
                  [t("print_view.part_selection"), label.part.Part_Number],
                  [t("reprint.date"), label.date],
                  [t("reprint.serialnumber"), label.serialNumber],
                  [t("reprint.scan_template"), label.part.Label_Format],
                  [t("reprint.scan_printer"), label.assignedPrinter],
                  [t("reprint.scan_quantity"), "1"],
                ].map(([title, value]) => (
                  <div key={title} className="min-w-0">
                    <dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                      {title}
                    </dt>
                    <dd className="break-all font-mono text-sm font-semibold">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <LabelPreview
                isLoading={isLookingUp}
                previewImage={preview}
                notice={t("reprint.scan_single_copy")}
              />
              <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 dark:border-slate-700 sm:flex-row">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("reprint.scan_single_copy")}
                </p>
                <button
                  type="button"
                  disabled={isPrinting || isLookingUp}
                  onClick={() => void print()}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-600 disabled:cursor-wait disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500 sm:w-auto"
                >
                  <FiPrinter />
                  {t(
                    isPrinting ? "print_view.printing" : "reprint.print_label",
                  )}
                </button>
              </div>
            </div>
          ) : (
            !message && (
              <div className="flex flex-col items-center px-4 py-14 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-500">
                  <FiMaximize size={38} />
                </div>
                <p className="text-base font-semibold">
                  {t(
                    isLookingUp
                      ? "reprint.scan_searching"
                      : "reprint.scan_waiting",
                  )}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {t("reprint.scan_empty_hint")}
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
