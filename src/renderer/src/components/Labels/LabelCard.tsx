import React from "react";
import { BsFileEarmarkCode } from "react-icons/bs";
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import { LabelFormatsResponse } from "@renderer/views/LabelsFormats";

export const LabelCard = ({
  format,
  isExpanded,
  onClick,
}: {
  format: LabelFormatsResponse;
  isExpanded: boolean;
  onClick: () => void;
}): React.JSX.Element => {
  const displayName = format.name.replace(/\.[^/.]+$/, "");

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      {/* Nagłówek Karty */}
      <div
        className="p-5 flex items-start justify-between cursor-pointer bg-linear-to-r from-white to-slate-50"
        onClick={onClick}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
            {/* Ikona pliku */}
            <BsFileEarmarkCode size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">{displayName}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              ZPL Template
            </p>
          </div>
        </div>

        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          {/* Strzałki */}
          {isExpanded ? (
            <MdKeyboardArrowUp size={24} />
          ) : (
            <MdKeyboardArrowDown size={24} />
          )}
        </button>
      </div>

      {/* Rozwijany Code Block */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-900 p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
              Source Code
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {format.data.length} chars
            </span>
          </div>
          <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-all max-h-60 scrollbar-thin scrollbar-thumb-slate-700">
            <code>{format.data}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
