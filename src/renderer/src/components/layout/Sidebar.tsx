import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@renderer/context/AuthContext";
import { FcLock } from "react-icons/fc";
import React from "react";

export default function Sidebar(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { isLoggedIn, CanEdit } = useAuth();

  const menuItems = [
    { name: t("sidebar.print_label"), path: "/", protected: false },
    { name: t("sidebar.templates"), path: "/templates", protected: false },
    { name: t("sidebar.config"), path: "/config", protected: false },
    { name: t("sidebar.history"), path: "/history", protected: true },
    { name: t("sidebar.reprint"), path: "/reprint", protected: true },
  ];

  return (
    <aside className="w-[clamp(10.5rem,20vw,14rem)] bg-slate-800 text-white flex flex-col h-full border-r border-slate-700">
      <div className="h-16 flex items-center justify-center border-b border-slate-700">
        <h1 className="text-lg lg:text-xl font-bold tracking-wider">
          {t("sidebar.app_title")}
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const isDisabled = item.protected && (!isLoggedIn || !CanEdit);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => isDisabled && e.preventDefault()}
              aria-disabled={isDisabled}
              className={({ isActive }) =>
                `flex items-center w-full text-left px-2 py-3 rounded-md transition-colors
                ${
                  isDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none bg-slate-800 text-slate-500"
                    : isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "hover:bg-slate-700 text-slate-300 hover:text-white"
                }`
              }
            >
              <span>{item.name}</span>
              {isDisabled && <FcLock className="pl-2 text-2xl" />}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700 text-xs text-slate-400 text-center">
        <div className="flex justify-center gap-2 mb-2">
          <button
            onClick={() => i18n.changeLanguage("pl")}
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
          >
            PL
          </button>
          <button
            onClick={() => i18n.changeLanguage("en")}
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
          >
            EN
          </button>
        </div>
        &copy; {new Date().getFullYear()} {t("sidebar.app_name")}
        <br />
        {t("sidebar.dev_info")}
      </div>
    </aside>
  );
}
