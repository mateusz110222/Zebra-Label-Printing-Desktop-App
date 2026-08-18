import React, { useEffect, useState } from "react";
import { LabelFormatsResponse, UiMessage } from "../types";
import { useTranslation } from "react-i18next";
import { extractError } from "../utils/errorUtils";
import { useAuth } from "../context/AuthContext";

interface useLabelsFormatsResponse {
  data: {
    isLoading: boolean;
    criticalError: string | undefined;
    uiMessage: UiMessage | null;
    labelsFormats: LabelFormatsResponse[];
    isLoggedIn: boolean;
  };
  actions: {
    setCriticalError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setUiMessage: React.Dispatch<React.SetStateAction<UiMessage | null>>;
    handleCardClick: (formatName: string) => void;
    handleCreateClick: () => void;
    handleDelete: (formatName: string) => Promise<void>;
  };
}

export function useLabelsFormats(): useLabelsFormatsResponse {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
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
        const response = await window.api.GetLabelsFormats();

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

  const handleCreateClick = (): void => {
    if (!isLoggedIn) {
      setUiMessage({ type: "error", text: t("label_formats.login_required") });
      return;
    }
    window.open("#/preview?new=true", "_blank");
  };

  const handleDelete = async (formatName: string): Promise<void> => {
    if (!isLoggedIn) {
      setUiMessage({ type: "error", text: t("label_formats.login_required") });
      return;
    }

    const response = await window.api.DeleteLabelFormat(formatName);
    if (response.status) {
      setLabelsFormats((formats) =>
        formats.filter((format) => format.name !== formatName),
      );
      setUiMessage({ type: "success", text: t("label_formats.deleted") });
    } else {
      setUiMessage({
        type: "error",
        text: t(response.message || "config_view.save_error"),
      });
    }
  };

  return {
    data: {
      isLoading,
      criticalError,
      uiMessage,
      labelsFormats,
      isLoggedIn,
    },
    actions: {
      setCriticalError,
      setUiMessage,
      handleCardClick,
      handleCreateClick,
      handleDelete,
    },
  };
}
