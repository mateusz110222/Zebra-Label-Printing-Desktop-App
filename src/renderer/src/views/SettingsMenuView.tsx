import React, { useRef } from "react";
import useSettingsMenu from "@renderer/hooks/useSettingsMenu";
import SettingsOpenButton from "@renderer/components/settings/SettingsOpenButton";
import UpdateButtonsAndMessage from "@renderer/components/settings/UpdateDownloadButton";
import { useTranslation } from "react-i18next";
import { TbLoader2 } from "react-icons/tb";
import { FiGlobe, FiMonitor, FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "@renderer/hooks/useThemeContext";

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

      <div
        className={`absolute right-0 top-full mt-2 w-72 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl transition-all duration-200 ease-out dark:border-slate-700 dark:bg-slate-800 z-50 ${
          data.isMenuOpen
            ? "visible translate-y-0 scale-100 opacity-100 pointer-events-auto"
            : "invisible -translate-y-2 scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* NAGŁÓWEK */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
            {t("settings.settings")}
          </h3>
        </div>

        <div className="space-y-4 p-4">
          {/* SEKCJA WERSJI */}
          <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                {t("settings.installed")}
              </span>
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {data.localVersion}
              </span>
            </div>

            <div className="h-px w-full bg-slate-200/50 dark:bg-slate-700" />

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                {t("settings.latest")}
              </span>

              <span
                className={`font-mono transition-colors duration-200 ${hasNewVersion ? "font-bold text-emerald-600 drop-shadow-sm dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}
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
            <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              <FiGlobe className="h-3.5 w-3.5" />
              {t("settings.language")}
            </span>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => actions.handleLanguageChange("pl")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  i18n.language === "pl"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("settings.language_pl")}
              </button>

              <button
                type="button"
                onClick={() => actions.handleLanguageChange("en")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  i18n.language === "en"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("settings.language_en")}
              </button>
            </div>
          </div>

          {/* TOGGLE AUTO-UPDATE */}
          <div
            className="group flex cursor-pointer items-center justify-between"
            onClick={actions.toggleAutoUpdate}
          >
            <span className="text-sm text-gray-600 transition-colors group-hover:text-gray-900 dark:text-slate-300 dark:group-hover:text-white">
              {t("settings.auto_update")}
            </span>

            <button
              type="button"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                data.autoUpdate
                  ? "bg-emerald-500"
                  : "bg-gray-200 dark:bg-slate-600"
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  data.autoUpdate ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* THEME TOGGLE */}
          <div className="space-y-2">
            <span className="text-sm text-gray-600 dark:text-slate-300">
              {t("settings.theme")}
            </span>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  theme === "light"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiSun className="h-3.5 w-3.5" />
                {t("settings.theme_light")}
              </button>

              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  theme === "dark"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiMoon className="h-3.5 w-3.5" />
                {t("settings.theme_dark")}
              </button>

              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  theme === "system"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiMonitor className="h-3.5 w-3.5" />
                {t("settings.theme_system")}
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
    </div>
  );
}
