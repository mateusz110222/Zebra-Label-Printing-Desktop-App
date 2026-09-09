import React, { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { FiHash, FiLayers, FiPackage, FiPrinter } from "react-icons/fi";
import { NumberInput } from "@renderer/components/common";

interface Part {
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
}

interface PartDetailsCardProps {
  part: Part;
  assignedPrinter: string;
  quantity: number | "";
  onQuantityChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onQuantityBlur: (e: ChangeEvent<HTMLInputElement>) => void;
}

const PartDetailsCard = React.memo(function PartDetailsCard({
  part,
  assignedPrinter,
  quantity,
  onQuantityChange,
  onQuantityBlur,
}: PartDetailsCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
      {/* Part Number */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
          <FiPackage className="text-indigo-600 dark:text-indigo-400 text-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t("print_view.part_number")}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {part.Part_Number}
          </p>
        </div>
      </div>

      {/* Prefix */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <FiHash className="text-purple-600 dark:text-purple-400 text-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t("print_view.prefix")}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono truncate">
            {part.Serial_Prefix}
          </p>
        </div>
      </div>

      {/* Assigned printer */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <FiPrinter className="text-blue-600 dark:text-blue-400 text-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t("print_view.assigned_printer")}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono truncate">
            {assignedPrinter}
          </p>
        </div>
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <FiLayers className="text-emerald-600 dark:text-emerald-400 text-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            {t("print_view.label_quantity")}
          </p>
          <NumberInput
            value={quantity}
            onChange={onQuantityChange}
            onBlur={onQuantityBlur}
            onFocus={(e) => e.target.select()}
            min={1}
            max={100}
            containerClassName="relative w-full max-w-24"
            className="w-full h-10 rounded-xl border border-slate-300 dark:border-slate-700 pl-3.5 pr-9 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm font-mono font-semibold"
          />
        </div>
      </div>
    </div>
  );
});

export default PartDetailsCard;
