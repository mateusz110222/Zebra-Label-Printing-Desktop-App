import React, { useEffect, useState } from "react";
import { UiMessage } from "@renderer/hooks";
import { LabelFormatsResponse } from "@renderer/views/LabelsFormats";

interface useLabelsFormatsResponse {
  data: {
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

export default function useLabelsFormats(): useLabelsFormatsResponse {
  const [criticalError, setCriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [labelsFormats, setLabelsFormats] = useState<LabelFormatsResponse[]>(
    [],
  );

  useEffect(() => {
    const fetchFormats = async (): Promise<void> => {
      try {
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

  const handleCardClick = (formatName: string): void => {
    setExpandedCard((current) => (current === formatName ? null : formatName));
  };

  return {
    data: {
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
