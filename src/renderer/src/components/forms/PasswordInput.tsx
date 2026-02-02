import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash } from "react-icons/fa";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

export default function PasswordInput({
  value,
  onChange,
  onEnter,
}: PasswordInputProps): React.JSX.Element {
  const [visible, setVisible] = useState<boolean>(false);
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-900 mb-1">
        {t("login.password_label")}
      </label>

      <div className="relative">
        <input
          className="p-2 block w-full rounded-lg border-0 py-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 font-mono pr-10"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("login.password_placeholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              onEnter();
            }
          }}
        />
        <div
          className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-slate-500 hover:text-slate-700"
          onClick={() => setVisible(!visible)}
        >
          {visible ? <FaEye /> : <FaEyeSlash />}
        </div>
      </div>
    </div>
  );
}
