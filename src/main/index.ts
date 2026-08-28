import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { join } from "path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";

import GetParts from "../backend/parts/GetParts";
import PrintLabel from "../backend/printer/SetupLabelHandlers";
import GetSerialPorts from "../backend/printer/GetSerialPorts";
import GetUsbPrinters from "../backend/printer/GetUsbPrinters";
import TestPrinterConnection from "../backend/printer/TestPrinterConnection";
import SavePrinterConfig from "../backend/config/SavePrinterConfig";
import GetPrinterConfig from "../backend/config/GetPrinterConfig";
import SetupPrinterStatusHandlers, {
  startPrinterStatusPoller,
  stopPrinterStatusPoller
} from "../backend/printer/PrinterStatusService";
import { isPrintQueueBusy, waitForPrintQueueIdle } from "../backend/printer/PrinterActivity";
import HandleLogin from "../backend/auth/HandleLogin";
import GetLabelPreview from "../backend/preview/GetLabelPreview";
import { closeDatabase } from "../backend/config/DatabaseConfig";
import GetLabelsFormats from "../backend/parts/GetLabelsFormats";
import GetGithubVersions from "../backend/system/GetGithubVersions";
import UpdatesHandler from "../backend/handlers/UpdatesHandler";
import SettingsHandler from "../backend/config/SettingsHandler";
import ChildWindowHandlers from "../backend/preview/ChildWindow";
import PartsConfigHandler from "../backend/config/PartsConfig";
import AuditLogHandlers from "../backend/audit/AuditLogHandlers";
import SaveDatabaseConfig from "../backend/config/SaveDatabaseConfig";
import SystemHealthHandler from "../backend/system/SystemHealth";
import { clearAuditSession } from "../backend/audit/AuditLog";
import {
  getRendererEntryUrl,
  isAllowedExternalUrl,
  isAllowedPreviewUrl,
  isRendererDocumentUrl
} from "../backend/preview/PreviewWindowPolicy";
import { installExtension, REACT_DEVELOPER_TOOLS } from "electron-devtools-installer";

process.on("uncaughtExceptionMonitor", (error) => {
  console.error("Uncaught exception in main process:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in main process:", reason);
});

app.enableSandbox();

let mainWindow: BrowserWindow | null = null;
let isShuttingDown = false;

const openExternalUrl = (url: string): void => {
  if (!isAllowedExternalUrl(url)) return;

  void shell.openExternal(url).catch((error) => {
    console.error("Unable to open external URL:", error);
  });
};

function createWindow(): void {
  const rendererEntryUrl = getRendererEntryUrl(
    app.isPackaged,
    process.env["ELECTRON_RENDERER_URL"],
    __dirname,
  );

  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),

      sandbox: true,
      contextIsolation: true,

      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,

      webSecurity: true,
      allowRunningInsecureContent: false,

      webviewTag: false,
      navigateOnDragDrop: false,

      devTools: !app.isPackaged,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.maximize();
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedPreviewUrl(url, rendererEntryUrl)) {
      return {
        action: "allow",
        show: false,
        overrideBrowserWindowOptions: {
          frame: true,
          autoHideMenuBar: true,
          fullscreenable: false,

          webPreferences: {
            preload: join(__dirname, "../preload/label-format.js"),

            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,

            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,

            devTools: !app.isPackaged,
          },
        },
      };
    }

    openExternalUrl(url);

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isRendererDocumentUrl(url, rendererEntryUrl)) return;

    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.on(
    "did-start-navigation",
    (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) clearAuditSession();
    },
  );

  mainWindow.webContents.on("render-process-gone", () => {
    clearAuditSession();
  });

  mainWindow.webContents.once("destroyed", () => {
    clearAuditSession();
    mainWindow = null;
  });

  mainWindow.webContents.on("did-create-window", (childWindow, details) => {
    if (!isAllowedPreviewUrl(details.url, rendererEntryUrl)) {
      childWindow.destroy();
      return;
    }

    childWindow.once("ready-to-show", () => {
      childWindow.show();
    });

    childWindow.webContents.on("will-navigate", (event, url) => {
      if (isAllowedPreviewUrl(url, rendererEntryUrl)) return;

      event.preventDefault();
      openExternalUrl(url);
    });

    childWindow.webContents.setWindowOpenHandler(({ url }) => {
      openExternalUrl(url);
      return { action: "deny" };
    });
  });

  const rendererLoad =
    is.dev && process.env["ELECTRON_RENDERER_URL"]
      ? mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
      : mainWindow.loadFile(join(__dirname, "../renderer/index.html"));

  void rendererLoad.catch((error) => {
    console.error("Failed to load renderer UI:", error);
  });
}

// Single Instance Lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Initialize Backend Handlers
  GetParts();
  PartsConfigHandler();
  PrintLabel();
  TestPrinterConnection();
  SavePrinterConfig();
  GetPrinterConfig();
  SetupPrinterStatusHandlers();
  GetSerialPorts();
  GetUsbPrinters();
  GetGithubVersions();
  HandleLogin();
  GetLabelPreview();
  GetLabelsFormats();
  SettingsHandler();
  ChildWindowHandlers();
  AuditLogHandlers();
  SaveDatabaseConfig();
  SystemHealthHandler();

  ipcMain.handle("log-renderer-error", (_event, errorInfo) => {
    console.error("[Renderer Error via IPC]", errorInfo);
  });

  app
    .whenReady()
    .then(async () => {
      if (!app.isPackaged) {
        try {
          await installExtension(REACT_DEVELOPER_TOOLS);
        } catch (error) {
          console.error("Failed to install React Developer Tools:", error);
        }
      }

      electronApp.setAppUserModelId("com.electron");

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => {
          callback(false);
        },
      );

      app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
      });

      createWindow();
      if (mainWindow) {
        UpdatesHandler(mainWindow);
      }

      startPrinterStatusPoller(5000);

      app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((err) => {
      console.error("Failed during app initialization:", err);
    });

  app.on("window-all-closed", async () => {
    await closeDatabase().catch(() => undefined);
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", async (event) => {
    if (isShuttingDown) return;

    event.preventDefault();
    isShuttingDown = true;

    try {
      stopPrinterStatusPoller();
      if (isPrintQueueBusy()) {
        console.log("Waiting for pending print queue before quit...");
        await waitForPrintQueueIdle(15000);
      }
      await closeDatabase().catch((e) =>
        console.error("Database close error on quit:", e),
      );
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
    } finally {
      app.quit();
    }
  });
}
