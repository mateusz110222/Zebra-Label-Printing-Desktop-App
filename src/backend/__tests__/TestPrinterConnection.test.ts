import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrinterConfig } from "../store";
import TestPrinterConnection from "../TestPrinterConnection";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  storeGet: vi.fn(),
  readFile: vi.fn(),
  getTemplatesPath: vi.fn(() => "C:/templates"),
  ipConnection: vi.fn(),
  comConnection: vi.fn(),
  usbConnection: vi.fn(),
  appendAuditLog: vi.fn(),
  canViewAuditLogs: vi.fn(),
  checkAuditLogWritable: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: mocks.handle },
}));

vi.mock("../store", () => ({
  store: { get: mocks.storeGet },
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("../TemplatePaths", () => ({
  getTemplatesPath: mocks.getTemplatesPath,
}));

vi.mock("../PrinterConnections/IpConnection", () => ({
  default: mocks.ipConnection,
}));

vi.mock("../PrinterConnections/COMConnection", () => ({
  default: mocks.comConnection,
}));

vi.mock("../PrinterConnections/USBConnection", () => ({
  default: mocks.usbConnection,
}));

vi.mock("../AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable: mocks.checkAuditLogWritable,
}));

type TestPrinterHandler = (
  event: unknown,
  candidate?: PrinterConfig,
) => Promise<{
  status: boolean;
  message: string;
  rawError?: string;
  auditPersisted?: boolean;
}>;

const getHandler = (): TestPrinterHandler => {
  const registration = mocks.handle.mock.calls.find(
    ([channel]) => channel === "test-printer-connection",
  );
  if (!registration) {
    throw new Error("test-printer-connection handler was not registered");
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
    mocks.storeGet.mockReturnValue(ipCandidate);
    mocks.readFile.mockResolvedValue("^XA^FDTEST^FS^XZ");
    mocks.canViewAuditLogs.mockReturnValue(true);
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
      message: "backend.printer.label_sent_successfully",
    });
    mocks.usbConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.label_sent_successfully",
    });
    TestPrinterConnection();
  });

  it("blocks a user without an IT audit session before reading or sending", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);

    const result = await getHandler()(undefined, ipCandidate);

    expect(result).toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });
    expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("blocks sending when the audit storage is not writable", async () => {
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: false,
      path: "C:/logs",
      message: "backend.audit.storage_unavailable",
      lastFailureAt: "2026-08-18T08:00:00.000Z",
      rawError: "Access denied",
    });

    const result = await getHandler()(undefined, ipCandidate);

    expect(result).toEqual({
      status: false,
      message: "backend.audit.storage_unavailable",
      rawError: "Access denied",
      auditPersisted: false,
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("records TEST_LABEL_DATA_SENT after a successful test send", async () => {
    const result = await getHandler()(undefined, ipCandidate);

    const preparationCallIndex = mocks.appendAuditLog.mock.calls.findIndex(
      ([entry]) => entry.action === "TEST_LABEL_DATA_PREPARED",
    );

    expect(mocks.ipConnection).toHaveBeenCalledWith(
      ipCandidate,
      "^XA^FDTEST^FS^XZ",
    );
    expect(preparationCallIndex).toBeGreaterThanOrEqual(0);
    expect(mocks.appendAuditLog).toHaveBeenNthCalledWith(
      preparationCallIndex + 1,
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_PREPARED",
        status: "success",
        details: expect.objectContaining({
          printMode: "test",
          printerType: "IP",
          printerTarget: "10.20.30.40:9100",
          deliveryState: "prepared",
        }),
      }),
    );
    expect(
      mocks.appendAuditLog.mock.invocationCallOrder[preparationCallIndex],
    ).toBeLessThan(mocks.ipConnection.mock.invocationCallOrder[0]);
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_SENT",
        status: "success",
        details: expect.objectContaining({
          printMode: "test",
          printerType: "IP",
          printerTarget: "10.20.30.40:9100",
        }),
      }),
    );
    expect(result).toMatchObject({
      status: true,
      auditPersisted: true,
      auditStatusMessage: "backend.audit.storage_ready",
    });
  });

  it("does not send the test label when the preparation audit cannot be persisted", async () => {
    mocks.appendAuditLog.mockResolvedValueOnce(false);

    const result = await getHandler()(undefined, ipCandidate);

    expect(mocks.appendAuditLog).toHaveBeenCalledTimes(1);
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "print",
        action: "TEST_LABEL_DATA_PREPARED",
        status: "success",
      }),
    );
    expect(mocks.ipConnection).not.toHaveBeenCalled();
    expect(mocks.comConnection).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: false,
      message: "backend.audit.storage_unavailable",
      auditPersisted: false,
      auditStatusMessage: "backend.audit.storage_unavailable",
    });
  });

  it("records TEST_LABEL_SEND_FAILED after a failed test send", async () => {
    const comCandidate: PrinterConfig = {
      type: "COM",
      comPort: "COM7",
      baudRate: 115200,
    };
    mocks.comConnection.mockResolvedValue({
      status: false,
      message: "backend.printer.com_write_error",
      rawError: "Write failed",
    });

    const result = await getHandler()(undefined, comCandidate);

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
          printerError: "Write failed",
        }),
      }),
    );
    expect(result).toMatchObject({
      status: false,
      message: "backend.printer.com_write_error",
      auditPersisted: true,
    });
  });

  it("sends a test label through the selected Windows USB queue", async () => {
    const usbCandidate: PrinterConfig = {
      type: "USB",
      usbPrinterName: "ZDesigner ZD421-203dpi ZPL",
    };

    const result = await getHandler()(undefined, usbCandidate);

    expect(mocks.usbConnection).toHaveBeenCalledWith(
      usbCandidate,
      "^XA^FDTEST^FS^XZ",
    );
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEST_LABEL_DATA_SENT",
        details: expect.objectContaining({
          printerType: "USB",
          printerTarget: "ZDesigner ZD421-203dpi ZPL",
        }),
      }),
    );
    expect(result).toMatchObject({ status: true });
  });
});
