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
      aria-busy={isLoading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors sm:w-auto ${
        isLoading
          ? "cursor-wait bg-indigo-700 text-white"
          : isDisabled
            ? "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-600 dark:text-slate-400"
            : "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
      }`}
    >
      {isLoading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border-2 border-white/35 border-t-white motion-safe:animate-spin"
          />
          {loadingText || t("common.loading")}
        </>
      ) : (
        <>
          <FiPrinter aria-hidden="true" className="size-4 shrink-0" />
          {text || t("common.submit")}
        </>
      )}
    </button>
  );
}
