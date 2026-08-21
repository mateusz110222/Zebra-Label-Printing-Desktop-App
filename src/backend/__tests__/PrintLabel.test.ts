import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

import SetupLabelHandlers from "../printer/PrintLabel";

const mocks = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  >(),

  handle: vi.fn(),

  storeGet: vi.fn(),

  isMainRendererAuthorized: vi.fn(() => true),

  canViewAuditLogs: vi.fn(() => true),
  appendAuditLog: vi.fn(),
  checkAuditLogWritable: vi.fn(),
  getAuditActor: vi.fn(() => "operator"),

  generatePrintZPL: vi.fn(),
  generateReprintZPL: vi.fn(),

  ipConnection: vi.fn(),
  comConnection: vi.fn(),
  usbConnection: vi.fn(),

  queryPrinterStatus: vi.fn(),
  resolveAuthoritativePart: vi.fn(),
}));

const createEvent = (): IpcMainInvokeEvent =>
  ({}) as IpcMainInvokeEvent;

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
  getAuditActor: mocks.getAuditActor,
}));

vi.mock("../printer/PrinterStatus", () => ({
  queryPrinterStatus: mocks.queryPrinterStatus,
}));

vi.mock("../parts/PartsResolver", () => ({
  resolveAuthoritativePart:
  mocks.resolveAuthoritativePart,
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized:
  mocks.isMainRendererAuthorized,
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
    throw new Error(
      `IPC handler "${channel}" was not registered`,
    );
  }

  return handler;
};

describe("PrintLabel IPC authorization and delivery audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.handlers.clear();

    mocks.handle.mockImplementation(
      (
        channel: string,
        handler: (...args: unknown[]) => Promise<unknown>,
      ) => {
        mocks.handlers.set(channel, handler);
      },
    );

    mocks.storeGet.mockReturnValue(ipPrinter);

    mocks.isMainRendererAuthorized.mockReturnValue(
      true,
    );

    mocks.canViewAuditLogs.mockReturnValue(true);

    mocks.getAuditActor.mockReturnValue("operator");

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
      message: "backend.reprint.success",
      data: "^XA^XZ",
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

  describe("authorization", () => {
    it("rejects normal print from an unauthorized renderer", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();

      expect(
        mocks.resolveAuthoritativePart,
      ).not.toHaveBeenCalled();

      expect(
        mocks.queryPrinterStatus,
      ).not.toHaveBeenCalled();

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
    });

    it("rejects reprint when renderer is unauthorized", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
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

      expect(
        mocks.resolveAuthoritativePart,
      ).not.toHaveBeenCalled();

      expect(
        mocks.queryPrinterStatus,
      ).not.toHaveBeenCalled();

      expect(
        mocks.generateReprintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
    });

    it("rejects reprint when the session has no IT permission", async () => {
      mocks.canViewAuditLogs.mockReturnValue(false);

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(result).toEqual({
        status: false,
        message: "backend.audit.unauthorized",
      });

      expect(
        mocks.checkAuditLogWritable,
      ).not.toHaveBeenCalled();

      expect(
        mocks.resolveAuthoritativePart,
      ).not.toHaveBeenCalled();

      expect(
        mocks.queryPrinterStatus,
      ).not.toHaveBeenCalled();

      expect(
        mocks.generateReprintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
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
    ])(
      "rejects invalid print quantity: %s",
      async (_name, quantity) => {
        const result = await getHandler("print-label")(
          createEvent(),
          {
            part,
            quantity,
          },
        );

        expect(result).toEqual({
          status: false,
          message: "backend.print.invalid_quantity",
        });

        expect(
          mocks.checkAuditLogWritable,
        ).not.toHaveBeenCalled();

        expect(
          mocks.resolveAuthoritativePart,
        ).not.toHaveBeenCalled();

        expect(
          mocks.queryPrinterStatus,
        ).not.toHaveBeenCalled();

        expect(
          mocks.generatePrintZPL,
        ).not.toHaveBeenCalled();

        expect(
          mocks.ipConnection,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe("audit storage", () => {
    it("does not reserve a serial when print history is not writable", async () => {
      mocks.checkAuditLogWritable.mockResolvedValueOnce({
        status: false,
        path: "C:/logs",
        message:
          "backend.audit.storage_unavailable",
        lastFailureAt:
          "2026-08-21T10:00:00.000Z",
        rawError: "access denied",
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toEqual({
        status: false,
        message:
          "backend.audit.storage_unavailable",
        rawError: "access denied",
        auditPersisted: false,
        auditStatusMessage:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.resolveAuthoritativePart,
      ).not.toHaveBeenCalled();

      expect(
        mocks.queryPrinterStatus,
      ).not.toHaveBeenCalled();

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });

    it("does not generate ZPL when LABEL_BATCH_REQUESTED cannot be persisted", async () => {
      mocks.appendAuditLog.mockResolvedValueOnce(
        false,
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toEqual({
        status: false,
        message:
          "backend.audit.storage_unavailable",
        auditPersisted: false,
        auditStatusMessage:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.resolveAuthoritativePart,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.queryPrinterStatus,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });

    it("does not send printer data when preparation audit cannot be persisted", async () => {
      mocks.appendAuditLog
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        deliveryStatus: "failed",
        auditPersisted: false,
        message:
          "backend.audit.storage_unavailable",
        serialStart: generatedLabel.serialNumber,
        serialEnd: generatedLabel.serialNumber,
        quantity: 1,
      });

      expect(
        mocks.generatePrintZPL,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.comConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.usbConnection,
      ).not.toHaveBeenCalled();
    });

    it("reports an audit write failure even when printer data was sent", async () => {
      mocks.appendAuditLog
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        auditPersisted: false,
        auditStatusMessage:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.ipConnection,
      ).toHaveBeenCalledOnce();
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

      await getHandler("print-label")(
        createEvent(),
        {
          part: spoofedPart,
          quantity: 1,
        },
      );

      expect(
        mocks.resolveAuthoritativePart,
      ).toHaveBeenCalledWith(spoofedPart);

      expect(
        mocks.generatePrintZPL,
      ).toHaveBeenCalledWith(
        canonicalPart,
        1,
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            description:
            canonicalPart.Part_Description,
            serialPrefix:
            canonicalPart.Serial_Prefix,
            operation:
            canonicalPart.Operation,
          }),
        }),
      );
    });

    it("uses the authoritative part for reprints", async () => {
      const spoofedPart = {
        ...part,
        Serial_Prefix: "SPOOFED PREFIX",
      };

      await getHandler("reprint-label")(
        createEvent(),
        {
          part: spoofedPart,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(
        mocks.resolveAuthoritativePart,
      ).toHaveBeenCalledWith(spoofedPart);

      expect(
        mocks.generateReprintZPL,
      ).toHaveBeenCalledWith(
        canonicalPart,
        "2026-08-13",
        "0200",
        1,
      );
    });

    it("blocks an invalid or ambiguous part before checking or sending", async () => {
      mocks.resolveAuthoritativePart.mockResolvedValueOnce(
        {
          status: false,
          message: "backend.print.invalid_data",
          rawError:
            "The part payload is ambiguous.",
        },
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.invalid_data",
        rawError:
          "The part payload is ambiguous.",
      });

      expect(
        mocks.queryPrinterStatus,
      ).not.toHaveBeenCalled();

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT_REQUEST",
          status: "failure",
        }),
      );
    });
  });

  describe("printer readiness", () => {
    it("checks printer readiness before reserving a normal-print serial", async () => {
      mocks.queryPrinterStatus.mockResolvedValueOnce({
        status: false,
        reachable: true,
        ready: false,
        detailsAvailable: true,
        message: "backend.printer.head_open",
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        message: "backend.printer.head_open",
        printerReachable: true,
        printerReady: false,
        printerStatusMessage:
          "backend.printer.head_open",
      });

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });

    it("converts a printer status exception into printer.error", async () => {
      mocks.queryPrinterStatus.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        message: "backend.printer.error",
        rawError: "connection refused",
        printerReachable: false,
        printerReady: false,
      });

      expect(
        mocks.generatePrintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });

    it("checks printer readiness before generating a reprint", async () => {
      mocks.queryPrinterStatus.mockResolvedValueOnce({
        status: false,
        reachable: true,
        ready: false,
        detailsAvailable: true,
        message:
          "backend.printer.paper_out",
      });

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.printer.paper_out",
        printerReachable: true,
        printerReady: false,
      });

      expect(
        mocks.generateReprintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });
  });

  describe("ZPL generation", () => {
    it("does not send printer data when print ZPL generation fails", async () => {
      mocks.generatePrintZPL.mockResolvedValueOnce({
        status: false,
        message:
          "backend.print.serial_range_exceeded",
        rawError: "Remaining: 0",
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.print.serial_range_exceeded",
        rawError: "Remaining: 0",
      });

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.comConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.usbConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "print",
          action: "PRINT_REQUEST",
          status: "failure",

          details: expect.objectContaining({
            message:
              "backend.print.serial_range_exceeded",
            error: "Remaining: 0",
          }),
        }),
      );
    });

    it("does not send printer data when reprint ZPL generation fails", async () => {
      mocks.generateReprintZPL.mockResolvedValueOnce({
        status: false,
        message:
          "backend.print.reprint_serial_not_reserved",
      });

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.print.reprint_serial_not_reserved",
      });

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPRINT_REQUEST",
          status: "failure",
        }),
      );
    });
  });

  describe("preparation audit", () => {
    it("persists the exact label preparation before sending printer data", async () => {
      await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      const preparationCallIndex =
        mocks.appendAuditLog.mock.calls.findIndex(
          ([entry]) =>
            (
              entry as {
                action?: string;
              }
            ).action ===
            "LABEL_DATA_PREPARED",
        );

      expect(
        preparationCallIndex,
      ).toBeGreaterThanOrEqual(0);

      const preparationInvocationOrder =
        mocks.appendAuditLog.mock
          .invocationCallOrder[
          preparationCallIndex
          ];

      const printerInvocationOrder =
        mocks.ipConnection.mock
          .invocationCallOrder[0];

      expect(
        preparationInvocationOrder,
      ).toBeLessThan(
        printerInvocationOrder,
      );

      expect(
        mocks.appendAuditLog.mock.calls[
          preparationCallIndex
          ][0],
      ).toEqual(
        expect.objectContaining({
          category: "print",
          action: "LABEL_DATA_PREPARED",
          status: "success",
          actor: "operator",

          details: expect.objectContaining({
            batchPosition: 1,
            printMode: "print",
            requestedQuantity: 1,
            partNumber:
            canonicalPart.Part_Number,
            description:
            canonicalPart.Part_Description,
            operation:
            canonicalPart.Operation,
            serialPrefix:
            canonicalPart.Serial_Prefix,
            serialNumber:
            generatedLabel.serialNumber,

            fullSerialNumber:
              `${canonicalPart.Serial_Prefix}` +
              `${generatedLabel.julianDate}` +
              `${generatedLabel.serialNumber}`,

            labelFormat:
            canonicalPart.Label_Format,
            julianDate:
            generatedLabel.julianDate,
            bmsDate: generatedLabel.bmsDate,
            zplSha256:
            generatedLabel.zplSha256,
            printerType: "IP",
            printerTarget:
              "10.0.0.10:9100",
            deliveryState: "prepared",
          }),
        }),
      );
    });

    it("persists reprint preparation before sending printer data", async () => {
      await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      const preparationCallIndex =
        mocks.appendAuditLog.mock.calls.findIndex(
          ([entry]) => {
            const auditEntry = entry as {
              action?: string;
              details?: {
                printMode?: string;
              };
            };

            return (
              auditEntry.action ===
              "LABEL_DATA_PREPARED" &&
              auditEntry.details?.printMode ===
              "reprint"
            );
          },
        );

      expect(
        preparationCallIndex,
      ).toBeGreaterThanOrEqual(0);

      const preparationInvocationOrder =
        mocks.appendAuditLog.mock
          .invocationCallOrder[
          preparationCallIndex
          ];

      const printerInvocationOrder =
        mocks.ipConnection.mock
          .invocationCallOrder[0];

      expect(
        preparationInvocationOrder,
      ).toBeLessThan(
        printerInvocationOrder,
      );

      expect(
        mocks.appendAuditLog.mock.calls[
          preparationCallIndex
          ][0],
      ).toEqual(
        expect.objectContaining({
          action: "LABEL_DATA_PREPARED",

          details: expect.objectContaining({
            selectedDate: "2026-08-13",
            serialNumber: "0200",
            printMode: "reprint",
          }),
        }),
      );
    });
  });

  describe("IP printing", () => {
    it("logs LABEL_DATA_SENT instead of claiming that the label was printed", async () => {
      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.ipConnection,
      ).toHaveBeenCalledWith(
        ipPrinter,
        "^XA^XZ",
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_DATA_SENT",
          status: "success",

          details: expect.objectContaining({
            printerType: "IP",
            printerTarget:
              "10.0.0.10:9100",
            printerMessage:
              "backend.printer.sent",
          }),
        }),
      );

      expect(result).toMatchObject({
        status: true,
        message: "backend.printer.sent",
        deliveryStatus: "sent",
        serialStart: "0200",
        serialEnd: "0200",
        quantity: 1,
        auditPersisted: true,
      });
    });

    it("logs a failed IP send with LABEL_SEND_FAILED", async () => {
      mocks.ipConnection.mockResolvedValueOnce({
        status: false,
        message:
          "backend.printer.send_error",
        rawError: "socket closed",
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_SEND_FAILED",
          status: "failure",

          details: expect.objectContaining({
            printerType: "IP",
            printerTarget:
              "10.0.0.10:9100",
            printerMessage:
              "backend.printer.send_error",
            printerError: "socket closed",
          }),
        }),
      );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.printer.send_error",
        rawError: "socket closed",
        deliveryStatus: "failed",
      });
    });

    it("reports IP printer status captured after successful send", async () => {
      mocks.queryPrinterStatus
        .mockResolvedValueOnce({
          status: true,
          reachable: true,
          ready: true,
          detailsAvailable: true,
          message: "backend.printer.ready",
        })
        .mockResolvedValueOnce({
          status: false,
          reachable: true,
          ready: false,
          detailsAvailable: true,
          message:
            "backend.printer.paper_out",
        });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.queryPrinterStatus,
      ).toHaveBeenCalledTimes(2);

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        printerReachable: true,
        printerReady: false,
        printerStatusMessage:
          "backend.printer.paper_out",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_DATA_SENT",

          details: expect.objectContaining({
            printerReachableAfterSend: true,
            printerReadyAfterSend: false,
            printerStatusAfterSend:
              "backend.printer.paper_out",
          }),
        }),
      );
    });

    it("still reports successful delivery if post-send IP status check throws", async () => {
      mocks.queryPrinterStatus
        .mockResolvedValueOnce({
          status: true,
          reachable: true,
          ready: true,
          detailsAvailable: true,
          message: "backend.printer.ready",
        })
        .mockRejectedValueOnce(
          new Error("status read failed"),
        );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
      });

      expect(result).toHaveProperty(
        "printerReachable",
        undefined,
      );

      expect(result).toHaveProperty(
        "printerReady",
        undefined,
      );
    });

    it("does not call IP connection when IP configuration is incomplete", async () => {
      mocks.storeGet.mockReturnValue({
        type: "IP",
        ip: "",
        port: 9100,
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.printer.no_ip_config",
        deliveryStatus: "failed",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_SEND_FAILED",
          status: "failure",

          details: expect.objectContaining({
            printerMessage:
              "backend.printer.no_ip_config",
          }),
        }),
      );
    });
  });

  describe("COM printing", () => {
    it("sends normal print through COM connection", async () => {
      mocks.storeGet.mockReturnValue(
        comPrinter,
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.comConnection,
      ).toHaveBeenCalledWith(
        comPrinter,
        "^XA^XZ",
      );

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.usbConnection,
      ).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        printerReachable: true,
        printerReady: true,
        printerStatusMessage:
          "backend.printer.connected_com",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_DATA_SENT",

          details: expect.objectContaining({
            printerType: "COM",
            printerTarget:
              "COM7@115200",
            printerReachableAfterSend: true,
            printerReadyAfterSend: true,
            printerStatusAfterSend:
              "backend.printer.connected_com",
          }),
        }),
      );
    });

    it("does not call COM connection when COM port is missing", async () => {
      mocks.storeGet.mockReturnValue({
        type: "COM",
        comPort: "",
        baudRate: 115200,
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.comConnection,
      ).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.printer.no_com_config",
        deliveryStatus: "failed",
      });
    });
  });

  describe("USB printing", () => {
    it("sends normal print through selected USB queue", async () => {
      mocks.storeGet.mockReturnValue(
        usbPrinter,
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.usbConnection,
      ).toHaveBeenCalledWith(
        usbPrinter,
        "^XA^XZ",
      );

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();

      expect(
        mocks.comConnection,
      ).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        status: true,
        deliveryStatus: "sent",
        printerReachable: true,
        printerReady: true,
        printerStatusMessage:
          "backend.printer.connected_usb",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_DATA_SENT",

          details: expect.objectContaining({
            printerType: "USB",
            printerTarget:
              "ZDesigner ZD421-203dpi ZPL",
            printerStatusAfterSend:
              "backend.printer.connected_usb",
          }),
        }),
      );
    });

    it("does not call USB connection when printer queue is missing", async () => {
      mocks.storeGet.mockReturnValue({
        type: "USB",
        usbPrinterName: "",
      });

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(
        mocks.usbConnection,
      ).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.printer.no_usb_config",
        deliveryStatus: "failed",
      });
    });
  });

  describe("reprint", () => {
    it("does not log an unauthorized failure for an authorized reprint", async () => {
      await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failure",

          details: expect.objectContaining({
            message:
              "backend.audit.unauthorized",
          }),
        }),
      );
    });

    it("passes selected date and serial to the reprint generator", async () => {
      await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0199",
          date: "2026-08-13",
        },
      );

      expect(
        mocks.generateReprintZPL,
      ).toHaveBeenCalledWith(
        canonicalPart,
        "2026-08-13",
        "0199",
        1,
      );
    });

    it("includes selected date in successful reprint delivery audit", async () => {
      await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LABEL_DATA_SENT",
          status: "success",

          details: expect.objectContaining({
            printMode: "reprint",
            selectedDate: "2026-08-13",
          }),
        }),
      );
    });

    it("does not generate a reprint when start audit cannot be persisted", async () => {
      mocks.appendAuditLog.mockResolvedValueOnce(
        false,
      );

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(result).toEqual({
        status: false,
        message:
          "backend.audit.storage_unavailable",
        auditPersisted: false,
        auditStatusMessage:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.generateReprintZPL,
      ).not.toHaveBeenCalled();

      expect(
        mocks.ipConnection,
      ).not.toHaveBeenCalled();
    });
  });

  describe("unexpected errors", () => {
    it("returns backend.print.error when normal print throws unexpectedly", async () => {
      mocks.resolveAuthoritativePart.mockRejectedValueOnce(
        new Error("unexpected resolver error"),
      );

      const result = await getHandler("print-label")(
        createEvent(),
        {
          part,
          quantity: 1,
        },
      );

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.error",
        rawError:
          "unexpected resolver error",
        auditPersisted: true,
        auditStatusMessage:
          "backend.audit.storage_ready",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PRINT_REQUEST",
          status: "failure",

          details: expect.objectContaining({
            message:
              "backend.print.error",
            error:
              "unexpected resolver error",
          }),
        }),
      );
    });

    it("returns backend.print.error when reprint throws unexpectedly", async () => {
      mocks.resolveAuthoritativePart.mockRejectedValueOnce(
        new Error("unexpected resolver error"),
      );

      const result = await getHandler("reprint-label")(
        createEvent(),
        {
          part,
          quantity: 1,
          serialNumber: "0200",
          date: "2026-08-13",
        },
      );

      expect(result).toMatchObject({
        status: false,
        message: "backend.print.error",
        rawError:
          "unexpected resolver error",
        auditPersisted: true,
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPRINT_REQUEST",
          status: "failure",
        }),
      );
    });
  });
});
