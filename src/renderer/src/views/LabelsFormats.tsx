import React, { useEffect, useState } from "react";
import { CriticalErrorState, StatusBanner } from "@renderer/components/common";
import { useTranslation } from "react-i18next";

// Import ikon z react-icons
// md = Material Design (akcje), bs = Bootstrap Icons (pliki/obiekty)
import {
  MdCheck,
  MdContentCopy,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdOutlinePrint,
} from "react-icons/md";
import { BsFileEarmarkCode, BsFileEarmarkX } from "react-icons/bs";

interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

interface LabelFormatsResponse {
  name: string;
  data: string;
}

// --- Sub-komponent Karty ---
const LabelCard = ({ format }: { format: LabelFormatsResponse }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(format.data);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const displayName = format.name.replace(/\.[^/.]+$/, "");

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      {/* Nagłówek Karty */}
      <div
        className="p-5 flex items-start justify-between cursor-pointer bg-gradient-to-r from-white to-slate-50"
        onClick={() => setIsExpanded(!isExpanded)}
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

      {/* Sekcja Akcji */}
      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={handleCopy}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            isCopied
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {/* Kopiowanie / Potwierdzenie */}
          {isCopied ? <MdCheck size={18} /> : <MdContentCopy size={18} />}
          {isCopied ? "Skopiowano!" : "Kopiuj kod"}
        </button>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 border border-slate-200 text-slate-600 py-2 px-3 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          {isExpanded ? "Ukryj podgląd" : "Pokaż kod"}
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

// --- Główny Komponent ---
export default function LabelsFormats(): React.JSX.Element {
  const [criticalError, setCriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [labelsFormats, setLabelsFormats] = useState<LabelFormatsResponse[]>(
    [],
  );
  const { t } = useTranslation();

  useEffect(() => {
    const fetchFormats = async () => {
      try {
        // @ts-ignore
        const response =
          await window.electron.ipcRenderer.invoke("get-labels-formats");

        if (!response.status) {
          setCriticalError(response.message || String(response));
        } else if (response.data) {
          setLabelsFormats(response.data);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        setCriticalError(errMsg);
      }
    };
    fetchFormats();
  }, []);

  if (criticalError) {
    return (
      <CriticalErrorState
        message={criticalError}
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
              {labelsFormats.length}
            </span>
          </div>
        </div>

        {/* Dynamiczny Baner */}
        {uiMessage && (
          <StatusBanner
            type={uiMessage.type}
            message={uiMessage.text}
            details={uiMessage.details}
            onClose={() => setUiMessage(null)}
          />
        )}

        {/* Grid z Kartami */}
        {labelsFormats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {labelsFormats.map((format) => (
              <LabelCard key={format.name} format={format} />
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
