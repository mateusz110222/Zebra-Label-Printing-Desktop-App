import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@renderer/context/AuthContext";
import { FiActivity, FiFileText, FiPrinter, FiRepeat, FiShield, FiSliders } from "react-icons/fi";

export function SidebarView(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoggedIn, CanEdit } = useAuth();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await window.api.GetAppVersion();
        if (isMounted && version) {
          setAppVersion(version);
        }
      } catch (error) {
        console.error("Failed to fetch app version:", error);
      }
    };
    fetchVersion();
    return () => {
      isMounted = false;
    };
  }, []);

  const menuItems = [
    {
      name: t("sidebar.print_label"),
      path: "/",
      icon: FiPrinter,
      protected: false,
    },
    {
      name: t("sidebar.templates"),
      path: "/templates",
      icon: FiFileText,
      protected: false,
    },
    {
      name: t("sidebar.config"),
      path: "/config",
      icon: FiSliders,
      protected: false,
    },
    {
      name: t("sidebar.reprint"),
      path: "/reprint",
      icon: FiRepeat,
      protected: true,
    },
    {
      name: t("sidebar.history"),
      path: "/history",
      icon: FiShield,
      protected: true,
    },
    {
      name: t("sidebar.health"),
      path: "/health",
      icon: FiActivity,
      protected: false,
    },
  ];

  return (
    <aside className="w-[clamp(11rem,20vw,15rem)] bg-slate-900 dark:bg-slate-950 text-white flex flex-col h-full border-r border-slate-700/50 shadow-2xl z-20">
      <div className="h-16 flex items-center justify-center border-b border-slate-800 dark:border-slate-900 bg-slate-900 dark:bg-slate-950 sticky top-0 z-30 shadow-sm px-4">
        <h1 className="text-base lg:text-lg font-bold tracking-wider text-slate-100 truncate">
          {t("sidebar.app_title")}
        </h1>
      </div>

      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const isDisabled = item.protected && (!isLoggedIn || !CanEdit);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => isDisabled && e.preventDefault()}
              aria-disabled={isDisabled}
              className={({ isActive }) =>
                `flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium
                ${
                  isDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none text-slate-500"
                    : isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30 translate-x-1"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/80 dark:hover:bg-slate-900 hover:translate-x-1"
                }`
              }
            >
              <Icon className="text-lg shrink-0" />
              <span className="truncate">{item.name}</span>
              {isDisabled && (
                <span className="ml-auto text-[10px] uppercase font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                  {t("sidebar.locked")}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 dark:border-slate-900 text-xs text-slate-600 dark:text-slate-500 text-center">
        &copy; {new Date().getFullYear()} BorgWarner
        <br />
        {t("sidebar.dev_info")}
        {appVersion && (
          <div className="mt-2 opacity-50 font-mono text-xs">v{appVersion}</div>
        )}
      </div>
    </aside>
  );
}
