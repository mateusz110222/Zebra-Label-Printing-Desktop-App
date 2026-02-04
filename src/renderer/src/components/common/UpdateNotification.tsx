import React, { useEffect, useRef, useState } from "react";
import { HiBars3 } from "react-icons/hi2";
import { BiLoaderAlt } from "react-icons/bi";

export default function SettingsMenu(): React.JSX.Element {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateStatus, setUpdateStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [localVersion, setLocalVersion] = useState<string>("-");
  const [githubVersion, setGithubVersion] = useState<string>("-");

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchVersions = async (): Promise<void> => {
      if (!window.electron) return;

      try {
        const ver = await window.electron.ipcRenderer.invoke("get-app-version");
        setLocalVersion(ver);
      } catch (e) {
        console.error(e);
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
        console.error("Błąd pobierania wersji (IPC)", e);
        setGithubVersion("-");
      }
    };

    if (isMenuOpen) {
      setErrorMessage("");
      setUpdateStatus("");
      fetchVersions();
    }
  }, [isMenuOpen]);

  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateStatus("checking");
    setErrorMessage("");

    try {
      if (!window.electron) {
        throw new Error("Brak dostępu do Electron API");
      }
      const result =
        await window.electron.ipcRenderer.invoke("check-for-updates");
      setUpdateStatus(result?.updateAvailable ? "available" : "latest");
    } catch (error: unknown) {
      console.error(error);
      setUpdateStatus("error");

      let msg = "Nieznany błąd";
      if (error instanceof Error) msg = error.message;
      else if (typeof error === "string") msg = error;

      setErrorMessage(msg);
    }
  };

  const toggleAutoUpdate = async (): Promise<void> => {
    const newValue = !autoUpdate;
    setAutoUpdate(newValue);
    if (window.electron) {
      await window.electron.ipcRenderer.invoke("set-auto-update", newValue);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="p-2 rounded-md hover:bg-gray-100 text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <HiBars3 className="w-6 h-6" />
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">Ustawienia</h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
              v{localVersion}
            </span>
          </div>

          <div className="p-4 space-y-4">
            <div className="text-xs text-gray-500 space-y-1 bg-slate-50 p-2 rounded border border-slate-100">
              <div className="flex justify-between">
                <span>Zainstalowana:</span>
                <span className="font-mono text-slate-700">{localVersion}</span>
              </div>
              <div className="flex justify-between">
                <span>GitHub Latest:</span>
                <span
                  className={`font-mono font-bold ${localVersion !== githubVersion && githubVersion !== "-" ? "text-green-600" : "text-slate-700"}`}
                >
                  {githubVersion}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Auto-aktualizacja</span>
              <button
                onClick={toggleAutoUpdate}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 ${autoUpdate ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoUpdate ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>

            <hr className="border-gray-100" />

            <div className="flex flex-col gap-2">
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === "checking"}
                className="w-full bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-400 text-xs py-2 px-3 rounded transition-colors flex justify-center items-center gap-2"
              >
                {updateStatus === "checking" && (
                  <BiLoaderAlt className="animate-spin h-4 w-4 text-white" />
                )}
                {updateStatus === "checking"
                  ? "Sprawdzanie..."
                  : "Sprawdź aktualizacje"}
              </button>

              <div className="min-h-5 flex flex-col items-center justify-center">
                {updateStatus === "latest" && (
                  <p className="text-xs text-center text-green-600 font-medium">
                    Masz najnowszą wersję.
                  </p>
                )}
                {updateStatus === "available" && (
                  <p className="text-xs text-center text-blue-600 font-medium">
                    Pobieranie nowej wersji...
                  </p>
                )}
                {updateStatus === "error" && (
                  <div className="w-full bg-red-50 border border-red-100 rounded p-2 mt-1">
                    <p className="text-xs text-center text-red-600 font-bold mb-1">
                      Wystąpił błąd:
                    </p>
                    <p className="text-[10px] text-red-500 text-center wrap-break-word leading-tight font-mono">
                      {errorMessage || "Błąd połączenia"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
