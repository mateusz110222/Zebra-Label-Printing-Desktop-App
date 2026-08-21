import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { PrinterConfig } from "../utils/store";

import SavePrinterConfig from "../config/SavePrinterConfig";

const mocks = vi.hoisted(() => ({
  handler: undefined as
    | ((
    event: unknown,
    config: PrinterConfig,
  ) => Promise<unknown>)
    | undefined,

  printerConfig: {
    type: "IP",
    ip: "10.0.0.10",
    port: 9100,
  } as PrinterConfig,

  isMainRendererAuthorized: vi.fn(() => true),

  storeGet: vi.fn(),
  storeSet: vi.fn(),

  appendAuditLog: vi.fn(),
  checkAuditLogWritable: vi.fn(),
  canViewAuditLogs: vi.fn(() => true),
}));

const createEvent = (): IpcMainInvokeEvent =>
  ({}) as IpcMainInvokeEvent;

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (
        channel: string,
        handler: (
          event: unknown,
          config: PrinterConfig,
        ) => Promise<unknown>,
      ) => {
        if (channel === "save-printer-config") {
          mocks.handler = handler;
        }
      },
    ),
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

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized:
  mocks.isMainRendererAuthorized,
}));

const getHandler = () => {
  if (!mocks.handler) {
    throw new Error(
      "save-printer-config handler was not registered",
    );
  }

  return mocks.handler;
};

describe("SavePrinterConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.handler = undefined;

    mocks.printerConfig = {
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    };

    mocks.isMainRendererAuthorized.mockReturnValue(
      true,
    );

    mocks.canViewAuditLogs.mockReturnValue(true);

    mocks.storeGet.mockImplementation(
      (key: string) => {
        if (key === "printer") {
          return {
            ...mocks.printerConfig,
          };
        }

        return undefined;
      },
    );

    mocks.storeSet.mockImplementation(
      (
        key: string,
        value: PrinterConfig,
      ) => {
        if (key === "printer") {
          mocks.printerConfig = {
            ...value,
          };
        }
      },
    );

    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      message: "backend.audit.storage_ready",
      path: "C:/logs",
      lastFailureAt: null,
    });

    mocks.appendAuditLog.mockResolvedValue(true);

    SavePrinterConfig();
  });

  it("rejects an unauthorized renderer before doing anything else", async () => {
    mocks.isMainRendererAuthorized.mockReturnValue(
      false,
    );

    const response = await getHandler()(
      createEvent(),
      {
        type: "IP",
        ip: "10.0.0.20",
        port: 9100,
      },
    );

    expect(response).toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });

    expect(
      mocks.canViewAuditLogs,
    ).not.toHaveBeenCalled();

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(
      mocks.storeGet,
    ).not.toHaveBeenCalled();

    expect(
      mocks.storeSet,
    ).not.toHaveBeenCalled();

    expect(
      mocks.appendAuditLog,
    ).not.toHaveBeenCalled();
  });

  it("rejects a user without IT audit permission", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);

    const response = await getHandler()(
      createEvent(),
      {
        type: "IP",
        ip: "10.0.0.20",
        port: 9100,
      },
    );

    expect(response).toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(
      mocks.storeSet,
    ).not.toHaveBeenCalled();

    expect(
      mocks.appendAuditLog,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "missing IP",
      config: {
        type: "IP",
        ip: "",
        port: 9100,
      } as PrinterConfig,
    },
    {
      name: "missing port",
      config: {
        type: "IP",
        ip: "10.0.0.20",
        port: 0,
      } as PrinterConfig,
    },
  ])(
    "rejects IP configuration with $name",
    async ({ config }) => {
      const response = await getHandler()(
        createEvent(),
        config,
      );

      expect(response).toEqual({
        status: false,
        message:
          "backend.config.invalid_ip_port",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith({
        category: "config",
        action:
          "PRINTER_CONFIG_CHANGED",
        status: "failure",
        details: {
          type: "IP",
          reason: "invalid_ip_port",
        },
      });

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();

      expect(
        mocks.storeSet,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects COM configuration without a selected port", async () => {
    const config = {
      type: "COM",
      comPort: "",
      baudRate: 115200,
    } as PrinterConfig;

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: false,
      message: "backend.config.no_com_selected",
    });

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "failure",
      details: {
        type: "COM",
        reason: "no_com_selected",
      },
    });

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(
      mocks.storeSet,
    ).not.toHaveBeenCalled();
  });

  it("rejects USB configuration without a Windows printer queue", async () => {
    const config = {
      type: "USB",
      usbPrinterName: "   ",
    } as PrinterConfig;

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: false,
      message: "backend.config.no_usb_selected",
    });

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "failure",
      details: {
        type: "USB",
        reason: "no_usb_selected",
      },
    });

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(
      mocks.storeSet,
    ).not.toHaveBeenCalled();
  });

  it("does not change configuration when audit preflight fails", async () => {
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      message:
        "backend.audit.storage_unavailable",
      path: "C:/logs",
      lastFailureAt:
        "2026-08-21T10:00:00.000Z",
      rawError: "read only",
    });

    const response = await getHandler()(
      createEvent(),
      {
        type: "IP",
        ip: "10.0.0.20",
        port: 9100,
      },
    );

    expect(response).toEqual({
      status: false,
      message:
        "backend.audit.storage_unavailable",
      rawError: "read only",
    });

    expect(
      mocks.storeSet,
    ).not.toHaveBeenCalled();

    expect(
      mocks.appendAuditLog,
    ).not.toHaveBeenCalled();

    expect(
      mocks.printerConfig,
    ).toEqual({
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    });
  });

  it("stores a valid IP printer configuration", async () => {
    const config: PrinterConfig = {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    };

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: true,
      message: "backend.config.save_success",
    });

    expect(
      mocks.checkAuditLogWritable,
    ).toHaveBeenCalledOnce();

    expect(
      mocks.storeGet,
    ).toHaveBeenCalledWith("printer");

    expect(
      mocks.storeSet,
    ).toHaveBeenCalledWith(
      "printer",
      config,
    );

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "success",
      details: {
        type: "IP",
        target: "10.0.0.20:9100",
      },
    });

    expect(
      mocks.printerConfig,
    ).toEqual(config);
  });

  it("stores a valid COM printer configuration", async () => {
    const config: PrinterConfig = {
      type: "COM",
      comPort: "COM7",
      baudRate: 115200,
    };

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: true,
      message: "backend.config.save_success",
    });

    expect(
      mocks.storeSet,
    ).toHaveBeenCalledWith(
      "printer",
      config,
    );

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "success",
      details: {
        type: "COM",
        target: "COM7@115200",
      },
    });

    expect(
      mocks.printerConfig,
    ).toEqual(config);
  });

  it("stores the selected USB printer queue", async () => {
    const config: PrinterConfig = {
      type: "USB",
      usbPrinterName:
        "ZDesigner ZD421-203dpi ZPL",
    };

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: true,
      message: "backend.config.save_success",
    });

    expect(
      mocks.storeSet,
    ).toHaveBeenCalledWith(
      "printer",
      config,
    );

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "success",
      details: {
        type: "USB",
        target:
          "ZDesigner ZD421-203dpi ZPL",
      },
    });

    expect(
      mocks.printerConfig,
    ).toEqual(config);
  });

  it("restores previous configuration when final audit persistence fails", async () => {
    mocks.appendAuditLog.mockResolvedValueOnce(
      false,
    );

    const config: PrinterConfig = {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    };

    const response = await getHandler()(
      createEvent(),
      config,
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
      "printer",
      config,
    );

    expect(
      mocks.storeSet,
    ).toHaveBeenNthCalledWith(
      2,
      "printer",
      {
        type: "IP",
        ip: "10.0.0.10",
        port: 9100,
      },
    );

    expect(
      mocks.printerConfig,
    ).toEqual({
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    });
  });

  it("returns save_fail and audits failure when storing configuration throws", async () => {
    mocks.storeSet.mockImplementationOnce(
      () => {
        throw new Error(
          "Failed to write electron-store",
        );
      },
    );

    const config: PrinterConfig = {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    };

    const response = await getHandler()(
      createEvent(),
      config,
    );

    expect(response).toEqual({
      status: false,
      message: "backend.config.save_fail",
      rawError:
        "Failed to write electron-store",
    });

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledWith({
      category: "config",
      action:
        "PRINTER_CONFIG_CHANGED",
      status: "failure",
      details: {
        error:
          "Failed to write electron-store",
      },
    });

    expect(
      mocks.printerConfig,
    ).toEqual({
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    });
  });

  it("checks audit storage before mutating a valid configuration", async () => {
    const config: PrinterConfig = {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    };

    await getHandler()(
      createEvent(),
      config,
    );

    expect(
      mocks.checkAuditLogWritable.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocks.storeSet.mock
        .invocationCallOrder[0],
    );
  });

  it("writes successful audit after storing the new configuration", async () => {
    const config: PrinterConfig = {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    };

    await getHandler()(
      createEvent(),
      config,
    );

    expect(
      mocks.storeSet.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocks.appendAuditLog.mock
        .invocationCallOrder[0],
    );
  });
});
