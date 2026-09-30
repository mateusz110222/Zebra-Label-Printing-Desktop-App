import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@renderer/context/AuthContext";
import { FiActivity, FiCode, FiFileText, FiPrinter, FiRepeat, FiShield, FiSliders } from "react-icons/fi";

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
    <aside className="z-20 flex h-full w-16 shrink-0 flex-col border-r border-slate-700/50 bg-slate-900 text-white shadow-2xl dark:bg-slate-950 xl:w-60">
      <div className="h-16 flex items-center justify-center border-b border-slate-800 dark:border-slate-900 bg-slate-900 dark:bg-slate-950 sticky top-0 z-30 shadow-sm px-4">
        <span className="font-bold text-indigo-400 xl:hidden">LP</span>
        <h1 className="hidden truncate text-lg font-bold tracking-wider text-slate-100 xl:block">
          {t("sidebar.app_title")}
        </h1>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto p-2 xl:p-3">
        {menuItems.map((item) => {
          const isDisabled = item.protected && (!isLoggedIn || !CanEdit);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => isDisabled && e.preventDefault()}
              aria-disabled={isDisabled}
              aria-label={item.name}
              title={item.name}
              className={({ isActive }) =>
                `flex items-center justify-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium xl:justify-start xl:px-3.5
                ${
                  isDisabled
                    ? "cursor-not-allowed text-slate-600"
                    : isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/80 dark:hover:bg-slate-900"
                }`
              }
            >
              <Icon className="text-lg shrink-0" />
              <span className="hidden truncate xl:block">{item.name}</span>
              {isDisabled && (
                <span className="ml-auto hidden rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 xl:block">
                  {t("sidebar.locked")}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-2 xl:p-3 dark:border-slate-900 bg-slate-900/60 dark:bg-slate-950/60">
        <div
          title={`${t("sidebar.created_by")}: Mateusz Zieliński`}
          className="flex items-center justify-center xl:justify-start gap-2.5 rounded-xl border border-slate-800 bg-slate-800/40 p-2 text-left transition-colors dark:border-slate-800/70 dark:bg-slate-900/40"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <FiCode className="text-sm" />
          </div>
          <div className="hidden min-w-0 flex-1 xl:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t("sidebar.created_by")}
            </p>
            <p className="truncate text-xs font-bold text-slate-100">
              Mateusz Zieliński
            </p>
          </div>
        </div>
        <div className="mt-2 hidden text-center text-[10px] text-slate-500 xl:block">
          &copy; {new Date().getFullYear()} BorgWarner
          {appVersion && <span className="ml-1.5 font-mono opacity-70">v{appVersion}</span>}
        </div>
      </div>
    </aside>
  );
}
