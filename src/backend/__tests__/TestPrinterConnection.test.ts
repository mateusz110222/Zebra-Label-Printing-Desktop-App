import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { PrinterConfig } from "../utils/store";

import TestPrinterConnection from "../printer/TestPrinterConnection";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),

  storeGet: vi.fn(),

  readFile: vi.fn(),

  getTemplatesPath: vi.fn(() => "C:/templates"),

  isMainRendererAuthorized: vi.fn(() => true),

  ipConnection: vi.fn(),
  comConnection: vi.fn(),
  usbConnection: vi.fn(),

  appendAuditLog: vi.fn(),
  canViewAuditLogs: vi.fn(() => true),
  checkAuditLogWritable: vi.fn(),

  app: {
    isPackaged: false,

    getAppPath: vi.fn(
      () => "C:/workspace/application",
    ),

    getPath: vi.fn((name: string) => {
      if (name === "exe") {
        return "C:/Program Files/Label App/Label App.exe";
      }

      if (name === "userData") {
        return "C:/Users/COATING/AppData/Roaming/Label App";
      }

      return "C:/workspace/application";
    }),

    getVersion: vi.fn(() => "1.2.1"),
  },
}));

const createEvent = (): IpcMainInvokeEvent =>
  ({}) as IpcMainInvokeEvent;

vi.mock("electron", () => ({
  app: mocks.app,

  ipcMain: {
    handle: mocks.handle,
  },
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
  },
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized:
  mocks.isMainRendererAuthorized,
}));

vi.mock(
  "node:fs/promises",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("node:fs/promises")
      >();

    return {
      ...actual,
      readFile: mocks.readFile,
    };
  },
);

vi.mock("../system/TemplatePaths", () => ({
  getTemplatesPath: mocks.getTemplatesPath,
}));

vi.mock(
  "../PrinterConnections/IpConnection",
  () => ({
    default: mocks.ipConnection,
  }),
);

vi.mock(
  "../PrinterConnections/COMConnection",
  () => ({
    default: mocks.comConnection,
  }),
);

vi.mock(
  "../PrinterConnections/USBConnection",
  () => ({
    default: mocks.usbConnection,
  }),
);

vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable:
  mocks.checkAuditLogWritable,
}));

type TestPrinterHandler = (
  event: unknown,
  candidate?: PrinterConfig,
) => Promise<{
  status: boolean;
  message: string;
  rawError?: string;
  auditPersisted?: boolean;
  auditStatusMessage?: string;
}>;

const getHandler = (): TestPrinterHandler => {
  const registration =
    mocks.handle.mock.calls.find(
      ([channel]) =>
        channel === "test-printer-connection",
    );

  if (!registration) {
    throw new Error(
      "test-printer-connection handler was not registered",
    );
  }

  return registration[1] as TestPrinterHandler;
};

const ipCandidate: PrinterConfig = {
  type: "IP",
  ip: "10.20.30.40",
  port: 9100,
};

describe("TestPrinterConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isMainRendererAuthorized.mockReturnValue(
      true,
    );

    mocks.canViewAuditLogs.mockReturnValue(true);

    mocks.storeGet.mockReturnValue(ipCandidate);

    mocks.getTemplatesPath.mockReturnValue(
      "C:/templates",
    );

    mocks.readFile.mockResolvedValue(
      "^XA^FDTEST^FS^XZ",
    );

    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      path: "C:/logs",
      message: "backend.audit.storage_ready",
      lastFailureAt: null,
    });

    mocks.appendAuditLog.mockResolvedValue(true);

    mocks.ipConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.print_success",
    });

    mocks.comConnection.mockResolvedValue({
      status: true,
      message:
        "backend.printer.label_sent_successfully",
    });

    mocks.usbConnection.mockResolvedValue({
      status: true,
      message:
        "backend.printer.label_sent_successfully",
    });

    TestPrinterConnection();
  });

  it("rejects an unauthorized renderer before reading or sending", async () => {
    mocks.isMainRendererAuthorized.mockReturnValue(
      false,
    );

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });

    expect(
      mocks.canViewAuditLogs,
    ).not.toHaveBeenCalled();

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("blocks a user without an IT audit session before reading or sending", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });

    expect(
      mocks.checkAuditLogWritable,
    ).not.toHaveBeenCalled();

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("uses stored printer configuration when candidate is not provided", async () => {
    const result = await getHandler()(
      createEvent(),
    );

    expect(mocks.storeGet).toHaveBeenCalledWith(
      "printer",
    );

    expect(mocks.ipConnection).toHaveBeenCalledWith(
      ipCandidate,
      "^XA^FDTEST^FS^XZ",
    );

    expect(result.status).toBe(true);
  });

  it("uses candidate configuration instead of stored configuration", async () => {
    const candidate: PrinterConfig = {
      type: "IP",
      ip: "192.168.1.50",
      port: 9100,
    };

    await getHandler()(createEvent(), candidate);

    expect(
      mocks.storeGet,
    ).not.toHaveBeenCalled();

    expect(mocks.ipConnection).toHaveBeenCalledWith(
      candidate,
      "^XA^FDTEST^FS^XZ",
    );
  });

  it("blocks sending when the audit storage is not writable", async () => {
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: false,
      path: "C:/logs",
      message:
        "backend.audit.storage_unavailable",
      lastFailureAt:
        "2026-08-18T08:00:00.000Z",
      rawError: "Access denied",
    });

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(result).toEqual({
      status: false,
      message:
        "backend.audit.storage_unavailable",
      rawError: "Access denied",
      auditPersisted: false,
    });

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("reads the dedicated test label template", async () => {
    await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(mocks.readFile).toHaveBeenCalledWith(
      path.join(
        "C:/templates",
        "Test_Print_label.zpl",
      ),
      "utf-8",
    );
  });

  it("records TEST_LABEL_DATA_SENT after a successful IP test send", async () => {
    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    const preparationCallIndex =
      mocks.appendAuditLog.mock.calls.findIndex(
        ([entry]) =>
          (
            entry as {
              action?: string;
            }
          ).action ===
          "TEST_LABEL_DATA_PREPARED",
      );

    expect(mocks.ipConnection).toHaveBeenCalledWith(
      ipCandidate,
      "^XA^FDTEST^FS^XZ",
    );

    expect(
      preparationCallIndex,
    ).toBeGreaterThanOrEqual(0);

    expect(
      mocks.appendAuditLog.mock.calls[
        preparationCallIndex
        ][0],
    ).toEqual(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_PREPARED",
        status: "success",

        details: expect.objectContaining({
          printMode: "test",
          labelFormat: "Test_Print_label.zpl",
          printerType: "IP",
          printerTarget: "10.20.30.40:9100",
          deliveryState: "prepared",
        }),
      }),
    );

    expect(
      mocks.appendAuditLog.mock.invocationCallOrder[
        preparationCallIndex
        ],
    ).toBeLessThan(
      mocks.ipConnection.mock.invocationCallOrder[0],
    );

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_SENT",
        status: "success",

        details: expect.objectContaining({
          printMode: "test",
          printerType: "IP",
          printerTarget: "10.20.30.40:9100",
          printerMessage:
            "backend.printer.print_success",
        }),
      }),
    );

    expect(result).toMatchObject({
      status: true,
      auditPersisted: true,
      auditStatusMessage:
        "backend.audit.storage_ready",
    });
  });

  it("does not send the test label when preparation audit cannot be persisted", async () => {
    mocks.appendAuditLog.mockResolvedValueOnce(
      false,
    );

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledTimes(1);

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_PREPARED",
        status: "success",
      }),
    );

    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();

    expect(result).toEqual({
      status: false,
      message:
        "backend.audit.storage_unavailable",
      auditPersisted: false,
      auditStatusMessage:
        "backend.audit.storage_unavailable",
    });
  });

  it("reports audit failure when printer data was sent but final audit cannot be persisted", async () => {
    mocks.appendAuditLog
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(mocks.ipConnection).toHaveBeenCalledOnce();

    expect(result).toMatchObject({
      status: true,
      message: "backend.printer.print_success",
      auditPersisted: false,
      auditStatusMessage:
        "backend.audit.storage_unavailable",
    });
  });

  it("records TEST_LABEL_SEND_FAILED after a failed COM test send", async () => {
    const comCandidate: PrinterConfig = {
      type: "COM",
      comPort: "COM7",
      baudRate: 115200,
    };

    mocks.comConnection.mockResolvedValue({
      status: false,
      message:
        "backend.printer.com_write_error",
      rawError: "Write failed",
    });

    const result = await getHandler()(
      createEvent(),
      comCandidate,
    );

    expect(mocks.comConnection).toHaveBeenCalledWith(
      comCandidate,
      "^XA^FDTEST^FS^XZ",
    );

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_SEND_FAILED",
        status: "failure",

        details: expect.objectContaining({
          printerType: "COM",
          printerTarget: "COM7@115200",
          printerMessage:
            "backend.printer.com_write_error",
          printerError: "Write failed",
        }),
      }),
    );

    expect(result).toMatchObject({
      status: false,
      message:
        "backend.printer.com_write_error",
      rawError: "Write failed",
      auditPersisted: true,
      auditStatusMessage:
        "backend.audit.storage_ready",
    });
  });

  it("uses the default COM baud rate in audit target when baudRate is missing", async () => {
    const comCandidate = {
      type: "COM",
      comPort: "COM4",
    } as PrinterConfig;

    await getHandler()(
      createEvent(),
      comCandidate,
    );

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          printerType: "COM",
          printerTarget: "COM4@9600",
        }),
      }),
    );
  });

  it("sends a test label through the selected Windows USB queue", async () => {
    const usbCandidate: PrinterConfig = {
      type: "USB",
      usbPrinterName:
        "ZDesigner ZD421-203dpi ZPL",
    };

    const result = await getHandler()(
      createEvent(),
      usbCandidate,
    );

    expect(mocks.usbConnection).toHaveBeenCalledWith(
      usbCandidate,
      "^XA^FDTEST^FS^XZ",
    );

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEST_LABEL_DATA_SENT",

        details: expect.objectContaining({
          printerType: "USB",
          printerTarget:
            "ZDesigner ZD421-203dpi ZPL",
        }),
      }),
    );

    expect(result).toMatchObject({
      status: true,
      auditPersisted: true,
    });
  });

  it("returns unknown_connection for an unsupported printer type", async () => {
    const invalidCandidate = {
      type: "UNKNOWN",
    } as unknown as PrinterConfig;

    const result = await getHandler()(
      createEvent(),
      invalidCandidate,
    );

    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      status: false,
      message:
        "backend.printer.unknown_connection",
      auditPersisted: true,
    });

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEST_LABEL_SEND_FAILED",
        status: "failure",
      }),
    );
  });

  it("returns test_error and audits failure when template cannot be read", async () => {
    mocks.readFile.mockRejectedValue(
      new Error("ENOENT: template missing"),
    );

    const result = await getHandler()(
      createEvent(),
      ipCandidate,
    );

    expect(result).toEqual({
      status: false,
      message:
        "backend.config_view.test_error",
      rawError: "ENOENT: template missing",
    });

    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.usbConnection).not.toHaveBeenCalled();

    expect(
      mocks.appendAuditLog,
    ).toHaveBeenCalledOnce();

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_SEND_FAILED",
        status: "failure",

        details: expect.objectContaining({
          printMode: "test",
          labelFormat: "Test_Print_label.zpl",
          printerType: "IP",
          printerTarget: "10.20.30.40:9100",
          printerMessage:
            "backend.config_view.test_error",
          printerError:
            "ENOENT: template missing",
        }),
      }),
    );
  });
});
