import { app, ipcMain } from "electron";
import { autoUpdater, UpdateCheckResult } from "electron-updater";
import log from "electron-log";
import { clean, gt } from "semver";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable } from "../audit/AuditLog";
import { store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

export default function UpdatesHandler(
  mainWindow: Electron.BrowserWindow,
): void {
  autoUpdater.autoDownload = store.get("autoUpdate");

  let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  if (app.isPackaged) {
    autoUpdater.autoInstallOnAppQuit = true;
  }

  const checkForAutomaticUpdate = async (): Promise<void> => {
    if (!store.get("autoUpdate")) return;

    try {
      const result: UpdateCheckResult | null = app.isPackaged
        ? await autoUpdater.checkForUpdatesAndNotify()
        : await autoUpdater.checkForUpdates();

      if (!result?.updateInfo.version) return;

      const latestVersion = clean(result.updateInfo.version);
      const currentVersion = clean(app.getVersion());

      if (!latestVersion || !currentVersion) return;

      if (gt(latestVersion, currentVersion)) {
        mainWindow.webContents.send("update_available");
      }
    } catch (error) {
      log.error("Automatic update check failed:", error);
    }
  };

  const startUpdateInterval = (): void => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
    }

    updateCheckInterval = setInterval(() => {
      void checkForAutomaticUpdate();
    }, UPDATE_CHECK_INTERVAL);
  };

  const stopUpdateInterval = (): void => {
    if (!updateCheckInterval) return;

    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  };

  mainWindow.once("ready-to-show", () => {
    if (!store.get("autoUpdate")) return;

    void checkForAutomaticUpdate();

    startUpdateInterval();
  });

  ipcMain.handle("get-app-version", (event) => {
    if (!isMainRendererAuthorized(event)) {
      return { status: false, message: "backend.audit.unauthorized" };
    }

    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async (event) => {
    if (!isMainRendererAuthorized(event)) {
      return { status: false, message: "backend.audit.unauthorized" };
    }

    const currentAutoDownload = autoUpdater.autoDownload;

    try {
      autoUpdater.autoDownload = false;

      const result = await autoUpdater.checkForUpdates();

      if (!result?.updateInfo.version) {
        return {
          status: true,
          updateAvailable: false,
        };
      }

      const githubVersion = clean(result.updateInfo.version);
      const currentVersion = clean(app.getVersion());

      if (!githubVersion || !currentVersion) {
        return {
          status: true,
          updateAvailable: false,
        };
      }

      const isNewer = gt(githubVersion, currentVersion);

      if (isNewer) {
        void autoUpdater.downloadUpdate().catch((error) => {
          log.error("Update download failed:", error);
        });
      }

      return {
        status: true,
        updateAvailable: isNewer,
        version: githubVersion,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (!app.isPackaged) {
        log.error("Check for updates failed:", errorMsg);
      }

      return {
        status: false,
        message: errorMsg,
      };
    } finally {
      autoUpdater.autoDownload = store.get("autoUpdate") ?? currentAutoDownload;
    }
  });

  autoUpdater.on("update-available", () => {
    mainWindow.webContents.send("update_available");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow.webContents.send("download_progress", {
      percent: progressObj.percent.toFixed(0),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("update_downloaded");
  });

  ipcMain.on("restart_app", (event): void => {
    if (!isMainRendererAuthorized(event)) return;

    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("set-auto-update", async (event, enable: unknown) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
      };
    }

    if (typeof enable !== "boolean") {
      return {
        status: false,
        message: "backend.update.invalid_setting",
      };
    }

    const auditStorage = await checkAuditLogWritable();

    if (!auditStorage.status) {
      return {
        status: false,
        message: "backend.audit.storage_unavailable",
        rawError: auditStorage.rawError,
      };
    }

    const previousSetting = store.get("autoUpdate");
    const previousAutoDownload = autoUpdater.autoDownload;

    store.set("autoUpdate", enable);
    autoUpdater.autoDownload = enable;

    const auditPersisted = await appendAuditLog({
      category: "config",
      action: "AUTO_UPDATE_CHANGED",
      status: "success",
      details: {
        enabled: enable,
      },
    });

    if (!auditPersisted) {
      store.set("autoUpdate", previousSetting);
      autoUpdater.autoDownload = previousAutoDownload;

      return {
        status: false,
        message: "backend.audit.storage_unavailable",
      };
    }

    if (enable) {
      void autoUpdater.checkForUpdatesAndNotify();

      startUpdateInterval();
    } else {
      stopUpdateInterval();
    }

    return {
      status: true,
      enabled: enable,
    };
  });

  mainWindow.once("closed", () => {
    stopUpdateInterval();
  });
}
