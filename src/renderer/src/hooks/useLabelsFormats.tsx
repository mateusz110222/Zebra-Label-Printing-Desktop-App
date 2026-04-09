import React, { useEffect, useState } from "react";
import { LabelFormatsResponse, UiMessage } from "../types";
import { useTranslation } from "react-i18next";
import { extractError } from "../utils/errorUtils";

interface useLabelsFormatsResponse {
  data: {
    isLoading: boolean;
    criticalError: string | undefined;
    uiMessage: UiMessage | null;
    labelsFormats: LabelFormatsResponse[];
  };
  actions: {
    setCriticalError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setUiMessage: React.Dispatch<React.SetStateAction<UiMessage | null>>;
    handleCardClick: (formatName: string) => void;
  };
}

export function useLabelsFormats(): useLabelsFormatsResponse {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [criticalError, setCriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [labelsFormats, setLabelsFormats] = useState<LabelFormatsResponse[]>(
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const fetchFormats = async (): Promise<void> => {
      try {
        const response =
          await window.electron.ipcRenderer.invoke("get-labels-formats");

        if (!isMounted) return;

        if (!response.status) {
          setCriticalError(response.message || String(response));
        } else if (response.data) {
          setLabelsFormats(response.data);
        }
      } catch (error) {
        if (!isMounted) return;
        const { message } = extractError(error);
        setCriticalError(t(message));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchFormats();

    return () => {
      isMounted = false;
    };
  }, [t]);

  const handleCardClick = (formatName: string): void => {
    const params = new URLSearchParams();
    if (formatName) params.append("name", formatName);

    window.open(`#/preview?${params.toString()}`, "modal");
  };

  return {
    data: {
      isLoading,
      criticalError,
      uiMessage,
      labelsFormats,
    },
    actions: {
      setCriticalError,
      setUiMessage,
      handleCardClick,
    },
  };
}
