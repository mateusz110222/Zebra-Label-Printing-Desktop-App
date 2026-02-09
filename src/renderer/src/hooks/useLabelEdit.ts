import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { extractError } from "@renderer/utils/errorUtils";

interface useLabelEditResponse {
  data: {
    parsedData: string;
    cleanName: string;
    isLoading: boolean;
    previewImage: string;
    criticalError: string | null;
  };
  actions: {
    setParsedData: React.Dispatch<React.SetStateAction<string>>;
    setCleanName: React.Dispatch<React.SetStateAction<string>>;
  };
}

export function useLabelEdit(): useLabelEditResponse {
  const [searchParams] = useSearchParams();

  const nameParam = searchParams.get("name");
  const dataParam = searchParams.get("data");

  const getInitialParsedData = (): string => {
    if (!dataParam) return "";
    try {
      const parsed = JSON.parse(dataParam);
      return typeof parsed === "object"
        ? JSON.stringify(parsed, null, 2)
        : parsed;
    } catch (e) {
      const { message } = extractError(e);
      setCriticalError(message);
      return "";
    }
  };

  const getInitialError = (): string => {
    if (!dataParam) return "";
    try {
      JSON.parse(dataParam);
      return "";
    } catch (e) {
      const { message } = extractError(e);
      return message;
    }
  };

  const [cleanName, setCleanName] = useState<string>(nameParam || "");
  const [parsedData, setParsedData] = useState<string>(getInitialParsedData);
  const [criticalError, setCriticalError] = useState<string | null>(
    getInitialError,
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string>("");

  useEffect(() => {
    const generatePreview = async (): Promise<void> => {
      if (!cleanName || criticalError) return;

      try {
        setIsLoading(true);

        const part = { Label_Format: cleanName.replace(".zpl", "") };

        // Ensure window.electron exists (TypeScript safety check usually needed here)
        const response = await window.electron.ipcRenderer.invoke(
          "get-label-preview",
          { part: part, date: Date.now(), serialNumber: "" },
        );

        if (!response.success) {
          setCriticalError(response.message);
        } else {
          setPreviewImage(response.data);
        }
      } catch (error) {
        const { message } = extractError(error);
        setCriticalError(message);
      } finally {
        setIsLoading(false);
      }
    };

    generatePreview();
  }, [cleanName, criticalError]);

  return {
    data: {
      parsedData,
      cleanName,
      isLoading,
      previewImage,
      criticalError,
    },
    actions: {
      setParsedData,
      setCleanName,
    },
  };
}
