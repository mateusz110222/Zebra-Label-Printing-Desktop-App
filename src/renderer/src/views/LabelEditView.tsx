import React from "react";
import { BsFileEarmarkCode, BsPrinter } from "react-icons/bs";
import { IoClose } from "react-icons/io5";
import { useLabelEdit } from "../hooks/useLabelEdit";
import { CriticalErrorState, LoadingWrapper } from "@renderer/components";
import { useTranslation } from "react-i18next";

export function LabelEditView(): React.JSX.Element {
  const { t } = useTranslation();

  const { data } = useLabelEdit();

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
      <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10 draggable">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <BsFileEarmarkCode size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">
                {data.cleanName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                ZPL Preview
              </p>
            </div>
          </div>
          <button
            onClick={() => window.close()}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <IoClose size={24} />
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: Preview Placeholder */}
          <div className="flex-1 p-8 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-900/50">
            <div className="w-full max-w-md aspect-[4/6] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
              <BsPrinter size={48} className="mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2"></h3>
              <p className="text-sm max-w-xs">
                <img
                  src={data.previewImage}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </p>
            </div>
          </div>

          {/* Right Panel: Code Viewer */}
          <div className="w-1/3 min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-slate-900 flex flex-col">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Source Code (ZPL)
              </span>
              <span className="text-xs text-slate-600 font-mono">
                {data.parsedData.length} chars
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                <code>{data.parsedData}</code>
              </pre>
            </div>
          </div>
        </main>
      </div>
    </LoadingWrapper>
  );
}
