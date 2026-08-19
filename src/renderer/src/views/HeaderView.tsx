import { NavLink } from "react-router-dom";
import { useAuth } from "@renderer/context/AuthContext";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { SettingsMenuView } from "@renderer/views/SettingsMenuView";
import { BsPrinter } from "react-icons/bs";
import { extractError } from "@renderer/utils/errorUtils";

export function HeaderView(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoggedIn, login, logout } = useAuth();

  const [isOnline, SetisOnline] = useState<boolean>(false);
  const [message, Setmessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [rawError, setRawError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const GetPrinterStatus = async (): Promise<void> => {
      try {
        const response = await window.api.GetPrinterStatus();

        if (!isMounted) return;

        SetisOnline(response.status);

        Setmessage(
          response.message ||
            (response.status ? "header.connected" : "header.disconnected"),
        );

        setRawError(response.rawError ?? "");
      } catch (error) {
        const extractedError = extractError(error);

        if (!isMounted) return;

        SetisOnline(false);
        Setmessage("backend.printer.status_error");

        setRawError(extractedError.message);

        console.error("[HeaderView] GetPrinterStatus failed:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    GetPrinterStatus();

    const intervalId = setInterval(GetPrinterStatus, 300000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [t]);

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-600 px-6 py-3 shadow-sm dark:shadow-slate-900/50 z-50 relative">
      <div className="flex justify-between items-center h-full">
        {/* LEWA STRONA: Status Drukarki */}
        <div className="flex items-center">
          <div className="group relative flex items-center cursor-help">
            <BsPrinter size={20} className="mr-2" />
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
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-3 hidden group-hover:block w-max max-w-md z-50">
                <div className="relative bg-slate-800 dark:bg-slate-700 text-white text-xs rounded-md py-2 px-3 shadow-lg">
                  <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-800 dark:border-b-slate-700" />

                  <div>{t(message)}</div>

                  {rawError && (
                    <div className="mt-1 pt-1 border-t border-slate-600 text-slate-300 font-mono break-all">
                      {rawError}
                    </div>
                  )}
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
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {login}
              </span>
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
