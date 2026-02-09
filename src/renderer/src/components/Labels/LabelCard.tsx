import React from "react";
import { BsFileEarmarkCode } from "react-icons/bs";
import { MdKeyboardArrowUp } from "react-icons/md";
import { LabelFormatsResponse } from "../../types";

export const LabelCard = ({
  format,
  onClick,
}: {
  format: LabelFormatsResponse;
  onClick: () => void;
}): React.JSX.Element => {
  const displayName = format.name.replace(/\.[^/.]+$/, "");

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      <div
        role="button"
        tabIndex={0}
        className="p-5 flex items-start justify-between cursor-pointer bg-linear-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
            {/* Ikona pliku */}
            <BsFileEarmarkCode size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">
              {displayName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              ZPL Template
            </p>
          </div>
        </div>

        <div className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          {/* Strzałki */}
          <MdKeyboardArrowUp size={24} />
        </div>
      </div>
    </div>
  );
};
