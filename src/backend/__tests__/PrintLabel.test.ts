import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupLabelHandlers from "../PrintLabel";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  canViewAuditLogs: vi.fn(() => true),
  appendAuditLog: vi.fn().mockResolvedValue(true),
  checkAuditLogWritable: vi.fn(),
  generatePrintZPL: vi.fn(),
  generateReprintZPL: vi.fn(),
  ipConnection: vi.fn(),
  queryPrinterStatus: vi.fn(),
  resolveAuthoritativePart: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.handlers.set(channel, handler);
      },
    ),
  },
}));

vi.mock("../store", () => ({
  store: {
    get: vi.fn(() => ({ type: "IP", ip: "10.0.0.10", port: 9100 })),
  },
}));

vi.mock("../PrinterConnections/IpConnection", () => ({
  default: mocks.ipConnection,
}));

vi.mock("../PrinterConnections/COMConnection", () => ({
  default: vi.fn(),
}));

vi.mock("../hooks/ZPLService", () => ({
  generatePrintZPL: mocks.generatePrintZPL,
  generateReprintZPL: mocks.generateReprintZPL,
}));

vi.mock("../AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable: mocks.checkAuditLogWritable,
  getAuditActor: vi.fn(() => "operator"),
}));

vi.mock("../PrinterStatus", () => ({
  queryPrinterStatus: mocks.queryPrinterStatus,
}));

vi.mock("../PartsResolver", () => ({
  resolveAuthoritativePart: mocks.resolveAuthoritativePart,
}));

const part = {
  Part_Number: "42022977",
  Part_Description: "LOWER AC",
  Serial_Prefix: "A",
  Label_Format: "16x13",
};

const canonicalPart = {
  Operation: "AUDI_LOWERAC",
  Part_Number: "42022977",
  Part_Description: "LOWER AC CANONICAL",
  Serial_Prefix: "42022977A",
  Label_Format: "16x13",
};

const generatedLabel = {
  serialNumber: "0200",
  julianDate: "26225",
  bmsDate: "13H6",
  zplSha256: "hash",
};

describe("print IPC authorization and delivery audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.canViewAuditLogs.mockReturnValue(true);
    mocks.appendAuditLog.mockResolvedValue(true);
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      path: "C:/logs",
      message: "backend.audit.storage_ready",
      lastFailureAt: null,
    });
    mocks.generatePrintZPL.mockResolvedValue({
      status: true,
      message: "backend.print.print_success",
      data: "^XA^XZ",
      labels: [generatedLabel],
    });
    mocks.generateReprintZPL.mockResolvedValue({
      status: true,
      message: "backend.print.reprint_success",
      data: "^XA^XZ",
      labels: [generatedLabel],
    });
    mocks.ipConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.sent",
    });
    mocks.queryPrinterStatus.mockResolvedValue({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: true,
      message: "backend.printer.ready",
    });
    mocks.resolveAuthoritativePart.mockResolvedValue({
      status: true,
      message: "backend.parts.PARTS_FETCH_SUCCESS",
      data: canonicalPart,
    });
    SetupLabelHandlers();
  });

  it("rejects reprint in the backend when the session has no IT permission", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);
    const handler = mocks.handlers.get("reprint-label")!;

    const result = await handler(undefined, {
      part,
      quantity: 1,
      serialNumber: "0200",
      date: "2026-08-13",
    });

    expect(result).toMatchObject({
      status: false,
      message: "backend.audit.unauthorized",
    });
    expect(mocks.generateReprintZPL).not.toHaveBeenCalled();
  });

  it("checks printer readiness before reserving a normal-print serial", async () => {
    mocks.queryPrinterStatus.mockResolvedValueOnce({
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: true,
      message: "backend.printer.head_open",
    });
    const handler = mocks.handlers.get("print-label")!;

    const result = await handler(undefined, { part, quantity: 1 });

    expect(result).toMatchObject({ status: false, printerReady: false });
    expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
  });

  it("does not reserve a serial when print history is not writable", async () => {
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      path: "C:/logs",
      message: "backend.audit.storage_unavailable",
      lastFailureAt: new Date().toISOString(),
      rawError: "access denied",
    });
    const handler = mocks.handlers.get("print-label")!;

    const result = await handler(undefined, { part, quantity: 1 });

    expect(result).toMatchObject({
      status: false,
      auditPersisted: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.queryPrinterStatus).not.toHaveBeenCalled();
    expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
  });

  it("logs data sent instead of claiming that the label was printed", async () => {
    const handler = mocks.handlers.get("print-label")!;

    await handler(undefined, { part, quantity: 1 });

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LABEL_DATA_SENT",
        status: "success",
      }),
    );
  });

  it("logs a failed send with a distinct delivery action", async () => {
    mocks.ipConnection.mockResolvedValueOnce({
      status: false,
      message: "backend.printer.send_error",
      rawError: "socket closed",
    });
    const handler = mocks.handlers.get("print-label")!;

    await handler(undefined, { part, quantity: 1 });

    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LABEL_SEND_FAILED",
        status: "failure",
      }),
    );
  });

  it("reports an audit write failure even when printer data was sent", async () => {
    mocks.appendAuditLog
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const handler = mocks.handlers.get("print-label")!;

    const result = await handler(undefined, { part, quantity: 1 });

    expect(result).toMatchObject({
      status: true,
      deliveryStatus: "sent",
      auditPersisted: false,
      auditStatusMessage: "backend.audit.storage_unavailable",
    });
  });

  it("persists the exact label preparation before sending printer data", async () => {
    const handler = mocks.handlers.get("print-label")!;

    await handler(undefined, { part, quantity: 1 });

    const preparationCallIndex = mocks.appendAuditLog.mock.calls.findIndex(
      ([entry]) =>
        (entry as { action?: string }).action === "LABEL_DATA_PREPARED",
    );
    expect(preparationCallIndex).toBeGreaterThanOrEqual(0);
    expect(
      mocks.appendAuditLog.mock.invocationCallOrder[preparationCallIndex],
    ).toBeLessThan(mocks.ipConnection.mock.invocationCallOrder[0]);
    expect(mocks.appendAuditLog.mock.calls[preparationCallIndex][0]).toEqual(
      expect.objectContaining({
        category: "print",
        status: "success",
        details: expect.objectContaining({
          deliveryState: "prepared",
          serialNumber: generatedLabel.serialNumber,
          fullSerialNumber: `${canonicalPart.Serial_Prefix}${generatedLabel.julianDate}${generatedLabel.serialNumber}`,
          zplSha256: generatedLabel.zplSha256,
        }),
      }),
    );
  });

  it("does not send printer data when the preparation audit cannot be persisted", async () => {
    mocks.appendAuditLog
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const handler = mocks.handlers.get("print-label")!;

    const result = await handler(undefined, { part, quantity: 1 });

    expect(result).toMatchObject({
      status: false,
      deliveryStatus: "failed",
      auditPersisted: false,
      message: "backend.audit.storage_unavailable",
      serialStart: generatedLabel.serialNumber,
      serialEnd: generatedLabel.serialNumber,
    });
    expect(mocks.generatePrintZPL).toHaveBeenCalledOnce();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
  });

  it("uses the authoritative part instead of spoofed print fields", async () => {
    const handler = mocks.handlers.get("print-label")!;
    const spoofedPart = {
      ...part,
      Operation: canonicalPart.Operation,
      Part_Description: "SPOOFED DESCRIPTION",
      Serial_Prefix: "SPOOFED PREFIX",
    };

    await handler(undefined, { part: spoofedPart, quantity: 1 });

    expect(mocks.resolveAuthoritativePart).toHaveBeenCalledWith(spoofedPart);
    expect(mocks.generatePrintZPL).toHaveBeenCalledWith(canonicalPart, 1);
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          description: canonicalPart.Part_Description,
          serialPrefix: canonicalPart.Serial_Prefix,
          operation: canonicalPart.Operation,
        }),
      }),
    );
  });

  it("uses the authoritative part for reprints", async () => {
    const handler = mocks.handlers.get("reprint-label")!;

    await handler(undefined, {
      part: { ...part, Serial_Prefix: "SPOOFED PREFIX" },
      quantity: 1,
      serialNumber: "0200",
      date: "2026-08-13",
    });

    expect(mocks.generateReprintZPL).toHaveBeenCalledWith(
      canonicalPart,
      "2026-08-13",
      "0200",
      1,
    );
  });

  it("persists reprint preparation before sending printer data", async () => {
    const handler = mocks.handlers.get("reprint-label")!;

    await handler(undefined, {
      part,
      quantity: 1,
      serialNumber: "0200",
      date: "2026-08-13",
    });

    const preparationCallIndex = mocks.appendAuditLog.mock.calls.findIndex(
      ([entry]) =>
        (entry as { action?: string; details?: { printMode?: string } })
          .action === "LABEL_DATA_PREPARED" &&
        (entry as { details?: { printMode?: string } }).details?.printMode ===
          "reprint",
    );
    expect(preparationCallIndex).toBeGreaterThanOrEqual(0);
    expect(
      mocks.appendAuditLog.mock.invocationCallOrder[preparationCallIndex],
    ).toBeLessThan(mocks.ipConnection.mock.invocationCallOrder[0]);
    expect(mocks.appendAuditLog.mock.calls[preparationCallIndex][0]).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          selectedDate: "2026-08-13",
          serialNumber: "0200",
          printMode: "reprint",
        }),
      }),
    );
  });

  it("blocks an invalid or ambiguous part before checking or sending", async () => {
    mocks.resolveAuthoritativePart.mockResolvedValueOnce({
      status: false,
      message: "backend.print.invalid_data",
      rawError: "The part payload is ambiguous.",
    });
    const handler = mocks.handlers.get("print-label")!;

    const result = await handler(undefined, { part, quantity: 1 });

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.invalid_data",
    });
    expect(mocks.queryPrinterStatus).not.toHaveBeenCalled();
    expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
    expect(mocks.ipConnection).not.toHaveBeenCalled();
  });
});
