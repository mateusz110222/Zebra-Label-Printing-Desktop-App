import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

import UpdatesHandler from "../handlers/UpdatesHandler";

const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

const mocks = vi.hoisted(() => ({
  autoUpdateSetting: true,

  handlers: new Map<
    string,
    (...args: unknown[]) => unknown
  >(),

  windowCallbacks: new Map<
    string,
    (...args: unknown[]) => void
  >(),

  updaterCallbacks: new Map<
    string,
    (...args: unknown[]) => void
  >(),

  storeGet: vi.fn(),
  storeSet: vi.fn(),

  appendAuditLog: vi.fn(),
  canViewAuditLogs: vi.fn(() => true),
  checkAuditLogWritable: vi.fn(),

  checkForUpdates: vi.fn(),
  checkForUpdatesAndNotify: vi.fn(),
  downloadUpdate: vi.fn(),

  updaterOn: vi.fn(),
  quitAndInstall: vi.fn(),

  webContentsSend: vi.fn(),

  isMainRendererAuthorized: vi.fn(() => true),

  logError: vi.fn(),

  app: {
    isPackaged: false,
    getVersion: vi.fn(() => "1.2.1"),
  },
}));

const updater = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: false,
  forceDevUpdateConfig: false,

  checkForUpdates: mocks.checkForUpdates,
  checkForUpdatesAndNotify:
  mocks.checkForUpdatesAndNotify,

  downloadUpdate: mocks.downloadUpdate,

  on: mocks.updaterOn,

  quitAndInstall: mocks.quitAndInstall,
}));

const createEvent = (): IpcMainInvokeEvent =>
  ({}) as IpcMainInvokeEvent;

vi.mock("electron", () => ({
  app: mocks.app,

  ipcMain: {
    handle: vi.fn(
      (
        channel: string,
        handler: (...args: unknown[]) => unknown,
      ) => {
        mocks.handlers.set(channel, handler);
      },
    ),

    on: vi.fn(
      (
        channel: string,
        handler: (...args: unknown[]) => unknown,
      ) => {
        mocks.handlers.set(channel, handler);
      },
    ),
  },
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized:
  mocks.isMainRendererAuthorized,
}));

vi.mock("electron-updater", () => ({
  autoUpdater: updater,
}));

vi.mock("electron-log", () => ({
  default: {
    error: mocks.logError,
  },
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
    set: mocks.storeSet,
  },
}));

vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  checkAuditLogWritable:
  mocks.checkAuditLogWritable,
  canViewAuditLogs: mocks.canViewAuditLogs,
}));

const mainWindow = {
  once: vi.fn(
    (
      event: string,
      callback: (...args: unknown[]) => void,
    ) => {
      mocks.windowCallbacks.set(event, callback);
    },
  ),

  webContents: {
    send: mocks.webContentsSend,
  },
} as unknown as Electron.BrowserWindow;

const getHandler = (
  channel: string,
): ((...args: unknown[]) => unknown) => {
  const handler = mocks.handlers.get(channel);

  if (!handler) {
    throw new Error(
      `IPC handler "${channel}" was not registered`,
    );
  }

  return handler;
};

const emitWindowEvent = (event: string): void => {
  const callback = mocks.windowCallbacks.get(event);

  if (!callback) {
    throw new Error(
      `Window event "${event}" was not registered`,
    );
  }

  callback();
};

const emitUpdaterEvent = (
  event: string,
  ...args: unknown[]
): void => {
  const callback = mocks.updaterCallbacks.get(event);

  if (!callback) {
    throw new Error(
      `Updater event "${event}" was not registered`,
    );
  }

  callback(...args);
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("UpdatesHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mocks.handlers.clear();
    mocks.windowCallbacks.clear();
    mocks.updaterCallbacks.clear();

    mocks.autoUpdateSetting = true;

    mocks.app.isPackaged = false;
    mocks.app.getVersion.mockReturnValue("1.2.1");

    mocks.isMainRendererAuthorized.mockReturnValue(true);
    mocks.canViewAuditLogs.mockReturnValue(true);

    mocks.storeGet.mockImplementation(
      (key: string) =>
        key === "autoUpdate"
          ? mocks.autoUpdateSetting
          : undefined,
    );

    mocks.storeSet.mockImplementation(
      (key: string, value: unknown) => {
        if (
          key === "autoUpdate" &&
          typeof value === "boolean"
        ) {
          mocks.autoUpdateSetting = value;
        }
      },
    );

    mocks.checkForUpdates.mockResolvedValue(null);

    mocks.checkForUpdatesAndNotify.mockResolvedValue(
      null,
    );

    mocks.downloadUpdate.mockResolvedValue([]);

    mocks.appendAuditLog.mockResolvedValue(true);

    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      message: "backend.audit.storage_ready",
      path: "C:/logs",
      lastFailureAt: null,
    });

    mocks.updaterOn.mockImplementation(
      (event: string, callback: unknown) => {
        mocks.updaterCallbacks.set(
          event,
          callback as (...args: unknown[]) => void,
        );

        return updater;
      },
    );

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.forceDevUpdateConfig = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initialization", () => {
    it.each([true, false])(
      "initializes autoDownload from store when autoUpdate=%s",
      (enabled) => {
        mocks.autoUpdateSetting = enabled;

        UpdatesHandler(mainWindow);

        expect(updater.autoDownload).toBe(enabled);
      },
    );

    it("enables forceDevUpdateConfig in development", () => {
      mocks.app.isPackaged = false;

      UpdatesHandler(mainWindow);

      expect(
        updater.forceDevUpdateConfig,
      ).toBe(true);

      expect(
        updater.autoInstallOnAppQuit,
      ).toBe(false);
    });

    it("enables autoInstallOnAppQuit in packaged mode", () => {
      mocks.app.isPackaged = true;

      UpdatesHandler(mainWindow);

      expect(
        updater.autoInstallOnAppQuit,
      ).toBe(true);

      expect(
        updater.forceDevUpdateConfig,
      ).toBe(false);
    });

    it("registers ready-to-show and closed separately", () => {
      UpdatesHandler(mainWindow);

      expect(
        mocks.windowCallbacks.has("ready-to-show"),
      ).toBe(true);

      expect(
        mocks.windowCallbacks.has("closed"),
      ).toBe(true);

      expect(
        mocks.windowCallbacks.get("ready-to-show"),
      ).not.toBe(
        mocks.windowCallbacks.get("closed"),
      );
    });
  });

  describe("automatic updates", () => {
    it("does not run startup update check when auto updates are disabled", async () => {
      mocks.autoUpdateSetting = false;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdatesAndNotify,
      ).not.toHaveBeenCalled();

      expect(
        mocks.checkForUpdates,
      ).not.toHaveBeenCalled();
    });

    it("uses checkForUpdates in development during automatic startup check", async () => {
      mocks.app.isPackaged = false;
      mocks.autoUpdateSetting = true;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.checkForUpdatesAndNotify,
      ).not.toHaveBeenCalled();
    });

    it("uses checkForUpdatesAndNotify in packaged mode during automatic startup check", async () => {
      mocks.app.isPackaged = true;
      mocks.autoUpdateSetting = true;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdatesAndNotify,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.checkForUpdates,
      ).not.toHaveBeenCalled();
    });

    it("notifies renderer when startup check finds a newer version", async () => {
      mocks.app.isPackaged = false;

      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "2.0.0",
        },
      });

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.webContentsSend,
      ).toHaveBeenCalledWith(
        "update_available",
      );
    });

    it("does not notify renderer when startup version is not newer", async () => {
      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "1.2.1",
        },
      });

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.webContentsSend,
      ).not.toHaveBeenCalledWith(
        "update_available",
      );
    });

    it("runs automatic check every 24 hours", async () => {
      mocks.autoUpdateSetting = true;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(
        UPDATE_CHECK_INTERVAL,
      );

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledTimes(2);
    });

    it("stops automatic interval when the window is closed", async () => {
      mocks.autoUpdateSetting = true;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledTimes(1);

      emitWindowEvent("closed");

      await vi.advanceTimersByTimeAsync(
        UPDATE_CHECK_INTERVAL,
      );

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledTimes(1);
    });

    it("logs automatic update check failures", async () => {
      mocks.checkForUpdates.mockRejectedValue(
        new Error("network unavailable"),
      );

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.logError,
      ).toHaveBeenCalledWith(
        "Automatic update check failed:",
        expect.any(Error),
      );
    });
  });

  describe("get-app-version", () => {
    it("returns current application version", () => {
      UpdatesHandler(mainWindow);

      const handler =
        getHandler("get-app-version");

      const response = handler(createEvent());

      expect(response).toBe("1.2.1");
    });

    it("rejects unauthorized renderer", () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("get-app-version");

      const response = handler(createEvent());

      expect(response).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });
    });
  });

  describe("set-auto-update", () => {
    it.each([true, false])(
      "persists autoUpdate=%s and applies it to autoUpdater",
      async (enabled) => {
        mocks.autoUpdateSetting = !enabled;

        UpdatesHandler(mainWindow);

        const handler =
          getHandler("set-auto-update");

        const response = await handler(
          createEvent(),
          enabled,
        );

        expect(response).toEqual({
          status: true,
          enabled,
        });

        expect(
          mocks.storeSet,
        ).toHaveBeenCalledWith(
          "autoUpdate",
          enabled,
        );

        expect(
          updater.autoDownload,
        ).toBe(enabled);

        expect(
          mocks.checkForUpdatesAndNotify,
        ).toHaveBeenCalledTimes(
          enabled ? 1 : 0,
        );
      },
    );

    it("persists audit information when auto-update setting changes", async () => {
      mocks.autoUpdateSetting = false;

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      await handler(
        createEvent(),
        true,
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith({
        category: "config",
        action: "AUTO_UPDATE_CHANGED",
        status: "success",
        details: {
          enabled: true,
        },
      });
    });

    it("rejects unauthorized renderer", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      const response = await handler(
        createEvent(),
        true,
      );

      expect(response).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });

      expect(
        mocks.storeSet,
      ).not.toHaveBeenCalled();

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
    });

    it("rejects user without audit permission", async () => {
      mocks.canViewAuditLogs.mockReturnValue(false);

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      const response = await handler(
        createEvent(),
        true,
      );

      expect(response).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });

      expect(
        mocks.storeSet,
      ).not.toHaveBeenCalled();

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();
    });

    it("rejects a non-boolean setting without changing store or updater", async () => {
      mocks.autoUpdateSetting = false;

      UpdatesHandler(mainWindow);

      const initialAutoDownload =
        updater.autoDownload;

      const handler =
        getHandler("set-auto-update");

      const response = await handler(
        createEvent(),
        "true",
      );

      expect(response).toEqual({
        status: false,
        message:
          "backend.update.invalid_setting",
      });

      expect(
        mocks.storeSet,
      ).not.toHaveBeenCalled();

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();

      expect(
        updater.autoDownload,
      ).toBe(initialAutoDownload);

      expect(
        mocks.checkForUpdatesAndNotify,
      ).not.toHaveBeenCalled();
    });

    it("does not mutate setting when audit storage is unavailable", async () => {
      mocks.autoUpdateSetting = false;

      mocks.checkAuditLogWritable.mockResolvedValueOnce({
        status: false,
        message:
          "backend.audit.storage_unavailable",
        path: "C:/logs",
        lastFailureAt:
          new Date().toISOString(),
        rawError: "disk full",
      });

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      const response = await handler(
        createEvent(),
        true,
      );

      expect(response).toEqual({
        status: false,
        message:
          "backend.audit.storage_unavailable",
        rawError: "disk full",
      });

      expect(
        mocks.storeSet,
      ).not.toHaveBeenCalled();

      expect(
        updater.autoDownload,
      ).toBe(false);

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
    });

    it("rolls back store and updater state when final audit log fails", async () => {
      mocks.autoUpdateSetting = false;

      mocks.appendAuditLog.mockResolvedValueOnce(
        false,
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      const response = await handler(
        createEvent(),
        true,
      );

      expect(response).toEqual({
        status: false,
        message:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.storeSet,
      ).toHaveBeenNthCalledWith(
        1,
        "autoUpdate",
        true,
      );

      expect(
        mocks.storeSet,
      ).toHaveBeenNthCalledWith(
        2,
        "autoUpdate",
        false,
      );

      expect(
        mocks.autoUpdateSetting,
      ).toBe(false);

      expect(
        updater.autoDownload,
      ).toBe(false);

      expect(
        mocks.checkForUpdatesAndNotify,
      ).not.toHaveBeenCalled();
    });

    it("starts automatic checking after enabling auto updates", async () => {
      mocks.autoUpdateSetting = false;

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("set-auto-update");

      await handler(
        createEvent(),
        true,
      );

      expect(
        mocks.checkForUpdatesAndNotify,
      ).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(
        UPDATE_CHECK_INTERVAL,
      );

      /*
       * Interval używa checkForAutomaticUpdate().
       * W dev checkForAutomaticUpdate używa checkForUpdates().
       */
      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledOnce();
    });

    it("stops automatic checking after disabling auto updates", async () => {
      mocks.autoUpdateSetting = true;

      UpdatesHandler(mainWindow);

      emitWindowEvent("ready-to-show");

      await flushPromises();

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledOnce();

      const handler =
        getHandler("set-auto-update");

      await handler(
        createEvent(),
        false,
      );

      await vi.advanceTimersByTimeAsync(
        UPDATE_CHECK_INTERVAL,
      );

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledOnce();
    });
  });

  describe("manual check-for-updates", () => {
    it("keeps manual update checks working while auto updates are disabled", async () => {
      mocks.autoUpdateSetting = false;

      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "2.0.0",
        },
      });

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(
        mocks.checkForUpdates,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.downloadUpdate,
      ).toHaveBeenCalledOnce();

      expect(response).toEqual({
        status: true,
        updateAvailable: true,
        version: "2.0.0",
      });

      expect(
        updater.autoDownload,
      ).toBe(false);
    });

    it("restores autoDownload after manual update check", async () => {
      mocks.autoUpdateSetting = true;

      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "2.0.0",
        },
      });

      UpdatesHandler(mainWindow);

      expect(
        updater.autoDownload,
      ).toBe(true);

      const handler =
        getHandler("check-for-updates");

      await handler(createEvent());

      expect(
        updater.autoDownload,
      ).toBe(true);
    });

    it("does not download when current version is already latest", async () => {
      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "1.2.1",
        },
      });

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(response).toEqual({
        status: true,
        updateAvailable: false,
        version: "1.2.1",
      });

      expect(
        mocks.downloadUpdate,
      ).not.toHaveBeenCalled();
    });

    it("handles response without update version", async () => {
      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {},
      });

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(response).toEqual({
        status: true,
        updateAvailable: false,
      });

      expect(
        mocks.downloadUpdate,
      ).not.toHaveBeenCalled();
    });

    it("handles invalid semver without downloading", async () => {
      mocks.checkForUpdates.mockResolvedValue({
        updateInfo: {
          version: "not-a-version",
        },
      });

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(response).toEqual({
        status: true,
        updateAvailable: false,
      });

      expect(
        mocks.downloadUpdate,
      ).not.toHaveBeenCalled();
    });

    it("returns error when manual update check fails", async () => {
      mocks.checkForUpdates.mockRejectedValue(
        new Error("network error"),
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(response).toEqual({
        status: false,
        message: "network error",
      });

      expect(
        updater.autoDownload,
      ).toBe(true);
    });

    it("rejects manual update check from unauthorized renderer", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("check-for-updates");

      const response = await handler(
        createEvent(),
      );

      expect(response).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });

      expect(
        mocks.checkForUpdates,
      ).not.toHaveBeenCalled();

      expect(
        mocks.downloadUpdate,
      ).not.toHaveBeenCalled();
    });
  });

  describe("autoUpdater events", () => {
    it("forwards update-available to renderer", () => {
      UpdatesHandler(mainWindow);

      emitUpdaterEvent("update-available");

      expect(
        mocks.webContentsSend,
      ).toHaveBeenCalledWith(
        "update_available",
      );
    });

    it("forwards download progress as rounded percentage", () => {
      UpdatesHandler(mainWindow);

      emitUpdaterEvent(
        "download-progress",
        {
          percent: 52.7,
        },
      );

      expect(
        mocks.webContentsSend,
      ).toHaveBeenCalledWith(
        "download_progress",
        {
          percent: "53",
        },
      );
    });

    it("forwards update-downloaded to renderer", () => {
      UpdatesHandler(mainWindow);

      emitUpdaterEvent("update-downloaded");

      expect(
        mocks.webContentsSend,
      ).toHaveBeenCalledWith(
        "update_downloaded",
      );
    });
  });

  describe("restart_app", () => {
    it("restarts application when renderer is authorized", () => {
      UpdatesHandler(mainWindow);

      const handler =
        getHandler("restart_app");

      handler(createEvent());

      expect(
        mocks.quitAndInstall,
      ).toHaveBeenCalledOnce();
    });

    it("does not restart application for unauthorized renderer", () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      UpdatesHandler(mainWindow);

      const handler =
        getHandler("restart_app");

      handler(createEvent());

      expect(
        mocks.quitAndInstall,
      ).not.toHaveBeenCalled();
    });
  });
});
