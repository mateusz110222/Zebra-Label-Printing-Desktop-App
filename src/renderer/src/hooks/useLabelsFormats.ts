import React, { useCallback, useEffect, useRef, useState } from "react";
import { LabelFormatsResponse, UiMessage } from "../types";
import { useTranslation } from "react-i18next";
import { extractError } from "../utils/errorUtils";
import { useAuth } from "../context/AuthContext";

interface useLabelsFormatsResponse {
  data: {
    isLoading: boolean;
    isRefreshing: boolean;
    criticalError: string | undefined;
    uiMessage: UiMessage | null;
    labelsFormats: LabelFormatsResponse[];
    canManage: boolean;
  };
  actions: {
    setCriticalError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setUiMessage: React.Dispatch<React.SetStateAction<UiMessage | null>>;
    handleCardClick: (formatName: string) => void;
    handleCreateClick: () => void;
    refresh: () => Promise<void>;
    handleDelete: (formatName: string) => Promise<void>;
  };
}

let labelsFormatsCache: LabelFormatsResponse[] | null = null;

export function useLabelsFormats(): useLabelsFormatsResponse {
  const { t } = useTranslation();
  const { CanEdit } = useAuth();
  const [isLoading, setIsLoading] = useState(labelsFormatsCache === null);
  const [criticalError, setCriticalError] = useState<string | undefined>("");
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [labelsFormats, setLabelsFormats] = useState<LabelFormatsResponse[]>(
    labelsFormatsCache || [],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(labelsFormatsCache !== null);
  const invalidateRequests = useCallback(() => {
    requestRef.current++;
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current;
    setIsRefreshing(true);
    setCriticalError(undefined);
    try {
      const response = await window.api.GetLabelsFormats();
      if (!mountedRef.current || request !== requestRef.current) return;
      if (!response.status)
        throw new Error(
          response.message || "backend.labels.ERROR_LOADING_TEMPLATES",
        );
      labelsFormatsCache = response.data || [];
      setLabelsFormats(labelsFormatsCache);
      hasLoadedRef.current = true;
    } catch (error) {
      if (!mountedRef.current || request !== requestRef.current) return;
      const { message } = extractError(error);
      if (hasLoadedRef.current) {
        setUiMessage({ type: "error", text: t(message) });
      } else {
        setCriticalError(t(message));
      }
    } finally {
      if (mountedRef.current && request === requestRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = window.api.OnTemplatesChanged(() => void refresh());
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(initialRefresh);
      mountedRef.current = false;
      invalidateRequests();
      unsubscribe();
    };
  }, [refresh, invalidateRequests]);

  const handleCardClick = (formatName: string): void => {
    const params = new URLSearchParams();
    if (formatName) params.append("name", formatName);

    // Always ask the main process, which restores/focuses an existing editor.
    window.open(`#/preview?${params.toString()}`, "_blank");
  };

  const handleCreateClick = (): void => {
    if (!CanEdit) {
      setUiMessage({
        type: "error",
        text: t("label_formats.it_access_required"),
      });
      return;
    }
    window.open("#/preview?new=true", "_blank");
  };

  const handleDelete = async (formatName: string): Promise<void> => {
    if (!CanEdit) {
      setUiMessage({
        type: "error",
        text: t("label_formats.it_access_required"),
      });
      return;
    }

    try {
      const response = await window.api.DeleteLabelFormat(formatName);
      if (response.status) {
        setLabelsFormats((formats) =>
          formats.filter((format) => format.name !== formatName),
        );
        labelsFormatsCache =
          labelsFormatsCache?.filter((format) => format.name !== formatName) ||
          null;
        setUiMessage({ type: "success", text: t("label_formats.deleted") });
        return;
      }
      setUiMessage({
        type: "error",
        text: t(response.message || "config_view.save_error"),
      });
    } catch (error) {
      const { message } = extractError(error);
      setUiMessage({
        type: "error",
        text: t(message || "config_view.save_error"),
      });
    }
  };

  return {
    data: {
      isLoading,
      isRefreshing,
      criticalError,
      uiMessage,
      labelsFormats,
      canManage: CanEdit,
    },
    actions: {
      setCriticalError,
      setUiMessage,
      handleCardClick,
      handleCreateClick,
      refresh,
      handleDelete,
    },
  };
}
