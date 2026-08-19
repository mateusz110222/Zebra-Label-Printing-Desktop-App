import { beforeEach, describe, expect, it, vi } from "vitest";
import SavePrinterConfig from "../SavePrinterConfig";

const mocks = vi.hoisted(() => ({
  handler: undefined as
    | ((event: unknown, config: Record<string, unknown>) => Promise<unknown>)
    | undefined,
  printerConfig: {
    type: "IP",
    ip: "10.0.0.10",
    port: 9100,
  } as Record<string, unknown>,
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  appendAuditLog: vi.fn(),
  checkAuditLogWritable: vi.fn(),
  canViewAuditLogs: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (
        _channel: string,
        handler: (
          event: unknown,
          config: Record<string, unknown>,
        ) => Promise<unknown>,
      ) => {
        mocks.handler = handler;
      },
    ),
  },
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
  canViewAuditLogs: mocks.canViewAuditLogs,
}));

describe("SavePrinterConfig audit durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handler = undefined;
    mocks.printerConfig = { type: "IP", ip: "10.0.0.10", port: 9100 };
    mocks.storeGet.mockImplementation(() => ({ ...mocks.printerConfig }));
    mocks.storeSet.mockImplementation(
      (_key: string, value: Record<string, unknown>) => {
        mocks.printerConfig = { ...value };
      },
    );
    mocks.canViewAuditLogs.mockReturnValue(true);
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      message: "backend.audit.storage_ready",
      path: "C:/logs",
      lastFailureAt: null,
    });
    mocks.appendAuditLog.mockResolvedValue(true);
    SavePrinterConfig();
  });

  it("does not change configuration when the audit preflight fails", async () => {
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      message: "backend.audit.storage_unavailable",
      path: "C:/logs",
      lastFailureAt: new Date().toISOString(),
      rawError: "read only",
    });

    const response = await mocks.handler!(undefined, {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    });

    expect(response).toMatchObject({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("restores the previous configuration when final audit persistence fails", async () => {
    mocks.appendAuditLog.mockResolvedValueOnce(false);

    const response = await mocks.handler!(undefined, {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    });

    expect(response).toEqual({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.storeSet).toHaveBeenNthCalledWith(1, "printer", {
      type: "IP",
      ip: "10.0.0.20",
      port: 9100,
    });
    expect(mocks.storeSet).toHaveBeenNthCalledWith(2, "printer", {
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    });
    expect(mocks.printerConfig).toEqual({
      type: "IP",
      ip: "10.0.0.10",
      port: 9100,
    });
  });

  it("rejects USB configuration without a Windows printer queue", async () => {
    const response = await mocks.handler!(undefined, {
      type: "USB",
      usbPrinterName: "   ",
    });

    expect(response).toEqual({
      status: false,
      message: "backend.config.no_usb_selected",
    });
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        details: { type: "USB", reason: "no_usb_selected" },
      }),
    );
  });

  it("stores the selected USB printer queue", async () => {
    const config = {
      type: "USB",
      usbPrinterName: "ZDesigner ZD421-203dpi ZPL",
    };

    const response = await mocks.handler!(undefined, config);

    expect(response).toMatchObject({ status: true });
    expect(mocks.storeSet).toHaveBeenCalledWith("printer", config);
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          type: "USB",
          target: "ZDesigner ZD421-203dpi ZPL",
        }),
      }),
    );
  });
});
