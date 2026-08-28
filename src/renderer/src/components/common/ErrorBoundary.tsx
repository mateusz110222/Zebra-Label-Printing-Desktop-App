import { extractError } from "@renderer/utils/errorUtils";
import React from "react";
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from "react-error-boundary";
import { useTranslation } from "react-i18next";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = extractError(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-6 font-sans">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-800/50 p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mb-4">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {t(
            "common.unexpected_error",
            "Wystąpił nieoczekiwany błąd aplikacji",
          )}
        </h1>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t(
            "common.error_boundary_description",
            "Aplikacja napotkała problem podczas renderowania widoku.",
          )}
        </p>

        {message && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 rounded-lg p-3 text-xs font-mono text-red-800 dark:text-red-300 text-left overflow-auto max-h-32 mb-6 break-words">
            {message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={resetErrorBoundary}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            {t("common.try_again", "Spróbuj ponownie")}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg transition-colors"
          >
            {t("common.reload_app", "Przeładuj aplikację")}
          </button>
        </div>
      </div>
    </div>
  );
}

const handleError = (
  error: unknown,
  info: { componentStack?: string | null },
): void => {
  console.error("[ErrorBoundary caught an error]:", error, info);
  try {
    if (window.api?.LogRendererError) {
      const { message } = extractError(error);
      const stack = error instanceof Error ? error.stack : undefined;
      void window.api.LogRendererError({
        message,
        stack,
        componentStack: info?.componentStack || undefined,
      });
    }
  } catch {
    // ignore
  }
};

export function AppErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ReactErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
      {children}
    </ReactErrorBoundary>
  );
}
