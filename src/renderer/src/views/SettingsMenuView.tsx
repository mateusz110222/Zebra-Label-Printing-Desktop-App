import React, { useRef } from "react";
import useSettingsMenu from "@renderer/hooks/useSettingsMenu";
import SettingsOpenButton from "@renderer/components/settings/SettingsOpenButton";
import UpdateButtonsAndMessage from "@renderer/components/settings/UpdateDownloadButton";
import { useTranslation } from "react-i18next";
import { TbLoader2 } from "react-icons/tb";
import { FiSun, FiMoon, FiMonitor, FiGlobe } from "react-icons/fi";
import { useTheme } from "@renderer/context/ThemeContext";

export function SettingsMenuView(): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, actions } = useSettingsMenu(menuRef);
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const hasNewVersion =
    data.githubVersion !== "-" &&
    data.githubVersion !== data.localVersion &&
    data.githubVersion !== "Error";

  return (
    <div className="relative" ref={menuRef}>
      <SettingsOpenButton
        updateStatus={data.updateStatus}
        onClick={() => actions.setIsMenuOpen((prevState) => !prevState)}
      />

      {data.isMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          {/* NAGŁÓWEK */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              {t("settings.settings")}
            </h3>
          </div>

          <div className="p-4 space-y-4">
            {/* SEKCJA WERSJI */}
            <div className="text-xs space-y-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("settings.installed")}
                </span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                  {data.localVersion}
                </span>
              </div>
              <div className="w-full h-px bg-slate-200/50 dark:bg-slate-700" />
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">{t("settings.latest")}</span>

                <span
                  className={`font-mono transition-colors duration-200 ${hasNewVersion
                    ? "text-emerald-600 dark:text-emerald-400 font-bold drop-shadow-sm"
                    : "text-slate-500 dark:text-slate-400"
                    }`}
                >
                  {data.updateStatus === "checking" ? (
                    <TbLoader2 className="h-3 w-3 animate-spin text-slate-400" />
                  ) : (
                    data.githubVersion
                  )}
                </span>
              </div>
            </div>

            {/* LANGUAGE SWITCHER */}
            <div className="space-y-2">
              <span className="text-sm text-gray-600 dark:text-slate-300 flex items-center gap-2">
                <FiGlobe className="w-3.5 h-3.5" />
                {t("settings.language", "Język")}
              </span>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("pl")}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${i18n.language === "pl"
                    ? "bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  Polski
                </button>
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("en")}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${i18n.language === "en"
                    ? "bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* TOGGLE AUTO-UPDATE */}
            <div
              className="flex items-center justify-between group cursor-pointer"
              onClick={actions.toggleAutoUpdate}
            >
              <span className="text-sm text-gray-600 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {t("settings.auto_update")}
              </span>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${data.autoUpdate ? "bg-emerald-500" : "bg-gray-200 dark:bg-slate-600"
                  }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${data.autoUpdate ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            {/* THEME TOGGLE */}
            <div className="space-y-2">
              <span className="text-sm text-gray-600 dark:text-slate-300">
                {t("settings.theme", "Motyw")}
              </span>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${theme === "light"
                    ? "bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  <FiSun className="w-3.5 h-3.5" />
                  {t("settings.theme_light", "Jasny")}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${theme === "dark"
                    ? "bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  <FiMoon className="w-3.5 h-3.5" />
                  {t("settings.theme_dark", "Ciemny")}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${theme === "system"
                    ? "bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  <FiMonitor className="w-3.5 h-3.5" />
                  {t("settings.theme_system", "Auto")}
                </button>
              </div>
            </div>

            <hr className="border-gray-100 dark:border-slate-700" />

            <div className="flex flex-col gap-2">
              <UpdateButtonsAndMessage
                data={data}
                ReadyOnClick={actions.handleRestart}
                UpdateOnClick={actions.handleCheckForUpdates}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}