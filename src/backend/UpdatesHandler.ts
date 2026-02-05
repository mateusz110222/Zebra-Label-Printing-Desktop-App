import { app, ipcMain } from "electron";
import { autoUpdater, UpdateCheckResult } from "electron-updater";
import log from "electron-log";
import { clean, gt } from "semver";
import { store } from "./store";

export default function UpdatesHandler(
  mainWindow: Electron.BrowserWindow,
): void {
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }
  ipcMain.handle("get-settings", (_event, key) => {
    return store.get(key);
  });

  ipcMain.on("set-settings", (_event, key, value) => {
    store.set(key, value);
  });

  if (app.isPackaged) autoUpdater.autoInstallOnAppQuit = true;

  mainWindow.once("ready-to-show", () => {
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
        log.error("Error checking for updates on startup:", err);
      });
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    try {
      const currentAutoDownload = autoUpdater.autoDownload;

      const result = await autoUpdater.checkForUpdates();

      autoUpdater.autoDownload = currentAutoDownload;

      if (!result?.updateInfo.version) return { updateAvailable: false };

      const githubVersion = clean(result.updateInfo.version);
      if (!githubVersion) return { updateAvailable: false };

      const isNewer = gt(githubVersion, app.getVersion());

      return {
        status: true,
        updateAvailable: isNewer,
        version: githubVersion,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Check for updates failed:", errorMsg);
      return {
        status: false,
        message: errorMsg,
      };
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
    autoUpdater.autoDownload = enable;
    return true;
  });
}
