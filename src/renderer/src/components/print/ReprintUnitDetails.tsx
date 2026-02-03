import { useTranslation } from "react-i18next";
import { FiCalendar, FiHash } from "react-icons/fi";
import React, { useRef } from "react"; // 1. Importujemy useRef

interface ReprintUnitDetailsProps {
  date: string | "";
  onchangeDate: (date: string) => void;
  serialNumber: string | "";
  onchangeSerialNumber: (serialNumber: string) => void;
}

export default function ReprintUnitDetails({
  date,
  onchangeDate,
  serialNumber,
  onchangeSerialNumber,
}: ReprintUnitDetailsProps): React.JSX.Element {
  const { t } = useTranslation();

  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleOpenCalendar = (): void => {
    dateInputRef.current?.showPicker();
  };

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100"
      data-testid="reprint-unit-details"
    >
      <div
        className="flex items-center gap-3 cursor-pointer group"
        onClick={handleOpenCalendar}
      >
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
          <FiCalendar className="text-blue-600 text-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 cursor-pointer">
            {t("reprint.date")}
          </p>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => onchangeDate(e.target.value)}
            className="w-full rounded-lg border-0 py-1.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm font-semibold bg-white cursor-pointer accent-indigo-600 [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
      </div>

      {/* Serial Number Input */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
          <FiHash className="text-orange-600 text-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            {t("reprint.serialnumber")}
          </p>
          <input
            type="text"
            value={serialNumber}
            onChange={(e) => onchangeSerialNumber(e.target.value)}
            className="w-full rounded-lg border-0 py-1.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm font-semibold bg-white"
            placeholder="0000"
          />
        </div>
      </div>
    </div>
  );
}
