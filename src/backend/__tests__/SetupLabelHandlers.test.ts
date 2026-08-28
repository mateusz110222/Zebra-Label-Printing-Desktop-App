import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { GeneratedLabel } from "../hooks/ZPLService";

import SetupLabelHandlers from "../printer/SetupLabelHandlers";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),

  handle: vi.fn(),
  storeGet: vi.fn(),

  isMainRendererAuthorized: vi.fn(() => true),
  canViewAuditLogs: vi.fn(() => true),

  appendAuditLog: vi.fn(),
  checkAuditLogWritable: vi.fn(),

  generatePrintZPL: vi.fn(),
  generateReprintZPL: vi.fn(),

  ipConnection: vi.fn(),
  comConnection: vi.fn(),
  usbConnection: vi.fn(),

  queryPrinterStatus: vi.fn(),
  beginPrinterBatch: vi.fn(),
  finishPrinterBatch: vi.fn(),
  resolveAuthoritativePart: vi.fn(),
}));

const createEvent = (): IpcMainInvokeEvent => ({}) as IpcMainInvokeEvent;

vi.mock("electron", () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
  },
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

vi.mock("../hooks/ZPLService", () => ({
  generatePrintZPL: mocks.generatePrintZPL,
  generateReprintZPL: mocks.generateReprintZPL,
}));

vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable: mocks.checkAuditLogWritable,
}));

vi.mock("../printer/PrinterStatus", () => ({
  queryPrinterStatus: mocks.queryPrinterStatus,
}));

vi.mock("../printer/PrinterActivity", () => ({
  beginPrinterBatch: mocks.beginPrinterBatch,
}));

vi.mock("../parts/PartsResolver", () => ({
  resolveAuthoritativePart: mocks.resolveAuthoritativePart,
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized: mocks.isMainRendererAuthorized,
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

const makeGeneratedLabel = (
  serialNumber: string,
  zpl = `^XA^FD${serialNumber}^FS^XZ`,
): GeneratedLabel => ({
  zpl,
  metadata: {
    serialNumber,
    julianDate: "26225",
    bmsDate: "13H6",
    zplSha256: `hash-${serialNumber}`,
  },
});

const generatedLabel = makeGeneratedLabel("0200", "^XA^XZ");

const ipPrinter = {
  type: "IP",
  ip: "10.0.0.10",
  port: 9100,
};

const comPrinter = {
  type: "COM",
  comPort: "COM7",
  baudRate: 115200,
};

const usbPrinter = {
  type: "USB",
  usbPrinterName: "ZDesigner ZD421-203dpi ZPL",
};

const getHandler = (
  channel: "print-label" | "reprint-label",
): ((...args: unknown[]) => Promise<unknown>) => {
  const handler = mocks.handlers.get(channel);

  if (!handler) {
    throw new Error(`IPC handler "${channel}" was not registered`);
  }

  return handler;
};

const successfulPrinterStatus = {
  status: true,
  reachable: true,
  ready: true,
  detailsAvailable: true,
  message: "backend.printer.ready",
};

describe("PrintLabel IPC authorization and delivery audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();

    mocks.handle.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.handlers.set(channel, handler);
      },
    );

    mocks.storeGet.mockReturnValue(ipPrinter);
    mocks.isMainRendererAuthorized.mockReturnValue(true);
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
      labels: [generatedLabel],
    });

    mocks.generateReprintZPL.mockResolvedValue({
      status: true,
      message: "backend.reprint.success",
      labels: [generatedLabel],
    });

    mocks.ipConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.sent",
    });

    mocks.comConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.sent",
    });

    mocks.usbConnection.mockResolvedValue({
      status: true,
      message: "backend.printer.sent",
    });

    mocks.queryPrinterStatus.mockResolvedValue(successfulPrinterStatus);
    mocks.beginPrinterBatch.mockImplementation(
      async () => mocks.finishPrinterBatch,
    );

    mocks.resolveAuthoritativePart.mockResolvedValue({
      status: true,
      message: "backend.parts.PARTS_FETCH_SUCCESS",
      data: canonicalPart,
    });

    SetupLabelHandlers();
  });

  describe("authorization", () => {
    it("rejects normal print from an unauthorized renderer", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(false);

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });
      expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
      expect(mocks.resolveAuthoritativePart).not.toHaveBeenCalled();
      expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(mocks.appendAuditLog).not.toHaveBeenCalled();
    });

    it("rejects reprint when renderer is unauthorized", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(false);

      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0200",
        date: "2026-08-13",
      });

      expect(result).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });
      expect(mocks.canViewAuditLogs).not.toHaveBeenCalled();
      expect(mocks.generateReprintZPL).not.toHaveBeenCalled();
      expect(mocks.appendAuditLog).not.toHaveBeenCalled();
    });

    it("rejects reprint when the session has no IT permission", async () => {
      mocks.canViewAuditLogs.mockReturnValue(false);

      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0200",
        date: "2026-08-13",
      });

      expect(result).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });
      expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
      expect(mocks.generateReprintZPL).not.toHaveBeenCalled();
    });
  });

  describe("quantity validation", () => {
    it.each([
      ["zero", 0],
      ["negative", -1],
      ["above limit", 101],
      ["decimal", 1.5],
      ["string", "1"],
      ["missing", undefined],
      ["null", null],
    ])("rejects invalid print quantity: %s", async (_name, quantity) => {
      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity,
      });

      expect(result).toEqual({
        status: false,
        message: "backend.print.invalid_quantity",
      });
      expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
      expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
    });

    it("rejects invalid reprint quantity before doing work", async () => {
      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 0,
        serialNumber: "0200",
        date: "2026-08-13",
      });

      expect(result).toEqual({
        status: false,
        message: "backend.print.invalid_quantity",
      });
      expect(mocks.checkAuditLogWritable).not.toHaveBeenCalled();
      expect(mocks.generateReprintZPL).not.toHaveBeenCalled();
    });
  });

  describe("audit storage", () => {
    it("does not reserve a serial when print history is not writable", async () => {
      mocks.checkAuditLogWritable.mockResolvedValueOnce({
        status: false,
        path: "C:/logs",
        message: "backend.audit.storage_unavailable",
        lastFailureAt: "2026-08-21T10:00:00.000Z",
        rawError: "access denied",
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toEqual({
        status: false,
        message: "backend.audit.storage_unavailable",
        rawError: "access denied",
        auditPersisted: false,
        auditStatusMessage: "backend.audit.storage_unavailable",
      });
      expect(mocks.resolveAuthoritativePart).not.toHaveBeenCalled();
      expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
      expect(mocks.ipConnection).not.toHaveBeenCalled();
    });

    it("does not create LABEL_BATCH_REQUESTED or LABEL_DATA_PREPARED", async () => {
      await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      const actions = mocks.appendAuditLog.mock.calls.map(
        ([input]) => (input as { action: string }).action,
      );

      expect(actions).not.toContain("LABEL_BATCH_REQUESTED");
      expect(actions).not.toContain("LABEL_DATA_PREPARED");
      expect(actions).toEqual(["PRINT"]);
    });

    it("reports final audit write failure without undoing a successful send", async () => {
      mocks.appendAuditLog.mockResolvedValueOnce(false);

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        auditPersisted: false,
        auditStatusMessage: "backend.audit.storage_unavailable",
      });
      expect(mocks.ipConnection).toHaveBeenCalledOnce();
      expect(mocks.appendAuditLog).toHaveBeenCalledOnce();
    });
  });

  describe("part resolution", () => {
    it("uses the authoritative part instead of spoofed print fields", async () => {
      const spoofedPart = {
        ...part,
        Operation: canonicalPart.Operation,
        Part_Description: "SPOOFED DESCRIPTION",
        Serial_Prefix: "SPOOFED PREFIX",
      };

      await getHandler("print-label")(createEvent(), {
        part: spoofedPart,
        quantity: 1,
      });

      expect(mocks.resolveAuthoritativePart).toHaveBeenCalledWith(spoofedPart);
      expect(mocks.generatePrintZPL).toHaveBeenCalledWith(canonicalPart, 1);
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT",
          details: expect.objectContaining({
            description: canonicalPart.Part_Description,
            serialPrefix: canonicalPart.Serial_Prefix,
            operation: canonicalPart.Operation,
          }),
        }),
      );
    });

    it("blocks an invalid part before checking or sending to the printer", async () => {
      mocks.resolveAuthoritativePart.mockResolvedValueOnce({
        status: false,
        message: "backend.print.invalid_data",
        rawError: "The part payload is ambiguous.",
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.invalid_data",
        rawError: "The part payload is ambiguous.",
      });
      expect(mocks.queryPrinterStatus).not.toHaveBeenCalled();
      expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT",
          status: "failure",
        }),
      );
    });
  });

  describe("printer readiness", () => {
    it("holds background status checks for the entire label batch", async () => {
      const labels = Array.from({ length: 3 }, (_, index) =>
        makeGeneratedLabel(String(200 + index).padStart(4, "0")),
      );
      mocks.generatePrintZPL.mockResolvedValueOnce({
        status: true,
        message: "backend.print.print_success",
        labels,
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 3,
      });

      expect(result).toMatchObject({ status: true, sentCount: 3 });
      expect(mocks.beginPrinterBatch).toHaveBeenCalledWith(
        successfulPrinterStatus,
      );
      expect(mocks.finishPrinterBatch).toHaveBeenCalledOnce();
      expect(mocks.queryPrinterStatus).toHaveBeenCalledOnce();

      const [lockStartedAt] = mocks.beginPrinterBatch.mock.invocationCallOrder;
      const [serialReservedAt] =
        mocks.generatePrintZPL.mock.invocationCallOrder;
      const [auditPersistedAt] = mocks.appendAuditLog.mock.invocationCallOrder;
      const [lockReleasedAt] =
        mocks.finishPrinterBatch.mock.invocationCallOrder;

      expect(lockStartedAt).toBeLessThan(serialReservedAt);
      expect(serialReservedAt).toBeLessThan(auditPersistedAt);
      expect(auditPersistedAt).toBeLessThan(lockReleasedAt);
    });

    it("checks printer readiness before reserving a normal-print serial", async () => {
      mocks.queryPrinterStatus.mockResolvedValueOnce({
        status: false,
        reachable: true,
        ready: false,
        detailsAvailable: true,
        message: "backend.printer.head_open",
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.printer.head_open",
        printerReachable: true,
        printerReady: false,
      });
      expect(mocks.generatePrintZPL).not.toHaveBeenCalled();
      expect(mocks.ipConnection).not.toHaveBeenCalled();
    });

    it("checks printer readiness before generating a reprint", async () => {
      mocks.queryPrinterStatus.mockResolvedValueOnce({
        status: false,
        reachable: true,
        ready: false,
        detailsAvailable: true,
        message: "backend.printer.paper_out",
      });

      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0199",
        date: "2026-08-13",
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.printer.paper_out",
        printerReachable: true,
        printerReady: false,
      });
      expect(mocks.generateReprintZPL).not.toHaveBeenCalled();
    });
  });

  describe("ZPL generation", () => {
    it("does not send printer data when print ZPL generation fails", async () => {
      mocks.generatePrintZPL.mockResolvedValueOnce({
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: "Remaining: 0",
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: "Remaining: 0",
      });
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT",
          status: "failure",
        }),
      );
    });

    it("does not send printer data when reprint ZPL generation fails", async () => {
      mocks.generateReprintZPL.mockResolvedValueOnce({
        status: false,
        message: "backend.print.reprint_serial_not_reserved",
      });

      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0200",
        date: "2026-08-13",
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.reprint_serial_not_reserved",
      });
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPRINT",
          status: "failure",
        }),
      );
    });
  });

  describe("single-label delivery", () => {
    it("sends a normal label and stores one PRINT audit record", async () => {
      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(mocks.ipConnection).toHaveBeenCalledWith(ipPrinter, "^XA^XZ");
      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        sentCount: 1,
        failedCount: 0,
        quantity: 1,
      });

      expect(mocks.appendAuditLog).toHaveBeenCalledOnce();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "print",
          action: "PRINT",
          status: "success",
          details: expect.objectContaining({
            printMode: "print",
            serialNumber: "0200",
            deliveryState: "sent",
            printerType: "IP",
            printerTarget: "10.0.0.10:9100",
          }),
        }),
      );
    });

    it("stores one REPRINT audit record with selectedDate", async () => {
      await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0199",
        date: "2026-08-13",
      });

      expect(mocks.generateReprintZPL).toHaveBeenCalledWith(
        canonicalPart,
        "2026-08-13",
        "0199",
        1,
      );

      expect(mocks.appendAuditLog).toHaveBeenCalledOnce();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPRINT",
          status: "success",
          details: expect.objectContaining({
            printMode: "reprint",
            selectedDate: "2026-08-13",
          }),
        }),
      );
    });
  });

  describe("batch delivery", () => {
    const batchLabels = [
      makeGeneratedLabel("0200"),
      makeGeneratedLabel("0201"),
      makeGeneratedLabel("0202"),
      makeGeneratedLabel("0203"),
      makeGeneratedLabel("0204"),
    ];

    beforeEach(() => {
      mocks.generatePrintZPL.mockResolvedValue({
        status: true,
        message: "backend.print.print_success",
        labels: batchLabels,
      });
    });

    it("sends every label separately and creates one BATCH_PRINT", async () => {
      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 5,
      });

      expect(mocks.ipConnection).toHaveBeenCalledTimes(5);

      for (let i = 0; i < batchLabels.length; i++) {
        expect(mocks.ipConnection).toHaveBeenNthCalledWith(
          i + 1,
          ipPrinter,
          batchLabels[i].zpl,
        );
      }

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        sentCount: 5,
        failedCount: 0,
        quantity: 5,
      });

      expect(mocks.appendAuditLog).toHaveBeenCalledOnce();
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "print",
          action: "BATCH_PRINT",
          status: "success",
          details: expect.objectContaining({
            requestedQuantity: 5,
            sentCount: 5,
            failedCount: 0,
            deliveryResult: "success",
            labels: expect.arrayContaining([
              expect.objectContaining({
                batchPosition: 1,
                serialNumber: "0200",
                deliveryState: "sent",
              }),
              expect.objectContaining({
                batchPosition: 5,
                serialNumber: "0204",
                deliveryState: "sent",
              }),
            ]),
          }),
        }),
      );
    });

    it("continues after one failed label and records partial failure", async () => {
      mocks.ipConnection
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockResolvedValueOnce({
          status: false,
          message: "backend.printer.error",
          rawError: "temporary send failure",
        })
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 5,
      });

      expect(mocks.ipConnection).toHaveBeenCalledTimes(5);
      expect(result).toMatchObject({
        status: false,
        message: "backend.print.partial_failure",
        deliveryStatus: "partial",
        sentCount: 4,
        failedCount: 1,
      });

      expect(mocks.appendAuditLog).toHaveBeenCalledOnce();

      const auditInput = mocks.appendAuditLog.mock.calls[0][0] as {
        action: string;
        status: string;
        details: {
          deliveryResult: string;
          labels: Array<{
            batchPosition: number;
            deliveryState: string;
            printerError: string | null;
          }>;
        };
      };

      expect(auditInput.action).toBe("BATCH_PRINT");
      expect(auditInput.status).toBe("failure");
      expect(auditInput.details.deliveryResult).toBe("partial");
      expect(
        auditInput.details.labels.map((label) => label.deliveryState),
      ).toEqual(["sent", "sent", "failed", "sent", "sent"]);
      expect(auditInput.details.labels[2].printerError).toBe(
        "temporary send failure",
      );
    });

    it("continues after sendToPrinter throws for one label", async () => {
      mocks.ipConnection
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockRejectedValueOnce(new Error("socket reset"))
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        })
        .mockResolvedValueOnce({
          status: true,
          message: "backend.printer.sent",
        });

      await getHandler("print-label")(createEvent(), {
        part,
        quantity: 5,
      });

      expect(mocks.ipConnection).toHaveBeenCalledTimes(5);

      const auditInput = mocks.appendAuditLog.mock.calls[0][0] as {
        details: {
          labels: Array<{
            deliveryState: string;
            printerError: string | null;
          }>;
        };
      };

      expect(auditInput.details.labels[1]).toMatchObject({
        deliveryState: "failed",
        printerError: "socket reset",
      });
      expect(auditInput.details.labels[2].deliveryState).toBe("sent");
    });

    it("returns complete failure when every label send fails", async () => {
      mocks.ipConnection.mockResolvedValue({
        status: false,
        message: "backend.printer.error",
        rawError: "offline",
      });

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 5,
      });

      expect(mocks.ipConnection).toHaveBeenCalledTimes(5);
      expect(result).toMatchObject({
        status: false,
        deliveryStatus: "failed",
        sentCount: 0,
        failedCount: 5,
      });

      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_PRINT",
          status: "failure",
          details: expect.objectContaining({
            deliveryResult: "failure",
            sentCount: 0,
            failedCount: 5,
          }),
        }),
      );
    });
  });

  describe("COM and USB printing", () => {
    it("sends a normal print through COM connection", async () => {
      mocks.storeGet.mockReturnValue(comPrinter);

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(mocks.comConnection).toHaveBeenCalledWith(comPrinter, "^XA^XZ");
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        printerReachable: true,
        printerReady: true,
        printerStatusMessage: "backend.printer.connected_com",
      });
    });

    it("sends a normal print through selected USB queue", async () => {
      mocks.storeGet.mockReturnValue(usbPrinter);

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(mocks.usbConnection).toHaveBeenCalledWith(usbPrinter, "^XA^XZ");
      expect(mocks.ipConnection).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        printerReachable: true,
        printerReady: true,
        printerStatusMessage: "backend.printer.ready",
      });
    });
  });

  describe("unexpected errors", () => {
    it("returns backend.print.error and audits unexpected normal print failure", async () => {
      mocks.resolveAuthoritativePart.mockRejectedValueOnce(
        new Error("unexpected resolver error"),
      );

      const result = await getHandler("print-label")(createEvent(), {
        part,
        quantity: 1,
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.error",
        rawError: "unexpected resolver error",
        auditPersisted: true,
      });
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT",
          status: "failure",
          details: expect.objectContaining({
            message: "backend.print.error",
            error: "unexpected resolver error",
          }),
        }),
      );
    });

    it("returns backend.print.error and audits unexpected reprint failure", async () => {
      mocks.resolveAuthoritativePart.mockRejectedValueOnce(
        new Error("unexpected resolver error"),
      );

      const result = await getHandler("reprint-label")(createEvent(), {
        part,
        quantity: 1,
        serialNumber: "0200",
        date: "2026-08-13",
      });

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.error",
        rawError: "unexpected resolver error",
        auditPersisted: true,
      });
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPRINT",
          status: "failure",
        }),
      );
    });
  });
});
