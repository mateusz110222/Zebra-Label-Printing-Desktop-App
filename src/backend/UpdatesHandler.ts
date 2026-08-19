import { app, ipcMain } from "electron";
import { autoUpdater, UpdateCheckResult } from "electron-updater";
import log from "electron-log";
import { clean, gt } from "semver";
import { appendAuditLog, checkAuditLogWritable } from "./AuditLog";
import { store } from "./store";

export default function UpdatesHandler(
  mainWindow: Electron.BrowserWindow,
): void {
  autoUpdater.autoDownload = store.get("autoUpdate");

  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  if (app.isPackaged) autoUpdater.autoInstallOnAppQuit = true;

  mainWindow.once("ready-to-show", () => {
    if (!store.get("autoUpdate")) return;

    const checkFn = app.isPackaged
      ? autoUpdater.checkForUpdatesAndNotify()
      : autoUpdater.checkForUpdates();

    checkFn
      ?.then((result: UpdateCheckResult | null) => {
        if (result && result.updateInfo.version) {
          if (gt(result.updateInfo.version, app.getVersion())) {
            mainWindow?.webContents.send("update_available");
          }
        }
      })
      .catch((err) => {
        if (!app.isPackaged) {
          log.error("Error checking for updates on startup:", err);
        }
      });
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    const currentAutoDownload = autoUpdater.autoDownload;
    try {
      // A manual check controls downloading explicitly after comparing versions.
      autoUpdater.autoDownload = false;
      const result = await autoUpdater.checkForUpdates();
      if (!result?.updateInfo.version) {
        return { status: true, updateAvailable: false };
      }

      const githubVersion = clean(result.updateInfo.version);
      if (!githubVersion) return { updateAvailable: false };

      const isNewer = gt(githubVersion, app.getVersion());

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
    mainWindow?.webContents.send("update_available");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow?.webContents.send("download_progress", {
      percent: progressObj.percent.toFixed(0),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update_downloaded");
  });

  ipcMain.on("restart_app", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("set-auto-update", async (_event, enable: boolean) => {
    if (typeof enable !== "boolean") {
      return { status: false, message: "backend.update.invalid_setting" };
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
      details: { enabled: enable },
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
      void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        log.error("Automatic update check failed:", error);
      });
    }

    return { status: true, enabled: enable };
  });
}
