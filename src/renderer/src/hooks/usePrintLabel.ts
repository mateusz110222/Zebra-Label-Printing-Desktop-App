import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Part, PartOption, UiMessage } from "../types";
import { extractError } from "../utils/errorUtils";

const PREVIEW_DEBOUNCE_MS = 300;

const getPartOptionValue = (part: Part): string =>
  JSON.stringify([
    (part.Operation || "").trim().toLocaleLowerCase(),
    part.Part_Number.trim().toLocaleUpperCase(),
    part.Serial_Prefix.trim().toLocaleUpperCase(),
    part.Label_Format.trim().toLocaleLowerCase(),
  ]);

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
  selectedOption: PartOption | null;
  labelQuantity: number | "";
  date: string;
  serialNumber: string;
  options: PartOption[];
  previewImage: string | null;
  lastPrintSummary: PrintLabelResult | null;
}

interface UsePrintLabelActions {
  handleSelectChange: (option: PartOption | null) => Promise<void>;
  handleQuantityChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleQuantityBlur: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePrint: () => Promise<void>;
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

  const [parts, setParts] = useState<Part[]>([]);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [labelQuantity, setLabelQuantity] = useState<number | "">(1);
  const [options, setOptions] = useState<PartOption[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [lastPrintSummary, setLastPrintSummary] =
    useState<PrintLabelResult | null>(null);
  const previewCache = useRef<Record<string, string>>({});
  const previewRequestId = useRef(0);
  const previewDebounceTimer = useRef<number | null>(null);
  const printInProgress = useRef(false);

  const [status, setStatus] = useState<UsePrintLabelStatus>({
    isLoading: true,
    isPrinting: false,
    isPreviewLoading: false,
    criticalError: null,
    uiMessage: null,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchParts = async (): Promise<void> => {
      try {
        const response = await window.api.GetParts();

        if (!isMounted) return;

        if (!response.status) {
          setStatus((prev) => ({
            ...prev,
            criticalError: `${t("print_view.error_fetching_parts")}: ${t(response.message || "")}`,
          }));
          return;
        }

        const partsConfig = await window.api.GetPartsConfig();
        const selectedOperation = (partsConfig.operation || "")
          .trim()
          .toLocaleLowerCase();
        const filteredParts = (response.data as Part[])
          .filter(
            (part) =>
              !selectedOperation ||
              (part.Operation || "").trim().toLocaleLowerCase() ===
                selectedOperation,
          )
          .sort(
            (first, second) =>
              (first.Operation || "").localeCompare(second.Operation || "") ||
              first.Part_Description.localeCompare(second.Part_Description),
          );

        const seenOptionValues = new Set<string>();
        const duplicateOptionValues = new Set<string>();
        const uniqueParts = filteredParts.filter((part) => {
          const optionValue = getPartOptionValue(part);
          if (seenOptionValues.has(optionValue)) {
            duplicateOptionValues.add(optionValue);
            return false;
          }
          seenOptionValues.add(optionValue);
          return true;
        });

        setParts(uniqueParts);
        setOptions(
          uniqueParts.map((part) => ({
            value: getPartOptionValue(part),
            label: `${part.Part_Description} (${part.Serial_Prefix})`,
          })),
        );
        setStatus((prev) => ({
          ...prev,
          isLoading: false,
          uiMessage:
            duplicateOptionValues.size > 0
              ? {
                  type: "error",
                  text: t("print_view.duplicate_part_options", {
                    count: duplicateOptionValues.size,
                  }),
                }
              : prev.uiMessage,
        }));
      } catch (err) {
        if (!isMounted) return;
        const { message } = extractError(err);
        setStatus((prev) => ({
          ...prev,
          isLoading: false,
          criticalError: `${t("print_view.error_fetching_parts")}: ${t(message)}`,
        }));
      }
    };

    fetchParts();
    return () => {
      isMounted = false;
    };
  }, [t]);

  useEffect(
    () => () => {
      previewRequestId.current += 1;
      if (previewDebounceTimer.current !== null) {
        window.clearTimeout(previewDebounceTimer.current);
      }
    },
    [],
  );

  async function generateLabelPreview(
    part: Part,
    date: string | "",
    serialNumber: string | "",
  ): Promise<void> {
    const requestId = ++previewRequestId.current;
    try {
      const cacheKey = [
        mode,
        part.Operation || "",
        part.Part_Number,
        part.Part_Description,
        part.Serial_Prefix,
        part.Label_Format,
        date,
        serialNumber,
      ].join("|");
      if (previewCache.current[cacheKey]) {
        if (requestId !== previewRequestId.current) return;
        setPreviewImage(previewCache.current[cacheKey]);
        setStatus((prev) => ({
          ...prev,
          isPreviewLoading: false,
          uiMessage: null,
        }));
        return;
      }
      const response = await window.api.GetPrintPreview({
        part,
        date,
        serialNumber,
      });

      if (requestId !== previewRequestId.current) return;

      if (response.status && response.data) {
        previewCache.current[cacheKey] = response.data;
        setPreviewImage(response.data);
        setStatus((prev) => ({ ...prev, uiMessage: null }));
      } else {
        setPreviewImage(null);
        setStatus((prev) => ({
          ...prev,
          uiMessage: {
            type: "error",
            text: t(response.message || "")
              ? t(response.message || "")
              : t("backend.print.generate_error"),
            details: t(response.rawError || ""),
          },
        }));
      }
    } catch (err: unknown) {
      if (requestId !== previewRequestId.current) return;
      const { message, details } = extractError(err);
      setPreviewImage(null);
      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "error",
          text: t(message),
          details: t(details ?? ""),
        },
      }));
    } finally {
      if (requestId === previewRequestId.current) {
        setStatus((prev) => ({ ...prev, isPreviewLoading: false }));
      }
    }
  }

  const scheduleLabelPreview = (
    part: Part,
    nextDate: string,
    nextSerialNumber: string,
  ): void => {
    previewRequestId.current += 1;
    if (previewDebounceTimer.current !== null) {
      window.clearTimeout(previewDebounceTimer.current);
    }
    setStatus((prev) => ({ ...prev, isPreviewLoading: true }));
    previewDebounceTimer.current = window.setTimeout(() => {
      previewDebounceTimer.current = null;
      void generateLabelPreview(part, nextDate, nextSerialNumber);
    }, PREVIEW_DEBOUNCE_MS);
  };

  const handleSelectChange = async (
    option: PartOption | null,
  ): Promise<void> => {
    setPreviewImage(null);
    setLastPrintSummary((current) =>
      current &&
      (!current.status || !current.printerReady || !current.auditPersisted)
        ? current
        : null,
    );
    previewRequestId.current += 1;
    if (previewDebounceTimer.current !== null) {
      window.clearTimeout(previewDebounceTimer.current);
      previewDebounceTimer.current = null;
    }
    setStatus((prev) => ({
      ...prev,
      isPreviewLoading: false,
      uiMessage: null,
    }));

    if (!option) {
      setSelectedPart(null);
      return;
    }

    const part =
      parts.find(
        (candidate) => getPartOptionValue(candidate) === option.value,
      ) || null;
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

  const handleDateChange = (nextDate: string): void => {
    setDate(nextDate);
    if (selectedPart && mode === "reprint") {
      scheduleLabelPreview(selectedPart, nextDate, serialNumber);
    }
  };

  const handleSerialNumberChange = (nextSerialNumber: string): void => {
    setSerialNumber(nextSerialNumber);
    if (selectedPart && mode === "reprint") {
      scheduleLabelPreview(selectedPart, date, nextSerialNumber);
    }
  };

  const handleQuantityChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;

    if (value === "") {
      setLabelQuantity("");
      return;
    }

    const parsed = Number(value);

    if (parsed >= 1 && parsed <= 100) {
      setLabelQuantity(parsed);
    }
  };

  const handleQuantityBlur = (): void => {
    if (labelQuantity === "") {
      setLabelQuantity(1);
    }
  };

  const handlePrint = async (): Promise<void> => {
    if (printInProgress.current) return;
    setStatus((prev) => ({ ...prev, uiMessage: null }));
    setLastPrintSummary(null);

    const qty = typeof labelQuantity === "number" ? labelQuantity : 1;
    if (!selectedPart || qty < 1) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    const isMidnightBlock =
      (hours === 23 && minutes >= 55) || (hours === 0 && minutes <= 5);

    if (isMidnightBlock) {
      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "error",
          text: t("print_view.printing_blocked_midnight"),
        },
      }));
      return;
    }

    printInProgress.current = true;
    setStatus((prev) => ({ ...prev, isPrinting: true }));

    try {
      const response =
        mode === "reprint"
          ? await window.api.ReprintLabel({
              part: selectedPart,
              quantity: qty,
              serialNumber: serialNumber,
              date,
            })
          : await window.api.PrintLabel({
              part: selectedPart,
              quantity: qty,
            });

      if (!response || !response.status) {
        if (response) setLastPrintSummary(response);
        setStatus((prev) => ({
          ...prev,
          uiMessage: {
            type: "error",
            text: response?.message
              ? t(response.message)
              : t("backend.print.error"),
            details: t(response?.rawError || ""),
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
          details: t(response.rawError || ""),
        },
      }));
      setLastPrintSummary(response);
    } catch (err: unknown) {
      const { message, details } = extractError(err);
      setStatus((prev) => ({
        ...prev,
        uiMessage: {
          type: "error",
          text: t(message),
          details: t(details ?? ""),
        },
      }));
    } finally {
      printInProgress.current = false;
      setStatus((prev) => ({ ...prev, isPrinting: false }));
    }
  };

  const clearUiMessage = useCallback((): void => {
    setStatus((prev) => {
      if (prev.uiMessage === null) {
        return prev;
      }

      return {
        ...prev,
        uiMessage: null,
      };
    });
  }, []);

  const isValid =
    selectedPart !== null &&
    typeof labelQuantity === "number" &&
    labelQuantity >= 1 &&
    (mode !== "reprint" || (date.trim() !== "" && serialNumber.trim() !== ""));

  return {
    data: {
      parts,
      selectedPart,
      selectedOption: selectedPart
        ? {
            value: getPartOptionValue(selectedPart),
            label: `${selectedPart.Part_Description} (${selectedPart.Serial_Prefix})`,
          }
        : null,
      labelQuantity,
      options,
      previewImage,
      date,
      serialNumber,
      lastPrintSummary,
    },
    status,
    actions: {
      handleSelectChange,
      handleSerialNumberChange,
      handleDateChange,
      handleQuantityChange,
      handleQuantityBlur,
      handlePrint,
      clearUiMessage,
    },
    isValid,
  };
};
