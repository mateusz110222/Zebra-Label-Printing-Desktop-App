import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdatesHandler from "../UpdatesHandler";

const mocks = vi.hoisted(() => ({
  autoUpdateSetting: true,
  readyToShow: undefined as (() => void) | undefined,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  appendAuditLog: vi.fn(),
  checkAuditLogWritable: vi.fn(),
  checkForUpdates: vi.fn(),
  checkForUpdatesAndNotify: vi.fn(),
  downloadUpdate: vi.fn(),
  updaterOn: vi.fn(),
  quitAndInstall: vi.fn(),
  webContentsSend: vi.fn(),
}));

const updater = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: false,
  forceDevUpdateConfig: false,
  checkForUpdates: mocks.checkForUpdates,
  checkForUpdatesAndNotify: mocks.checkForUpdatesAndNotify,
  downloadUpdate: mocks.downloadUpdate,
  on: mocks.updaterOn,
  quitAndInstall: mocks.quitAndInstall,
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => "1.0.0"),
  },
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        mocks.handlers.set(channel, handler);
      },
    ),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: updater,
}));

vi.mock("electron-log", () => ({
  default: { error: vi.fn() },
}));

vi.mock("../store", () => ({
  store: {
    get: mocks.storeGet,
    set: mocks.storeSet,
  },
}));

vi.mock("../AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  checkAuditLogWritable: mocks.checkAuditLogWritable,
}));

const mainWindow = {
  once: vi.fn((_event: string, callback: () => void) => {
    mocks.readyToShow = callback;
  }),
  webContents: { send: mocks.webContentsSend },
} as unknown as Electron.BrowserWindow;

describe("UpdatesHandler auto-update setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.readyToShow = undefined;
    mocks.autoUpdateSetting = true;
    mocks.storeGet.mockImplementation((key: string) =>
      key === "autoUpdate" ? mocks.autoUpdateSetting : undefined,
    );
    mocks.storeSet.mockImplementation((key: string, value: unknown) => {
      if (key === "autoUpdate" && typeof value === "boolean") {
        mocks.autoUpdateSetting = value;
      }
    });
    mocks.checkForUpdates.mockResolvedValue(null);
    mocks.checkForUpdatesAndNotify.mockResolvedValue(null);
    mocks.downloadUpdate.mockResolvedValue([]);
    mocks.appendAuditLog.mockResolvedValue(true);
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      message: "backend.audit.storage_ready",
      path: "C:/logs",
      lastFailureAt: null,
    });
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.forceDevUpdateConfig = false;
  });

  it.each([true, false])(
    "initializes autoDownload from store when autoUpdate=%s",
    (enabled) => {
      mocks.autoUpdateSetting = enabled;

      UpdatesHandler(mainWindow);

      expect(updater.autoDownload).toBe(enabled);
    },
  );

  it("does not run the startup update check when auto updates are disabled", () => {
    mocks.autoUpdateSetting = false;
    UpdatesHandler(mainWindow);

    mocks.readyToShow!();

    expect(mocks.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "persists autoUpdate=%s and applies it to autoUpdater",
    async (enabled) => {
      mocks.autoUpdateSetting = !enabled;
      UpdatesHandler(mainWindow);
      const handler = mocks.handlers.get("set-auto-update")!;

      const response = await handler(undefined, enabled);

      expect(response).toEqual({ status: true, enabled });
      expect(mocks.storeSet).toHaveBeenCalledWith("autoUpdate", enabled);
      expect(updater.autoDownload).toBe(enabled);
      expect(mocks.checkForUpdatesAndNotify).toHaveBeenCalledTimes(
        enabled ? 1 : 0,
      );
    },
  );

  it("rejects a non-boolean setting without changing store or updater", async () => {
    mocks.autoUpdateSetting = false;
    UpdatesHandler(mainWindow);
    const initialAutoDownload = updater.autoDownload;
    const handler = mocks.handlers.get("set-auto-update")!;

    const response = await handler(undefined, "true");

    expect(response).toEqual({
      status: false,
      message: "backend.update.invalid_setting",
    });
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
    expect(updater.autoDownload).toBe(initialAutoDownload);
    expect(mocks.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("does not mutate the setting when audit storage is unavailable", async () => {
    mocks.autoUpdateSetting = false;
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      message: "backend.audit.storage_unavailable",
      path: "C:/logs",
      lastFailureAt: new Date().toISOString(),
      rawError: "disk full",
    });
    UpdatesHandler(mainWindow);
    const handler = mocks.handlers.get("set-auto-update")!;

    const response = await handler(undefined, true);

    expect(response).toMatchObject({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(updater.autoDownload).toBe(false);
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("rolls back store and updater state when the final audit log fails", async () => {
    mocks.autoUpdateSetting = false;
    mocks.appendAuditLog.mockResolvedValueOnce(false);
    UpdatesHandler(mainWindow);
    const handler = mocks.handlers.get("set-auto-update")!;

    const response = await handler(undefined, true);

    expect(response).toEqual({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.storeSet).toHaveBeenNthCalledWith(1, "autoUpdate", true);
    expect(mocks.storeSet).toHaveBeenNthCalledWith(2, "autoUpdate", false);
    expect(mocks.autoUpdateSetting).toBe(false);
    expect(updater.autoDownload).toBe(false);
    expect(mocks.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("keeps manual update checks working while auto updates are disabled", async () => {
    mocks.autoUpdateSetting = false;
    mocks.checkForUpdates.mockResolvedValue({
      updateInfo: { version: "2.0.0" },
    });
    UpdatesHandler(mainWindow);
    const handler = mocks.handlers.get("check-for-updates")!;

    const response = await handler();

    expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
    expect(mocks.downloadUpdate).toHaveBeenCalledOnce();
    expect(response).toEqual({
      status: true,
      updateAvailable: true,
      version: "2.0.0",
    });
    expect(updater.autoDownload).toBe(false);
  });
});
