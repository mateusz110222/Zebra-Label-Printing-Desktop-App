import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Part, UiMessage, PartOption } from "../types";

interface UsePrintLabelStatus {
  isLoading: boolean;
  isPrinting: boolean;
  isPreviewLoading: boolean;
  criticalError: string | null;
  uiMessage: UiMessage | null;
}

interface UsePrintLabelData {
  parts: Part[];
  selectedPart: Part | null;
  labelQuantity: number | "";
  date: string;
  serialNumber: string;
  options: PartOption[];
  previewImage: string | null;
}

interface UsePrintLabelActions {
  handleSelectChange: (option: PartOption | null) => Promise<void>;
  handleQuantityChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePrint: (e: ChangeEvent) => Promise<void>;
  clearUiMessage: () => void;
  handleSerialNumberChange: (SerialNumber: string) => void;
  handleDateChange: (date: string) => void;
}

interface UsePrintLabelReturn {
  data: UsePrintLabelData;
  status: UsePrintLabelStatus;
  actions: UsePrintLabelActions;
  isValid: boolean;
}

export const usePrintLabel = (mode: string): UsePrintLabelReturn => {
  const { t } = useTranslation();

  // Data states
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [labelQuantity, setLabelQuantity] = useState<number | "">(1);
  const [options, setOptions] = useState<PartOption[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const previewCache = useRef<Record<string, string>>({});

  // Status states
  const [status, setStatus] = useState<UsePrintLabelStatus>({
    isLoading: true,
    isPrinting: false,
    isPreviewLoading: false,
    criticalError: null,
    uiMessage: null,
  });

  // Fetch parts on mount
  useEffect(() => {
    let isMounted = true;

    const fetchParts = async (): Promise<void> => {
      try {
        const response = await window.electron.ipcRenderer.invoke("get-parts");

        if (!isMounted) return;

        if (response.status === false) {
          setStatus((prev) => ({
            ...prev,
            criticalError: `${t("print_view.error_fetching_parts")}: ${response.message}`,
          }));
          return;
        }

        setParts(response.data);
        setOptions(
          response.data.map((part: Part) => ({
            value: part.Serial_Prefix,
            label: `${part.Part_Description} (${part.Serial_Prefix})`,
          })),
        );
        setStatus((prev) => ({ ...prev, isLoading: false }));
      } catch (err) {
        if (!isMounted) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        setStatus((prev) => ({
          ...prev,
          isLoading: false,
          criticalError: `${t("print_view.error_fetching_parts")}: ${errMsg}`,
        }));
      }
    };

    fetchParts();
    return () => {
      isMounted = false;
    };
  }, [t]);

  const extractError = (err: unknown): { message: string; details?: string } => {
    const message = err instanceof Error ? err.message : String(err);
    const details =
      typeof err === "object" && err !== null && "rawError" in err
        ? (err as { rawError: string }).rawError
        : undefined;
    return { message, details };
  };

  async function generateLabelPreview(
    part: Part,
    date: string | "",
    serialNumber: string | "",
  ): Promise<void> {
    try {
      if (previewCache.current[part.Serial_Prefix] && mode !== "reprint") {
        setPreviewImage(previewCache.current[part.Serial_Prefix]);
        setStatus((prev) => ({ ...prev, isPreviewLoading: false }));
        return;
      }
      const response = await window.electron.ipcRenderer.invoke(
        "get-label-preview",
        { part, date, serialNumber },
      );

      if (response.status && response.data) {
        previewCache.current[part.Serial_Prefix] = response.data;
        setPreviewImage(response.data);
      } else {
        setStatus((prev) => ({
          ...prev,
          uiMessage: {
            type: "error",
            text: response.message
              ? t(response.message)
              : t("backend.print.generate_error"),
            details: response.rawError,
          },
        }));
      }
    } catch (err: unknown) {
      const { message, details } = extractError(err);
      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "error",
          text: t(message),
          details,
        },
      }));
    } finally {
      setStatus((prev) => ({ ...prev, isPreviewLoading: false }));
    }
  }

  const handleSelectChange = async (
    option: PartOption | null,
  ): Promise<void> => {
    setPreviewImage(null);

    if (!option) {
      setSelectedPart(null);
      return;
    }

    const part = parts.find((p) => p.Serial_Prefix === option.value) || null;
    setSelectedPart(part);

    if (part) {
      setStatus((prev) => ({ ...prev, isPreviewLoading: true }));

      if (mode === "reprint") {
        await generateLabelPreview(part, date, serialNumber);
      } else {
        await generateLabelPreview(part, "", "");
      }
    }
  };

  const handleDateChange = async (date: string): Promise<void> => {
    setDate(date);
    if (selectedPart) {
      if (mode === "reprint") {
        setStatus((prev) => ({ ...prev, isPreviewLoading: true }));
        await generateLabelPreview(selectedPart, date, serialNumber);
      } else {
        await generateLabelPreview(selectedPart, date, serialNumber);
      }
    }
  };

  const handleSerialNumberChange = async (
    serialNumber: string,
  ): Promise<void> => {
    setSerialNumber(serialNumber);
    if (selectedPart) {
      if (mode === "reprint") {
        setStatus((prev) => ({ ...prev, isPreviewLoading: true }));
        await generateLabelPreview(selectedPart, date, serialNumber);
      } else {
        await generateLabelPreview(selectedPart, date, serialNumber);
      }
    }
  };

  const handleQuantityChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    if (val === "") {
      setLabelQuantity(1);
      return;
    }
    const num = parseInt(val);
    if (!isNaN(num)) {
      setLabelQuantity(Math.min(100, Math.max(1, num)));
    }
  };

  const handlePrint = async (e: ChangeEvent): Promise<void> => {
    e.preventDefault();
    setStatus((prev) => ({ ...prev, uiMessage: null }));

    const qty = typeof labelQuantity === "number" ? labelQuantity : 1;
    if (!selectedPart || qty < 1) return;

    setStatus((prev) => ({ ...prev, isPrinting: true }));

    try {
      const response =
        mode === "reprint"
          ? await window.electron.ipcRenderer.invoke("reprint-label", {
            part: selectedPart,
            quantity: qty,
            date: date,
            serialNumber: serialNumber,
          })
          : await window.electron.ipcRenderer.invoke("print-label", {
            part: selectedPart,
            quantity: qty,
          });

      if (!response || response.status === false) {
        setStatus((prev) => ({
          ...prev,
          uiMessage: {
            type: "error",
            text: response?.message
              ? t(response.message)
              : t("backend.print.error"),
            details: response?.rawError,
          },
        }));
        return;
      }

      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "success",
          text: response.message
            ? t(response.message)
            : t("print_view.print_success"),
          details: response.rawError,
        },
      }));
    } catch (err: unknown) {
      const { message, details } = extractError(err);
      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "error",
          text: t(message),
          details,
        },
      }));
    } finally {
      setStatus((prev) => ({ ...prev, isPrinting: false }));
    }
  };

  const clearUiMessage = (): void => {
    setStatus((prev) => ({ ...prev, uiMessage: null }));
  };

  const isValid =
    selectedPart !== null &&
    typeof labelQuantity === "number" &&
    labelQuantity >= 1 &&
    (mode !== "reprint" || (date.trim() !== "" && serialNumber.trim() !== ""));

  return {
    data: {
      parts,
      selectedPart,
      labelQuantity,
      options,
      previewImage,
      date,
      serialNumber,
    },
    status,
    actions: {
      handleSelectChange,
      handleSerialNumberChange,
      handleDateChange,
      handleQuantityChange,
      handlePrint,
      clearUiMessage,
    },
    isValid,
  };
};
