import { beforeEach, describe, expect, it, vi } from "vitest";
import ChildWindowHandlers from "../preview/ChildWindow";
import { notifyTemplatesChanged } from "../parts/TemplateEvents";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  windows: vi.fn(),
  save: vi.fn(),
  load: vi.fn(),
  authorized: vi.fn(),
  audit: vi.fn(),
  canViewAuditLogs: vi.fn(),
  findPrinter: vi.fn(),
  sendToPrinter: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { getAllWindows: mocks.windows },
}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("../printer/PrinterConfigs", () => ({
  findPrinterForLabelFormat: mocks.findPrinter,
}));
vi.mock("../printer/sendToPrinter", () => ({
  sendToPrinter: mocks.sendToPrinter,
}));
vi.mock("../hooks/ZPLService", () => ({
  getZplTemplate: mocks.load,
  SaveZplTemplate: mocks.save,
}));
vi.mock("../auth/IsAutorized", () => ({
  isPreviewAuthorized: mocks.authorized,
}));
vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.audit,
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable: async () => ({ status: true }),
}));

describe("template change notifications", () => {
  const send = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorized.mockReturnValue(true);
    mocks.canViewAuditLogs.mockReturnValue(true);
    mocks.audit.mockResolvedValue(true);
    mocks.save.mockResolvedValue({ status: true });
    mocks.load.mockResolvedValue({ status: false, templateMissing: true });
    mocks.windows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      },
    ]);
    ChildWindowHandlers();
  });

  const save = async (): Promise<unknown> => {
    const handler = mocks.handle.mock.calls.find(
      ([channel]) => channel === "save-labelformat",
    )![1];
    return handler({}, "new.zpl", "^XA^XZ");
  };

  it("notifies the open template list immediately after a successful save", async () => {
    expect(await save()).toEqual({
      status: true,
      message: "backend.labeledit.saved",
    });
    expect(send).toHaveBeenCalledWith("templates-changed");
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0],
    );
  });

  it("does not notify after a failed save", async () => {
    mocks.save.mockResolvedValueOnce({ status: false, message: "save failed" });
    await save();
    expect(send).not.toHaveBeenCalled();
  });

  it("restores the old template if saving the audit entry fails", async () => {
    mocks.load.mockResolvedValueOnce({ status: true, data: "^XA^FDOLD^FS^XZ" });
    mocks.audit.mockResolvedValueOnce(false);
    await expect(save()).resolves.toMatchObject({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.save).toHaveBeenLastCalledWith("new.zpl", "^XA^FDOLD^FS^XZ");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not notify or save for an unauthorized caller", async () => {
    mocks.authorized.mockReturnValueOnce(false);
    await save();
    expect(send).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("prints one sample from the editor without a login session or saving", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);
    mocks.load.mockResolvedValueOnce({
      status: true,
      data: "^XA^FD*SERIALPREFIX**SERIALNUM1*^FS^PQ50^XZ",
    });
    const printer = { type: "COM", comPort: "COM3" };
    mocks.findPrinter.mockReturnValue({ status: true, printer });
    mocks.sendToPrinter.mockResolvedValue({ status: true });
    const handler = mocks.handle.mock.calls.find(
      ([channel]) => channel === "print-label-format-test",
    )![1];

    await expect(handler({}, "16x13.zpl", "^XA^JUS^XZ")).resolves.toEqual({
      status: true,
    });
    expect(mocks.findPrinter).toHaveBeenCalledWith("16x13.zpl");
    expect(mocks.sendToPrinter).toHaveBeenCalledExactlyOnceWith(
      "^XA^JZN^FDTEST0001^FS^PQ1,0,0,N^XZ",
      printer,
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEST_LABEL_DATA_SENT" }),
    );
  });

  it("rejects guest printing when the requested template is not saved", async () => {
    mocks.canViewAuditLogs.mockReturnValue(false);
    mocks.findPrinter.mockReturnValue({
      status: true,
      printer: { type: "COM", comPort: "COM3" },
    });
    const handler = mocks.handle.mock.calls.find(
      ([channel]) => channel === "print-label-format-test",
    )![1];
    await expect(handler({}, "new.zpl", "^XA^JUS^XZ")).resolves.toMatchObject({
      status: false,
    });
    expect(mocks.sendToPrinter).not.toHaveBeenCalled();
  });

  it("blocks test printing from outside the editor", async () => {
    mocks.authorized.mockReturnValue(false);
    const handler = mocks.handle.mock.calls.find(
      ([channel]) => channel === "print-label-format-test",
    )![1];

    await expect(handler({}, "16x13.zpl", "^XA^XZ")).resolves.toEqual({
      status: false,
      message: "backend.audit.unauthorized",
    });
    expect(mocks.sendToPrinter).not.toHaveBeenCalled();
  });

  it("skips closed windows and keeps notifying after a window closes during delivery", () => {
    mocks.windows.mockReturnValue([
      { isDestroyed: () => true },
      { isDestroyed: () => false, webContents: { isDestroyed: () => true } },
      {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: () => {
            throw new Error("closed");
          },
        },
      },
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      },
    ]);
    expect(() => notifyTemplatesChanged()).not.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });
});
