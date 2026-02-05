import { app, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import semverGt from "semver/functions/gt";

autoUpdater.logger = log;
log.transports.file.level = "debug";

export default function UpdatesHandler(
  mainWindow: Electron.BrowserWindow,
): void {
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  mainWindow.once("ready-to-show", () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  autoUpdater.on("update-available", () => {
    mainWindow?.webContents.send("update_available");
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update_downloaded");
  });

  ipcMain.on("restart_app", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();

      const isNewer =
        result?.updateInfo &&
        semverGt(result.updateInfo.version, app.getVersion());

      return {
        updateAvailable: !!isNewer,
        version: result?.updateInfo.version,
      };
    } catch (error) {
      console.error("Błąd podczas sprawdzania aktualizacji:", error);
      throw error;
    }
  });

  ipcMain.handle("set-auto-update", async (_event, enable: boolean) => {
    autoUpdater.autoDownload = enable;
    return true;
  });
}
