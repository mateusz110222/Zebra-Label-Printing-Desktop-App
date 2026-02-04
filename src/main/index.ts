import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import GetParts from "../backend/GetParts";
import PrintLabel from "../backend/PrintLabel";
import GetSerialPorts from "../backend/GetSerialPorts";
import TestPrinterConnection from "../backend/TestPrinterConnection";
import SavePrinterConfig from "../backend/SavePrinterConfig";
import GetPrinterConfig from "../backend/GetPrinterConfig";
import HandleLogin from "../backend/HandleLogin";
import IsOnline from "../backend/IsOnline";
import GetLabelPreview from "../backend/GetLabelPreview";
import { closeDatabase } from "../backend/utils/DatabaseConfig";
import GetLabelsFormats from "../backend/GetLabelsFormats";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import GetGithubVersions from "../backend/GetGithubVersions";

autoUpdater.logger = log;
log.transports.file.level = "debug";

let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
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

      return {
        updateAvailable: !!result?.updateInfo,
        version: result?.updateInfo.version,
      };
    } catch (error) {
      console.error("Błąd podczas sprawdzania aktualizacji:", error);
      throw error;
    }
  });

  ipcMain.handle("set-auto-update", async (_event, enable: boolean) => {
    autoUpdater.autoDownload = enable; // Jeśli true, pobierze sam. Jeśli false, tylko powiadomi.
    return true;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  GetParts();
  PrintLabel();
  TestPrinterConnection();
  SavePrinterConfig();
  GetPrinterConfig();
  GetSerialPorts();
  IsOnline();
  GetGithubVersions();
  HandleLogin();
  GetLabelPreview();
  GetLabelsFormats();
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", async () => {
  await closeDatabase();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await closeDatabase();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
