import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Part } from "../types";

interface useLabelEditResponse {
  data: {
    parsedData: string;
    cleanName: string;
    isNewTemplate: boolean;
    previewImage: string;
    criticalError: string | null;
    message: string | null;
    isOnline: boolean;
    isOnlineLoading: boolean;
    isZPLLoading: boolean;
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
  const { t } = useTranslation();
  const [previewImage, setPreviewImage] = useState<string>("");
  const [isOnline, SetisOnline] = useState<boolean>(false);
  const [message, Setmessage] = useState<string>("");
  const [isOnlineLoading, setisOnlineLoading] = useState<boolean>(true);
  const [isZPLLoading, setIsZPLLoading] = useState<boolean>(true);
  const [uiMessage, setUiMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [examplePart, setExamplePart] = useState<Part | null>(null);

  const normalizeFormatName = (value: unknown): string =>
    String(value ?? "")
      .split(".")[0]
      .trim()
      .toLocaleLowerCase();

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPrinterStatus = async (): Promise<void> => {
      try {
        const response = await window.api.GetPrinterStatus();
        if (isMounted) {
          SetisOnline(response.status);
          Setmessage(
            response.message ||
              (response.status ? "header.connected" : "header.disconnected"),
          );
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          SetisOnline(false);
          Setmessage(t("header.status_error"));
        }
      } finally {
        setisOnlineLoading(false);
      }
    };

    fetchPrinterStatus();
    const intervalId = setInterval(fetchPrinterStatus, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [t]);

  useEffect(() => {
    let isMounted = true;

    const fetchZPL = async (): Promise<void> => {
      if (isNewTemplate || !cleanName || !window.api) {
        if (isMounted) setIsZPLLoading(false);
        return;
      }

      try {
        const response = await window.api.GetLabelZPL(cleanName);
        if (isMounted) {
          if (response.status && response.data) {
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

    fetchZPL();

    return () => {
      isMounted = false;
    };
  }, [cleanName, isNewTemplate, t]);

  useEffect(() => {
    let isMounted = true;

    const findExamplePart = async (): Promise<void> => {
      if (!cleanName || !window.api) {
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
            text: t("label_editor.example_part_load_error")
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
            text: t("label_editor.example_part_load_error")
          });
          return;
        }

        const formatName = normalizeFormatName(cleanName);
        const matchingPart = (partsData as Part[]).find(
          (part) => normalizeFormatName(part.Label_Format) === formatName
        );

        setExamplePart(matchingPart || null);
        if (!matchingPart) {
          setUiMessage({
            type: "error",
            text: t("label_editor.example_part_not_found", {
              format: cleanName
            })
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
            text: t("label_editor.example_part_load_error")
          });
        }
      }
    };

    findExamplePart();
    return () => {
      isMounted = false;
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
            zpl: zplOrName
          });

          if (isMounted) {
            if (!response.status) {
              setCriticalError(
                t("label_editor.example_part_preview_error", {
                  part: examplePart.Part_Number
                })
              );
            } else if (response.data) {
              setPreviewImage(response.data);
              setCriticalError(null);
            }
          }
          return;
        }

        const response = await window.api.GetLabelPreview(zplOrName);

        if (isMounted) {
          if (!response.status) {
            setCriticalError(response.message || "Preview error");
          } else if (response.data) {
            setPreviewImage(response.data);
            setCriticalError(null);
          }
        }
      } catch (error) {
        if (isMounted) console.error("Preview failed:", error);
      }
    };

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!parsedData.trim()) {
      const resetTimer = window.setTimeout(() => {
        if (isMounted) {
          setPreviewImage("");
          setCriticalError(null);
        }
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
    }

    debounceTimerRef.current = setTimeout(() => {
      updatePreview(parsedData);
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
        text: t("label_formats.name_and_content_required")
      });
      return;
    }

    try {
      const response = await window.api.SaveLabelFormat(
        templateName,
        parsedData
      );
      if (response.status) {
        setUiMessage({
          type: "success",
          text: t("config_view.save_success"),
        });
        setTimeout(() => setUiMessage(null), 3000);
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
      setUiMessage({
        type: "error",
        text: t("config_view.save_error"),
      });
    }
  };

  const dismissUiMessage = (): void => setUiMessage(null);

  return {
    data: {
      parsedData,
      cleanName,
      isNewTemplate,
      previewImage,
      criticalError,
      message,
      isOnline,
      isOnlineLoading,
      isZPLLoading,
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
