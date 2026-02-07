import React from "react";
import { useTranslation } from "react-i18next";
import { FiLock } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

export default function NoConfigCard(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
          <FiLock className="text-4xl text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">
          {t("config_view.no_config_title")}
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
          {t("config_view.no_config_message")}
        </p>
        <button
          onClick={() => navigate("/login")}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all active:scale-95"
        >
          <FiLock className="mr-2" />
          {t("config_view.login_to_configure")}
        </button>
      </div>
    </div>
  );
}
