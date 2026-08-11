import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractError } from "../utils/errorUtils";
import i18n from "@renderer/i18n";

interface useSettingsMenuResponse {
  data: {
    isMenuOpen: boolean;
    autoUpdate: boolean;
    updateStatus: string;
    errorMessage: string;
    localVersion: string;
    githubVersion: string;
    progressPercent: number;
  };
  actions: {
    setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
    handleCheckForUpdates: () => Promise<void>;
    toggleAutoUpdate: () => Promise<void>;
    setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleRestart: () => void;
    handleLanguageChange: (language: string) => void;
  };
}

export default function useSettingsMenu(
  menuRef: React.RefObject<HTMLDivElement | null>,
): useSettingsMenuResponse {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);

  const [localVersion, setLocalVersion] = useState<string>("-");
  const [githubVersion, setGithubVersion] = useState<string>("-");
  const [autoUpdate, setAutoUpdateEnabled] = useState(true);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem("language") || "en";
  });

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async (): Promise<void> => {
      const savedState = await window.api.GetSettings("autoUpdate");

      if (isMounted && savedState !== undefined) {
        setAutoUpdateEnabled(savedState === true);
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const cleanupAvailable = window.api.OnUpdateAvailable(() => {
      setUpdateStatus("available");
    });

    const cleanupProgress = window.api.OnDownloadProgress((data) => {
      setProgressPercent(Number(data.percent));
    });

    const cleanupDownloaded = window.api.OnUpdateDownloaded(() => {
      setUpdateStatus("ready");
    });

    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef, isMenuOpen]);

  useEffect(() => {
    let isMounted = true;

    const fetchVersions = async (): Promise<void> => {
      try {
        const ver = await window.api.GetAppVersion();
        if (isMounted) setLocalVersion(ver);
      } catch (e) {
        console.warn("Failed to get app version", e);
        if (isMounted) setLocalVersion("0.0.0");
      }

      try {
        const ghVer = await window.api.GetGithubVersion();
        if (isMounted) {
          if (ghVer && ghVer !== "Error") {
            setGithubVersion(ghVer);
          } else {
            setGithubVersion("-");
          }
        }
      } catch (e) {
        if (isMounted) setGithubVersion("-");
        console.error("GitHub version check skipped or failed:", e);
      }
    };

    fetchVersions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);

  const handleLanguageChange = async (newLanguage: string): Promise<void> => {
    setLanguage(newLanguage);
    localStorage.setItem("language", newLanguage);
    i18n.changeLanguage(newLanguage);
  };

  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateStatus("checking");
    setErrorMessage("");

    try {
      const result = await window.api.CheckForUpdates();

      if (!result.status) {
        setUpdateStatus("error");
        setErrorMessage(
          result.message ? t(result.message) : t("settings.unknown_error"),
        );
        return;
      }

      if (result.version) {
        setGithubVersion(result.version);
      }

      if (result.updateAvailable) {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("latest");
      }
    } catch (e) {
      setUpdateStatus("error");
      const { message } = extractError(e);
      setErrorMessage(t(message));
    }
  };

  const toggleAutoUpdate = async (): Promise<void> => {
    const newState = !autoUpdate;
    setAutoUpdateEnabled(newState);

    window.api.SetSettings("autoUpdate", newState);
  };

  const handleRestart = (): void => {
    window.api.RestartApp();
  };

  return {
    data: {
      isMenuOpen,
      autoUpdate,
      updateStatus,
      errorMessage,
      localVersion,
      githubVersion,
      progressPercent,
    },
    actions: {
      setIsMenuOpen,
      toggleAutoUpdate,
      handleCheckForUpdates,
      setErrorMessage,
      handleRestart,
      handleLanguageChange,
    },
  };
}
