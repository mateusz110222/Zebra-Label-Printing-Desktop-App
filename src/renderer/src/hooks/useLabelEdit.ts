import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface useLabelEditResponse {
  data: {
    parsedData: string;
    cleanName: string;
    previewImage: string;
    criticalError: string | null;
    message: string | null;
    isOnline: boolean;
    isLoading: boolean;
    uiMessage: { type: "success" | "error"; text: string } | null;
  };
  actions: {
    setParsedData: React.Dispatch<React.SetStateAction<string>>;
    setCleanName: React.Dispatch<React.SetStateAction<string>>;
    handleSave: () => Promise<void>;
  };
}

export function useLabelEdit(): useLabelEditResponse {
  const [searchParams] = useSearchParams();

  const nameParam = searchParams.get("name");
  const dataParam = searchParams.get("data");

  const getInitialParsedData = (): string => {
    if (!dataParam) return "";
    try {
      // Data param might be a JSON string or raw ZPL
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isZplLoading, setIsZplLoading] = useState<boolean>(!!nameParam);
  const [uiMessage, setUiMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
        if (isMounted) setIsLoading(false);
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
      if (!cleanName || !window.api) {
        setIsZplLoading(false);
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
        if (isMounted) setIsZplLoading(false);
      }
    };

    fetchZPL();

    return () => {
      isMounted = false;
    };
  }, [cleanName, t]);

  useEffect(() => {
    let isMounted = true;

    const updatePreview = async (zplOrName: string): Promise<void> => {
      if (!zplOrName || !window.api) return;

      try {
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

    debounceTimerRef.current = setTimeout(() => {
      updatePreview(parsedData || cleanName);
    }, 500);

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [parsedData, cleanName]);

  const handleSave = async (): Promise<void> => {
    if (!cleanName || !parsedData) return;

    try {
      const response = await window.api.SaveLabelFormat(cleanName, parsedData);
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

  return {
    data: {
      parsedData,
      cleanName,
      previewImage,
      criticalError,
      message,
      isOnline,
      isLoading: isLoading || isZplLoading,
      uiMessage,
    },
    actions: {
      setParsedData,
      setCleanName,
      handleSave,
    },
  };
}
