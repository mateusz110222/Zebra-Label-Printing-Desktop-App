import React, { useEffect, useMemo, useRef, useState } from "react";
import { BsFileEarmarkCode, BsPrinter, BsSave } from "react-icons/bs";
import { FiMinus, FiPlus, FiRefreshCw } from "react-icons/fi";
import { useLabelEdit } from "../hooks/useLabelEdit";
import { CriticalErrorState, LoadingWrapper } from "@renderer/components";
import { useTranslation } from "react-i18next";
import { ConfirmationModal, StatusBanner } from "@renderer/components/common";

type PendingExitAction = "close" | "reload";

export function LabelEditView(): React.JSX.Element {
  const { t } = useTranslation();
  const { data, actions } = useLabelEdit();
  const [editorWidth, setEditorWidth] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [pendingExitAction, setPendingExitAction] =
    useState<PendingExitAction | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const allowExitRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    window.api.SetLabelEditorDirty(data.isZPLLoading || data.isDirty);
  }, [data.isZPLLoading, data.isDirty]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void actions.handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);

  useEffect(() => {
    if (!data.isDirty) return;
    const preventClose = (event: BeforeUnloadEvent): void => {
      if (allowExitRef.current) return;
      event.preventDefault();
      event.returnValue = "";
      setPendingExitAction("close");
    };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [data.isDirty]);

  const requestReload = (): void => {
    if (data.isDirty) {
      setPendingExitAction("reload");
      return;
    }
    window.location.reload();
  };

  const confirmExit = (): void => {
    const action = pendingExitAction;
    allowExitRef.current = true;
    setPendingExitAction(null);
    if (action === "reload") {
      window.location.reload();
      return;
    }
    window.close();
  };

  useEffect(() => {
    document.title = `${data.isDirty ? "● " : ""}${data.cleanName || t("label_editor.title")}`;
  }, [data.cleanName, data.isDirty, t]);

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>): void => {
    resizeCleanupRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    const resize = (pointerEvent: PointerEvent): void => {
      const next = (pointerEvent.clientX / window.innerWidth) * 100;
      setEditorWidth(Math.min(72, Math.max(28, next)));
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = stop;
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  // Memoize lines and character stats to optimize editor performance
  const { lineCount, charCount } = useMemo(() => {
    return {
      lineCount: data.parsedData ? data.parsedData.split("\n").length : 0,
      charCount: data.parsedData ? data.parsedData.length : 0,
    };
  }, [data.parsedData]);

  if (data.criticalError) {
    return (
      <CriticalErrorState
        message={data.criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  return (
    <LoadingWrapper isLoading={data.isZPLLoading}>
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
        {/* Status Messages */}
        {data.uiMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md animate-fadeIn">
            <StatusBanner
              type={data.uiMessage.type}
              message={data.uiMessage.text}
              onClose={actions.dismissUiMessage}
            />
          </div>
        )}

        {/* Header Toolbar */}
        <header className="h-14 px-6 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg text-white">
              <BsFileEarmarkCode size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                {data.isDirty && (
                  <span className="mr-1 text-indigo-500">●</span>
                )}
                {t("label_editor.title")}
              </h1>
              {data.isNewTemplate ? (
                <input
                  value={data.cleanName}
                  onChange={(event) => actions.setCleanName(event.target.value)}
                  className="mt-1 w-52 bg-transparent border-b border-slate-300 dark:border-slate-600 text-[11px] text-slate-600 dark:text-slate-300 font-mono outline-none focus:border-indigo-500"
                  placeholder={t("label_formats.name_placeholder")}
                  aria-label={t("label_formats.name")}
                />
              ) : (
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest leading-none">
                  {data.cleanName}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <div className="group relative flex items-center cursor-help">
                <div className={`relative flex h-3 w-3 mr-2`}>
                  {data.isOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${data.isOnline ? "bg-green-500" : "bg-red-500"}`}
                  ></span>
                </div>
                <span
                  className={`text-sm font-medium ${data.isOnline ? "text-slate-700 dark:text-slate-200" : "text-red-600 dark:text-red-400"}`}
                >
                  {data.isOnlineLoading
                    ? t("header.checking_status")
                    : data.isOnline
                      ? t("header.printer_online")
                      : t("header.printer_offline")}
                </span>
                {data.message && (
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-max max-w-xs z-50">
                    <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs rounded py-1 px-2 shadow-lg relative">
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-800 dark:border-b-slate-700 absolute -top-1.5 left-2"></div>
                      {t(data.message)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={actions.handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-md shadow-indigo-200 dark:shadow-none font-medium text-sm active:scale-95"
              title={`${t("common.save")} (Ctrl+S)`}
            >
              <BsSave size={16} />
              <span>{t("common.save")}</span>
            </button>

            <button
              onClick={requestReload}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400"
              title={t("label_editor.refresh")}
            >
              <FiRefreshCw size={18} />
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: Code Editor */}
          <div
            className="relative flex flex-col bg-slate-900 dark:bg-[#0d1117]"
            style={{ width: `${editorWidth}%` }}
          >
            <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-white/5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {t("label_editor.code")}
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                <span>
                  {t("label_editor.lines", {
                    count: lineCount,
                  })}
                </span>
                <span>{t("label_editor.chars", { count: charCount })}</span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div
                ref={lineNumbersRef}
                aria-hidden="true"
                className="w-14 shrink-0 overflow-hidden border-r border-white/5 bg-slate-950/70 py-6 pr-3 text-right font-mono text-sm leading-relaxed text-slate-600"
              >
                {Array.from({ length: Math.max(1, lineCount) }, (_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <textarea
                value={data.parsedData}
                onChange={(e) => actions.setParsedData(e.target.value)}
                onScroll={(event) => {
                  if (lineNumbersRef.current) {
                    lineNumbersRef.current.scrollTop =
                      event.currentTarget.scrollTop;
                  }
                }}
                className="min-w-0 flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-relaxed text-indigo-300 outline-none selection:bg-indigo-500/30"
                spellCheck={false}
                placeholder={t("label_editor.placeholder")}
              />
            </div>

            <div className="absolute bottom-4 right-6 pointer-events-none opacity-20 hidden lg:block">
              <BsFileEarmarkCode size={120} className="text-white" />
            </div>
          </div>

          <button
            type="button"
            onPointerDown={beginResize}
            aria-label={t("label_editor.resize")}
            title={t("label_editor.resize")}
            className="group relative z-10 w-2 shrink-0 cursor-col-resize border-x border-slate-300 bg-slate-200 transition hover:bg-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-indigo-600"
          >
            <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400 group-hover:bg-white dark:bg-slate-600" />
          </button>

          {/* Right Panel: Preview Area */}
          <div className="flex-1 flex flex-col bg-slate-100/30 dark:bg-slate-950/30 overflow-hidden relative">
            <div className="flex items-center justify-between px-4 py-2 bg-white/50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {t("label_editor.preview")}
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  aria-label={t("label_editor.zoom_out")}
                  onClick={() => setZoom((value) => Math.max(50, value - 10))}
                  className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <FiMinus />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="min-w-12 rounded px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                  title={t("label_editor.zoom_reset")}
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  aria-label={t("label_editor.zoom_in")}
                  onClick={() => setZoom((value) => Math.min(200, value + 10))}
                  className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <FiPlus />
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 flex items-center justify-center overflow-auto custom-scrollbar">
              {data.previewError ? (
                <div
                  role="alert"
                  className="max-w-lg rounded-xl border border-red-300 bg-red-50 p-5 text-center text-red-800 shadow-sm dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                >
                  <p className="font-bold">{t("label_editor.preview_error")}</p>
                  <p className="mt-2 break-words text-sm">
                    {data.previewError}
                  </p>
                </div>
              ) : data.previewImage ? (
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 max-w-full overflow-hidden transition-transform duration-300 hover:scale-[1.01]">
                    <img
                      src={data.previewImage}
                      alt={t("label_editor.preview_alt")}
                      className="max-w-full h-auto object-contain pointer-events-none select-none transition-transform"
                      style={{ transform: `scale(${zoom / 100})` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 animate-fadeIn">
                  <div className="w-24 h-24 rounded-full bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center mb-6">
                    <BsPrinter size={48} className="opacity-20" />
                  </div>
                  <p className="text-sm font-medium">
                    {t("print_view.preview_loading")}
                  </p>
                </div>
              )}
            </div>

            {/* Scale/Info indicator */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-300 dark:border-slate-700 rounded-full shadow-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-3">
              <span>{t("label_editor.dpi")}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
              <span>{t("label_editor.label_size_auto")}</span>
            </div>
          </div>
        </main>
        <ConfirmationModal
          isOpen={pendingExitAction !== null}
          title={t("label_editor.unsaved_title")}
          message={t("label_editor.unsaved_message")}
          confirmLabel={t(
            pendingExitAction === "reload"
              ? "label_editor.discard_and_reload"
              : "label_editor.discard_and_close",
          )}
          cancelLabel={t("label_editor.continue_editing")}
          onConfirm={confirmExit}
          onCancel={() => setPendingExitAction(null)}
        />
      </div>
    </LoadingWrapper>
  );
}
