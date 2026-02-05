import React, { useEffect, useState } from "react";

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
  };
}

export default function useSettingsMenu(
  menuRef: React.RefObject<HTMLDivElement | null>,
): useSettingsMenuResponse {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateStatus, setUpdateStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);

  const [localVersion, setLocalVersion] = useState<string>("-");
  const [githubVersion, setGithubVersion] = useState<string>("-");

  useEffect(() => {
    const setupListeners = (): void => {
      if (!window.electron) return;

      window.electron.ipcRenderer.removeAllListeners("update_available");
      window.electron.ipcRenderer.removeAllListeners("update_downloaded");
      window.electron.ipcRenderer.removeAllListeners("download_progress");

      window.electron.ipcRenderer.on("update_available", () => {
        setUpdateStatus("available");
      });

      window.electron.ipcRenderer.on("download_progress", (_event, data) => {
        console.log("Download progress:", data.percent);
        setProgressPercent(data.percent);
      });

      window.electron.ipcRenderer.on("update_downloaded", () => {
        setUpdateStatus("ready");
      });
    };

    setupListeners();

    return () => {
      if (window.electron) {
        window.electron.ipcRenderer.removeAllListeners("update_available");
        window.electron.ipcRenderer.removeAllListeners("update_downloaded");
        window.electron.ipcRenderer.removeAllListeners("download_progress");
      }
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
    const fetchVersions = async (): Promise<void> => {
      try {
        const ver = await window.electron.ipcRenderer.invoke("get-app-version");
        setLocalVersion(ver);
      } catch (e) {
        console.warn("Failed to get app version", e);
        setLocalVersion("0.0.0");
      }

      try {
        const ghVer =
          await window.electron.ipcRenderer.invoke("get-github-version");
        if (ghVer && ghVer !== "Error") {
          setGithubVersion(ghVer);
        } else {
          setGithubVersion("-");
        }
      } catch (e) {
        setGithubVersion("-");
        console.log("GitHub version check skipped or failed:", e);
      }
    };

    fetchVersions();
  }, []);

  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateStatus("checking");
    setErrorMessage("");

    try {
      const result =
        await window.electron.ipcRenderer.invoke("check-for-updates");

      if (!result.status) {
        setUpdateStatus("error");
        setErrorMessage(result.message || "Unknown error");
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
      const errMsg = e instanceof Error ? e.message : String(e);
      setErrorMessage(errMsg);
    }
  };

  const toggleAutoUpdate = async (): Promise<void> => {
    const newValue = !autoUpdate;
    setAutoUpdate(newValue);
    if (window.electron) {
      await window.electron.ipcRenderer.invoke("set-auto-update", newValue);
    }
  };

  const handleRestart = (): void => {
    if (window.electron) {
      window.electron.ipcRenderer.send("restart_app");
    }
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
    },
  };
}
