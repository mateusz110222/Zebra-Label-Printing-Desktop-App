import React from "react";
import { CriticalErrorState, StatusBanner } from "@renderer/components/common";
import { useTranslation } from "react-i18next";
import { MdOutlinePrint } from "react-icons/md";
import { BsFileEarmarkX } from "react-icons/bs";
import useLabelsFormats from "@renderer/components/Labels/useLabelsFormats";
import { LabelCard } from "@renderer/components/Labels/LabelCard";

export interface LabelFormatsResponse {
  name: string;
  data: string;
}

export default function LabelsFormats(): React.JSX.Element {
  const { t } = useTranslation();

  const { data, actions } = useLabelsFormats();

  if (data.criticalError) {
    return (
      <CriticalErrorState
        message={data.criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  return (
    <div className="min-h-full bg-slate-50/50 p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Sekcji */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-200">
                {/* Ikona drukarki */}
                <MdOutlinePrint size={28} />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {t("label_formats.title") || "Szablony Etykiet"}
              </h2>
            </div>
            <p className="text-slate-500 text-lg max-w-2xl">
              {t("label_formats.subtitle") ||
                "Zarządzaj i przeglądaj dostępne formaty wydruku ZPL."}
            </p>
          </div>

          <div className="bg-white px-4 py-2 rounded-full border border-slate-200 text-sm font-medium text-slate-600 shadow-sm">
            Znaleziono:{" "}
            <span className="text-indigo-600 font-bold">
              {data.labelsFormats.length}
            </span>
          </div>
        </div>

        {/* Dynamiczny Baner */}
        {data.uiMessage && (
          <StatusBanner
            type={data.uiMessage.type}
            message={data.uiMessage.text}
            details={data.uiMessage.details}
            onClose={() => actions.setUiMessage(null)}
          />
        )}

        {/* Grid z Kartami */}
        {data.labelsFormats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {data.labelsFormats.map((format) => (
              <LabelCard
                key={format.name}
                format={format}
                isExpanded={data.expandedCard === format.name}
                onClick={() => actions.handleCardClick(format.name)}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            {/* Ikona pustego stanu */}
            <BsFileEarmarkX className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-slate-900">
              Brak szablonów
            </h3>
            <p className="text-slate-500">
              Nie znaleziono żadnych plików w folderze szablonów.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
