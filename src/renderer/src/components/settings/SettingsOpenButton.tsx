import { BiPowerOff } from "react-icons/bi";
import { HiBars3 } from "react-icons/hi2";
import React from "react";

interface ButtonsProps {
  updateStatus: string;
  onClick: () => void;
}

export default function SettingsOpenButton({
  updateStatus,
  onClick,
}: ButtonsProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 relative
          ${
            updateStatus === "ready"
              ? "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
              : "hover:bg-gray-100 text-slate-600"
          }
        `}
    >
      {updateStatus === "ready" ? (
        <BiPowerOff className="w-6 h-6 animate-pulse" />
      ) : (
        <HiBars3 className="w-6 h-6" />
      )}

      {updateStatus === "available" && (
        <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-blue-400`}
          ></span>
          <span
            className={`relative inline-flex rounded-full h-3 w-3 bg-blue-500`}
          ></span>
        </span>
      )}
    </button>
  );
}
