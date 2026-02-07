import { NavLink } from "react-router-dom";
import { useAuth } from "@renderer/context/AuthContext";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { SettingsMenuView } from "@renderer/views/SettingsMenuView";

export function HeaderView(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoggedIn, login, logout } = useAuth();

  const [isOnline, SetisOnline] = useState<boolean>(false);
  const [message, Setmessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const GetPrinterStatus = async (): Promise<void> => {
      try {
        if (!window.electron) return;
        const response =
          await window.electron.ipcRenderer.invoke("Get-PrinterStatus");
        if (isMounted) {
          SetisOnline(response.status);
          Setmessage(response.message || (response.status ? "header.connected" : "header.disconnected"));
          setIsLoading(false);
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          SetisOnline(false);
          Setmessage("header.status_error");
          setIsLoading(false);
        }
      }
    };

    GetPrinterStatus();

    const intervalId = setInterval(GetPrinterStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-600 px-6 py-3 shadow-sm dark:shadow-slate-900/50 z-50 relative">
      <div className="flex justify-between items-center h-full">
        {/* LEWA STRONA: Status Drukarki */}
        <div className="flex items-center">
          <div className="group relative flex items-center cursor-help">
            <div className={`relative flex h-3 w-3 mr-2`}>
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? "bg-green-500" : "bg-red-500"}`}
              ></span>
            </div>
            <span
              className={`text-sm font-medium ${isOnline ? "text-slate-700 dark:text-slate-200" : "text-red-600 dark:text-red-400"}`}
            >
              {isLoading
                ? t("header.checking_status")
                : isOnline
                  ? t("header.printer_online")
                  : t("header.printer_offline")}
            </span>
            {message && (
              <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-max max-w-xs z-50">
                <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs rounded py-1 px-2 shadow-lg relative">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-800 dark:border-b-slate-700 absolute -top-1.5 left-2"></div>
                  {t(message)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PRAWA STRONA: User + SettingsMenu */}
        <div className="flex items-center gap-4">
          {isLoggedIn && (
            <div className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block border-r border-slate-300 dark:border-slate-600 pr-4">
              {t("header.logged_in_as")}:{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{login}</span>
            </div>
          )}

          {isLoggedIn ? (
            <button
              onClick={logout}
              className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {t("header.logout")}
            </button>
          ) : (
            <NavLink
              to="/login"
              className="bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500 px-5 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {t("header.login_btn")}
            </NavLink>
          )}

          <SettingsMenuView />
        </div>
      </div>
    </header>
  );
}
