import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import CriticalErrorState from "../components/CriticalErrorState";
import StatusBanner from "../components/StatusBanner";
import ActionButton from "../components/ActionButton";
import PrintViewInput from "@renderer/components/PrintViewInput";
import Select from "react-select";

interface Part {
  Operation: string;
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
}

interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

interface PartOption {
  value: string;
  label: string;
}

export default function PrintView(): React.JSX.Element {
  const { t } = useTranslation();

  const [parts, setParts] = useState<Part[]>([]);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [labelQuantity, setLabelQuantity] = useState<number | "">(1);
  const [options, setOptions] = useState<PartOption[]>([]);

  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewCache = useRef<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    const fetchParts = async (): Promise<void> => {
      try {
        const response = await window.electron.ipcRenderer.invoke("get-parts");

        if (!isMounted) return;

        if (response.status === false) {
          setCriticalError(`${t("print_view.error_fetching_parts")}: ${response.message}`);
          return;
        }
        setParts(response.data);

        setOptions(
          response.data.map((part: Part) => ({
            value: part.Serial_Prefix,
            label: `${part.Part_Description} (${part.Serial_Prefix})`
          }))
        );
      } catch (err) {
        if (!isMounted) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        setCriticalError(`${t("print_view.error_fetching_parts")}: ${errMsg}`);
      }
    };
    fetchParts();
    return () => {
      isMounted = false;
    };
  }, [t]);

  const handleSelectChange = async (option: PartOption | null): Promise<void> => {
    setPreviewImage(null);

    if (!option) {
      setSelectedPart(null);
      return;
    }

    const part = (parts.find((p) => p.Serial_Prefix === option.value) || null) as Part;
    setSelectedPart(part);

    if (part) {
      setIsPreviewLoading(true);
      try {
        if (previewCache.current[part.Serial_Prefix]) {
          console.log("Wczytano z cache, oszczędzono bazę danych!");
          setPreviewImage(previewCache.current[part.Serial_Prefix]);
          return;
        }

        const response = await window.electron.ipcRenderer.invoke("get-label-preview", {
          part: part
        });

        if (response.status && response.data) {
          previewCache.current[part.Serial_Prefix] = response.data;
          setPreviewImage(response.data);
        } else {
          setUiMessage({
            type: "error",
            text: t("print_view.error_fetching_parts"),
            details: response.message || "Unknown preview error"
          });
          return;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setUiMessage({
          type: "error",
          text: t("print_view.error_fetching_parts"),
          details: errMsg
        });
      } finally {
        setIsPreviewLoading(false);
      }
    }
  };

  const handleQuantityChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    if (val === "") {
      setLabelQuantity("");
      return;
    }
    const num = parseInt(val);
    if (!isNaN(num)) {
      setLabelQuantity(Math.min(100, Math.max(1, num)));
    }
  };

  const handlePrint = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setUiMessage(null);

    const qty = typeof labelQuantity === "number" ? labelQuantity : 1;
    if (!selectedPart || qty < 1) return;

    setIsPrinting(true);

    try {
      const response = await window.electron.ipcRenderer.invoke("print-label", {
        part: selectedPart,
        quantity: qty
      });

      if (!response || response.status === false) {
        setUiMessage({
          type: "error",
          text: t("print_view.error_printing_labels"),
          details: response.message || "Unknown backend error"
        });
        return;
      }

      setUiMessage({
        type: "success",
        text: t("print_view.labels_printed_success", "Etykiety wysłane do drukarki"),
        details: response.message !== "label_sent_successfully" ? response.message : undefined
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setUiMessage({
        type: "error",
        text: t("print_view.error_printing_labels"),
        details: errMsg
      });
    } finally {
      setIsPrinting(false);
    }
  };

  if (criticalError) {
    return (
      <CriticalErrorState
        message={criticalError}
        onRetry={() => window.location.reload()}
        title={t("print_view.error")}
      />
    );
  }

  return (
    <div className="p-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {t("print_view.title")}
          </h2>
          <p className="text-slate-500 mt-2">{t("print_view.subtitle")}</p>
        </div>

        {/* Baner Statusu */}
        {uiMessage && (
          <StatusBanner
            type={uiMessage.type}
            message={uiMessage.text}
            details={uiMessage.details}
            onClose={() => setUiMessage(null)}
          />
        )}

        {/* Karta Formularza */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8">
            <form onSubmit={handlePrint}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Part Selection */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 mb-1">
                    {t("print_view.part_selection")}
                  </label>
                  <Select
                    options={options}
                    onChange={handleSelectChange}
                    placeholder={t("print_view.select_part")}
                    isClearable
                    value={
                      selectedPart
                        ? {
                          value: selectedPart.Serial_Prefix,
                          label: `${selectedPart.Part_Description} (${selectedPart.Serial_Prefix})`
                        }
                        : null
                    }
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>

                {/* 2. Part Number (Read-Only) */}
                <PrintViewInput
                  text={t("print_view.Part_Number")}
                  type="text"
                  readOnly
                  disabled
                  value={selectedPart?.Part_Number || ""}
                />

                {/* 3. Prefix (Read-Only) */}
                <PrintViewInput
                  text="Prefix"
                  type="text"
                  value={selectedPart?.Serial_Prefix || ""}
                  readOnly
                  disabled
                  className="block flex-1 border-0 bg-transparent py-2 pl-2 text-slate-900 focus:ring-0 sm:text-sm sm:leading-6"
                />

                {/* 4. Quantity */}
                <PrintViewInput
                  text={t("print_view.label_quantity")}
                  type="number"
                  value={labelQuantity}
                  onChange={(e) => handleQuantityChange(e)}
                  min={1}
                  max={100}
                />
              </div>

              {/* Sekcja Podglądu */}
              <div className="mt-6 p-4 border rounded-lg bg-gray-50 flex flex-col items-center min-h-50 justify-center">
                {isPreviewLoading ? (
                  // Prosty loader
                  <div className="text-blue-500 font-medium">Generowanie podglądu...</div>
                ) : previewImage ? (
                  // Wyświetlenie obrazka
                  <img
                    src={previewImage}
                    alt="Podgląd ZPL"
                    className="max-w-full h-auto shadow-md border border-gray-300"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">Wybierz część, aby zobaczyć podgląd</span>
                )}
              </div>

              {/* Footer / Actions */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                <ActionButton
                  type="submit"
                  isLoading={isPrinting}
                  isDisabled={
                    !selectedPart ||
                    (typeof labelQuantity === "number" && labelQuantity < 1) ||
                    labelQuantity === ""
                  }
                  label={t("print_view.print_label")}
                  loadingLabel={t("print_view.printing")}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
