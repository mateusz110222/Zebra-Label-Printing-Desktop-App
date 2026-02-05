import { app, BrowserWindow, shell } from "electron";
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
import GetGithubVersions from "../backend/GetGithubVersions";
import UpdatesHandler from "../backend/UpdatesHandler";
import Store from "electron-store";

const Stores = new Store();

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

  mainWindow.on("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
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

// Rejestracja funkcji backendowych
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();
  UpdatesHandler(mainWindow);

  const isAutoUpdateEnabled = Stores.get("autoUpdate", true);

  if (isAutoUpdateEnabled) {
    UpdatesHandler(mainWindow);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await closeDatabase();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await closeDatabase();
});
