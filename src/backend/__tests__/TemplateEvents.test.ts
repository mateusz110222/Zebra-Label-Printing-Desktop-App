import { beforeEach, describe, expect, it, vi } from "vitest";
import ChildWindowHandlers from "../preview/ChildWindow";
import { notifyTemplatesChanged } from "../parts/TemplateEvents";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  windows: vi.fn(),
  save: vi.fn(),
  authorized: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { getAllWindows: mocks.windows },
}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("../hooks/ZPLService", () => ({
  getZplTemplate: vi.fn(),
  SaveZplTemplate: mocks.save,
}));
vi.mock("../auth/IsAutorized", () => ({
  isPreviewAuthorized: mocks.authorized,
}));
vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.audit,
  canViewAuditLogs: () => true,
}));

describe("template change notifications", () => {
  const send = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorized.mockReturnValue(true);
    mocks.audit.mockResolvedValue(true);
    mocks.save.mockResolvedValue({ status: true });
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

  it("does not notify or save for an unauthorized caller", async () => {
    mocks.authorized.mockReturnValueOnce(false);
    await save();
    expect(send).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
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
