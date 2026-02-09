import React from "react";
import { useTranslation } from "react-i18next";

interface CriticalErrorProps {
  message: string;
  onRetry: () => void;
  title?: string;
}

export default function CriticalErrorState({
  message,
  onRetry,
  title,
}: CriticalErrorProps): React.JSX.Element {
  const { t } = useTranslation();
  const displayTitle = title || t("config_view.critical_error");

  return (
    <div className="p-8 font-sans text-slate-800 dark:text-slate-200 min-h-full flex items-center justify-center bg-gray-50 dark:bg-slate-950 transition-colors duration-200">
      <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 rounded-2xl p-8 text-center shadow-xl dark:shadow-red-900/5 transition-all">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 mb-4 ring-8 ring-red-50 dark:ring-red-900/10">
          <svg
            className="h-8 w-8 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {displayTitle}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{message}</p>
        <button
          onClick={onRetry}
          className="w-full px-4 py-3 bg-red-600 dark:bg-red-600/90 text-white font-semibold rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition shadow-lg shadow-red-600/20 active:scale-[0.98]"
        >
          {t("print_view.Try_again")}
        </button>
      </div>
    </div>
  );
}
