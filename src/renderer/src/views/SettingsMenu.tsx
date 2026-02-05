import React, { useRef } from "react";
import useSettingsMenu from "@renderer/hooks/useSettingsMenu";
import SettingsOpenButton from "@renderer/components/settings/SettingsOpenButton";
import UpdateButtonsAndMessage from "@renderer/components/settings/UpdateDownloadButton";
import { useTranslation } from "react-i18next";
import { TbLoader2 } from "react-icons/tb";

export default function SettingsMenu(): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, actions } = useSettingsMenu(menuRef);
  const { t } = useTranslation();

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
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          {/* NAGŁÓWEK */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">
              {t("settings.settings")}
            </h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">
              v{data.localVersion}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* SEKCJA WERSJI */}
            <div className="text-xs space-y-2 bg-slate-50 p-3 rounded-md border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">
                  {t("settings.installed")}
                </span>
                <span className="font-mono text-slate-700 font-medium">
                  {data.localVersion}
                </span>
              </div>
              <div className="w-full h-px bg-slate-200/50" />
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t("settings.latest")}</span>

                {/* ZAKTUALIZOWANY SPAN */}
                <span
                  className={`font-mono transition-colors duration-200 ${
                    hasNewVersion
                      ? "text-emerald-600 font-bold drop-shadow-sm" // Styl dla nowej wersji
                      : "text-slate-500" // Styl standardowy
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

            {/* TOGGLE AUTO-UPDATE */}
            <div
              className="flex items-center justify-between group cursor-pointer"
              onClick={actions.toggleAutoUpdate}
            >
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                {t("settings.auto_update")}
              </span>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  data.autoUpdate ? "bg-emerald-500" : "bg-gray-200"
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

            <hr className="border-gray-100" />

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
