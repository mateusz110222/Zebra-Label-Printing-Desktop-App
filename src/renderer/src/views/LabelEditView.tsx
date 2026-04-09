import React from "react";
import { BsFileEarmarkCode, BsPrinter, BsSave } from "react-icons/bs";
import { useLabelEdit } from "../hooks/useLabelEdit";
import { CriticalErrorState, LoadingWrapper } from "@renderer/components";
import { useTranslation } from "react-i18next";
import { StatusBanner } from "@renderer/components/common";

export function LabelEditView(): React.JSX.Element {
  const { t } = useTranslation();
  const { data, actions } = useLabelEdit();

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
    <LoadingWrapper isLoading={data.isLoading}>
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
        {/* Status Messages */}
        {data.uiMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md animate-fadeIn">
            <StatusBanner
              type={data.uiMessage.type}
              message={data.uiMessage.text}
              onClose={() => {}}
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
              <h1 className="text-sm font-bold tracking-tight">ZPL Designer</h1>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest leading-none">
                {data.cleanName || "Nowy szablon"}
              </p>
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
                  {data.isLoading
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
              title={t("common.save")}
            >
              <BsSave size={18} />
              <span>{t("common.save")}</span>
            </button>

            <button
              onClick={() => window.location.reload()}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400"
              title="Odśwież"
            >
              <BsPrinter size={20} />
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: Code Editor */}
          <div className="w-1/2 flex flex-col bg-slate-900 dark:bg-[#0d1117] relative border-r border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-white/5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                ZPL Code
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                <span>Lines: {data.parsedData.split("\n").length}</span>
                <span>Chars: {data.parsedData.length}</span>
              </div>
            </div>

            <textarea
              value={data.parsedData}
              onChange={(e) => actions.setParsedData(e.target.value)}
              className="flex-1 w-full p-6 bg-transparent text-indigo-300 font-mono text-sm leading-relaxed resize-none outline-none custom-scrollbar selection:bg-indigo-500/30"
              spellCheck={false}
              placeholder="Wpisz kod ZPL..."
            />

            <div className="absolute bottom-4 right-6 pointer-events-none opacity-20 hidden lg:block">
              <BsFileEarmarkCode size={120} className="text-white" />
            </div>
          </div>

          {/* Right Panel: Preview Area */}
          <div className="flex-1 flex flex-col bg-slate-100/30 dark:bg-slate-950/30 overflow-hidden relative">
            <div className="flex items-center px-4 py-2 bg-white/50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Live Preview
              </span>
            </div>

            <div className="flex-1 p-8 flex items-center justify-center overflow-auto custom-scrollbar">
              {data.previewImage ? (
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 max-w-full overflow-hidden transition-transform duration-300 hover:scale-[1.01]">
                    <img
                      src={data.previewImage}
                      alt="ZPL Preview"
                      className="max-w-full h-auto object-contain pointer-events-none select-none"
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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-full shadow-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-3">
              <span>203 DPI</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
              <span>Label Size Auto</span>
            </div>
          </div>
        </main>
      </div>
    </LoadingWrapper>
  );
}
