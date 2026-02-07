import React from "react";
import { useTranslation } from "react-i18next";
import { FiPrinter } from "react-icons/fi";

interface SubmitButtonProps {
  isLoading: boolean;
  isDisabled: boolean;
  loadingText?: string;
  text?: string;
}

export default function SubmitButton({
  isLoading,
  isDisabled,
  loadingText,
  text,
}: SubmitButtonProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <button
      type="submit"
      disabled={isDisabled || isLoading}
      className={`w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold shadow-sm transition-all ${!isDisabled && !isLoading
          ? "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95"
          : "bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed"
        }`}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {loadingText || t("common.loading")}
        </>
      ) : (
        <>
          <FiPrinter className="mr-2" />
          {text || t("common.submit")}
        </>
      )}
    </button>
  );
}
