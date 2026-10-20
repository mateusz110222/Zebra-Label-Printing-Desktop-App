import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Part } from "../types";
import { usePrinterStatus } from "../context/PrinterStatusContext";
import { extractError } from "../utils/errorUtils";

interface useLabelEditResponse {
  data: {
    parsedData: string;
    cleanName: string;
    isNewTemplate: boolean;
    previewImage: string;
    previewError: string | null;
    criticalError: string | null;
    message: string | null;
    isOnline: boolean;
    isOnlineLoading: boolean;
    isZPLLoading: boolean;
    isDirty: boolean;
    uiMessage: { type: "success" | "error"; text: string } | null;
  };
  actions: {
    setParsedData: React.Dispatch<React.SetStateAction<string>>;
    setCleanName: React.Dispatch<React.SetStateAction<string>>;
    dismissUiMessage: () => void;
    handleSave: () => Promise<void>;
  };
}

export function useLabelEdit(): useLabelEditResponse {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const {
    isOnline,
    statusMessage: message,
    isLoading: isOnlineLoading,
  } = usePrinterStatus();

  const nameParam = searchParams.get("name");
  const dataParam = searchParams.get("data");
  const isNewTemplate = searchParams.get("new") === "true";

  const getInitialParsedData = (): string => {
    if (!dataParam) return "";
    try {
      const parsed = JSON.parse(dataParam);
      return typeof parsed === "object"
        ? JSON.stringify(parsed, null, 2)
        : parsed;
    } catch {
      return dataParam;
    }
  };

  const [cleanName, setCleanName] = useState<string>(nameParam || "");
  const [parsedData, setParsedData] = useState<string>(getInitialParsedData);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isZPLLoading, setIsZPLLoading] = useState<boolean>(true);
  const [uiMessage, setUiMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [examplePart, setExamplePart] = useState<Part | null>(null);
  const [savedName, setSavedName] = useState(nameParam || "");
  const [savedContent, setSavedContent] = useState(getInitialParsedData);

  const normalizeFormatName = (value: unknown): string =>
    String(value ?? "")
      .split(".")[0]
      .trim()
      .toLocaleLowerCase();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchZPL = async (): Promise<void> => {
      if (isNewTemplate || !nameParam || dataParam || !window.api) {
        if (isMounted) setIsZPLLoading(false);
        return;
      }

      try {
        const response = await window.api.GetLabelZPL(nameParam);
        if (isMounted) {
          if (response.status && response.data) {
            setSavedContent(response.data);
            setParsedData(response.data);
          } else if (!response.status) {
            console.error(response);
            setCriticalError(response.message || "Failed to load ZPL template");
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Failed to fetch ZPL:", error);
          setCriticalError(t("backend.print.unexpected_error"));
        }
      } finally {
        if (isMounted) setIsZPLLoading(false);
      }
    };

    void fetchZPL();

    return () => {
      isMounted = false;
    };
  }, [nameParam, dataParam, isNewTemplate, t]);

  useEffect(() => {
    let isMounted = true;

    const findExamplePart = async (): Promise<void> => {
      if (!cleanName.trim() || !window.api) {
        setExamplePart(null);
        return;
      }

      try {
        const response = await window.api.GetParts();
        if (!isMounted) return;
        if (!response.status) {
          setExamplePart(null);
          setUiMessage({
            type: "error",
            text: t("label_editor.example_part_load_error"),
          });
          return;
        }

        const responseData =
          typeof response.data === "string"
            ? JSON.parse(response.data)
            : response.data;
        const partsData = Array.isArray(responseData)
          ? responseData
          : responseData?.parts || responseData?.data;
        if (!Array.isArray(partsData)) {
          setExamplePart(null);
          setUiMessage({
            type: "error",
            text: t("label_editor.example_part_load_error"),
          });
          return;
        }

        const formatName = normalizeFormatName(cleanName);
        const matchingPart = (partsData as Part[]).find(
          (part) => normalizeFormatName(part.Label_Format) === formatName,
        );

        setExamplePart(matchingPart || null);
        if (!matchingPart) {
          setUiMessage({
            type: "error",
            text: t("label_editor.example_part_not_found", {
              format: cleanName,
            }),
          });
        } else {
          setUiMessage(null);
        }
      } catch (error) {
        console.error("Failed to find example part:", error);
        if (isMounted) {
          setExamplePart(null);
          setUiMessage({
            type: "error",
            text: t("label_editor.example_part_load_error"),
          });
        }
      }
    };

    const timer = setTimeout(() => {
      void findExamplePart();
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [cleanName, t]);

  useEffect(() => {
    let isMounted = true;

    const updatePreview = async (zplOrName: string): Promise<void> => {
      if (!zplOrName || !window.api) return;
      try {
        if (examplePart) {
          const response = await window.api.GetPrintPreview({
            part: examplePart,
            date: "",
            serialNumber: "",
            zpl: zplOrName,
          });

          if (isMounted) {
            if (!response.status) {
              setPreviewImage("");
              setPreviewError(
                t("label_editor.example_part_preview_error", {
                  part: examplePart.Part_Number,
                }),
              );
            } else if (response.data) {
              setPreviewImage(response.data);
              setPreviewError(null);
            }
          }
          return;
        }

        const response = await window.api.GetLabelPreview(zplOrName);

        if (isMounted) {
          if (!response.status) {
            setPreviewImage("");
            setPreviewError(
              t(response.message || "backend.print.generate_error"),
            );
          } else if (response.data) {
            setPreviewImage(response.data);
            setPreviewError(null);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Preview failed:", error);
          const { message: errMessage } = extractError(error);
          setPreviewImage("");
          setPreviewError(errMessage || t("backend.print.generate_error"));
        }
      }
    };

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!parsedData.trim()) {
      const resetTimer = window.setTimeout(() => {
        if (isMounted) {
          setPreviewImage("");
          setPreviewError(null);
        }
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
    }

    debounceTimerRef.current = setTimeout(() => {
      void updatePreview(parsedData);
    }, 500);

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [parsedData, examplePart, t]);

  const handleSave = async (): Promise<void> => {
    const templateName = cleanName.trim();
    if (!templateName || !parsedData.trim()) {
      setUiMessage({
        type: "error",
        text: t("label_formats.name_and_content_required"),
      });
      return;
    }

    try {
      const response = await window.api.SaveLabelFormat(
        templateName,
        parsedData,
      );
      if (!isMountedRef.current) return;

      if (response.status) {
        setSavedName(templateName);
        setSavedContent(parsedData);
        setUiMessage({
          type: "success",
          text: t("config_view.save_success"),
        });
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          if (isMountedRef.current) {
            setUiMessage(null);
          }
        }, 3000);
      } else {
        setUiMessage({
          type: "error",
          text: response.message
            ? t(response.message)
            : t("config_view.save_error"),
        });
      }
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        setUiMessage({
          type: "error",
          text: t("config_view.save_error"),
        });
      }
    }
  };

  const dismissUiMessage = (): void => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setUiMessage(null);
  };

  return {
    data: {
      parsedData,
      cleanName,
      isNewTemplate,
      previewImage,
      previewError,
      criticalError,
      message,
      isOnline,
      isOnlineLoading,
      isZPLLoading,
      isDirty:
        cleanName.trim() !== savedName.trim() || parsedData !== savedContent,
      uiMessage,
    },
    actions: {
      setParsedData,
      setCleanName,
      dismissUiMessage,
      handleSave,
    },
  };
}
