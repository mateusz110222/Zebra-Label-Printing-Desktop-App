import React, { useEffect, useState } from "react";
import { UiMessage, LabelFormatsResponse } from "../types";

interface useLabelsFormatsResponse {
  data: {
    isLoading: boolean;
    criticalError: string | undefined;
    uiMessage: UiMessage | null;
    labelsFormats: LabelFormatsResponse[];
    expandedCard: string | null;
  };
  actions: {
    setCriticalError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setUiMessage: React.Dispatch<React.SetStateAction<UiMessage | null>>;
    handleCardClick: (formatName: string) => void;
  };
}

export function useLabelsFormats(): useLabelsFormatsResponse {
  const [isLoading, setIsLoading] = useState(true);
  const [criticalError, setCriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
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
        const errMsg = error instanceof Error ? error.message : String(error);
        setCriticalError(errMsg);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchFormats();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCardClick = (formatName: string): void => {
    setExpandedCard((current) => (current === formatName ? null : formatName));
  };

  return {
    data: {
      isLoading,
      criticalError,
      uiMessage,
      labelsFormats,
      expandedCard,
    },
    actions: {
      setCriticalError,
      setUiMessage,
      handleCardClick,
    },
  };
}
