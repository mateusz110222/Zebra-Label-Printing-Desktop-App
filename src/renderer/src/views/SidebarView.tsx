import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@renderer/context/AuthContext";

export function SidebarView(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoggedIn, CanEdit } = useAuth();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await window.electron.ipcRenderer.invoke("get-app-version");
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
    { name: t("sidebar.print_label"), path: "/", protected: false },
    { name: t("sidebar.templates"), path: "/templates", protected: false },
    { name: t("sidebar.config"), path: "/config", protected: false },
    { name: t("sidebar.history"), path: "/history", protected: true },
    { name: t("sidebar.reprint"), path: "/reprint", protected: true },
  ];

  return (
    <aside className="w-[clamp(10.5rem,20vw,14rem)] bg-slate-900 dark:bg-slate-950 text-white flex flex-col h-full border-r border-slate-700/50 shadow-2xl z-20">
      <div className="h-16 flex items-center justify-center border-b border-slate-800 dark:border-slate-900 bg-slate-900 dark:bg-slate-950 sticky top-0 z-30 shadow-sm">
        <h1 className="text-lg lg:text-xl font-bold tracking-wider text-slate-100">
          {t("sidebar.app_title")}
        </h1>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const isDisabled = item.protected && (!isLoggedIn || !CanEdit);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => isDisabled && e.preventDefault()}
              aria-disabled={isDisabled}
              className={({ isActive }) =>
                `flex items-center w-full text-left px-3 py-3 rounded-lg transition-all duration-200 text-sm font-medium
                ${isDisabled
                  ? "opacity-40 cursor-not-allowed pointer-events-none text-slate-500"
                  : isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20 translate-x-1"
                    : "text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-slate-900 hover:translate-x-1"
                }`
              }
            >
              {item.name}
              {isDisabled && (
                <span className="ml-auto text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
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
          <div className="mt-2 opacity-50 font-mono text-xs">
            v{appVersion}
          </div>
        )}
      </div>
    </aside>
  );
}
