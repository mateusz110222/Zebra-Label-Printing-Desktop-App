import React from "react";
import { useTranslation } from "react-i18next";
import { FiWifi } from "react-icons/fi";
import { LuPlug2 } from "react-icons/lu";

type ConnectionType = "IP" | "COM" | "USB";

interface ConnectionTabsProps {
  activeTab: ConnectionType;
  onTabChange: (tab: ConnectionType) => void;
}

export default function ConnectionTabs({
  activeTab,
  onTabChange,
}: ConnectionTabsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex items-center border-b border-slate-100">
      <button
        onClick={() => onTabChange("IP")}
        className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          activeTab === "IP"
            ? "bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600"
            : "text-slate-500 hover:bg-slate-50"
        }`}
      >
        <FiWifi
          className={`text-xl ${activeTab === "IP" ? "text-indigo-500" : ""}`}
        />
        <span>{t("config_view.tabs_network")}</span>
      </button>

      <button
        onClick={() => onTabChange("COM")}
        className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          activeTab === "COM"
            ? "bg-orange-50 text-orange-700 border-b-2 border-orange-600"
            : "text-slate-500 hover:bg-slate-50"
        }`}
      >
        <LuPlug2
          className={`text-xl ${activeTab === "COM" ? "text-orange-500" : ""}`}
        />
        <span>{t("config_view.tabs_com")}</span>
      </button>
    </div>
  );
}
