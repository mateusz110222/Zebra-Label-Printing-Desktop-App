import { useTranslation } from "react-i18next";
import React from "react";

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

export default function EmailInput({
  value,
  onChange,
  onEnter,
}: EmailInputProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-900 mb-1">
        {t("login.login_label")}
      </label>
      <input
        className="p-2 block w-full rounded-lg border-0 py-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 font-mono"
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("login.login_placeholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            onEnter();
          }
        }}
      />
    </div>
  );
}
