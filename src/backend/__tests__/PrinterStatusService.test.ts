import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupPrinterStatusHandlers, {
  broadcastPrinterStatus,
  getLatestFleetStatus,
  queryPrinterStatusSingleFlight,
  refreshAndBroadcastPrinterStatus,
  startPrinterStatusPoller,
  stopPrinterStatusPoller,
} from "../printer/PrinterStatusService";
import { beginPrinterBatch } from "../printer/PrinterActivity";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  storeGet: vi.fn(() => ({ type: "IP", ip: "192.168.1.100", port: 9100 })),
  queryPrinterStatus: vi.fn(),
  windows: [] as unknown[],
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: mocks.handle,
  },
  BrowserWindow: {
    getAllWindows: () => mocks.windows,
  },
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
  },
}));

vi.mock("../printer/PrinterStatus", () => ({
  queryPrinterStatus: mocks.queryPrinterStatus,
}));

describe("PrinterStatusService", () => {
  let mockWindow: {
    isDestroyed: ReturnType<typeof vi.fn>;
    webContents: { send: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopPrinterStatusPoller();

    mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    };
    mocks.windows = [mockWindow];

    mocks.queryPrinterStatus.mockResolvedValue({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: false,
      message: "backend.printer.ready",
    });

    SetupPrinterStatusHandlers();
  });

  it("coalesces concurrent queries into a single flight", async () => {
    let resolveQuery: (val: unknown) => void = () => undefined;
    mocks.queryPrinterStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );

    const promise1 = queryPrinterStatusSingleFlight();
    const promise2 = queryPrinterStatusSingleFlight();

    expect(mocks.queryPrinterStatus).toHaveBeenCalledTimes(1);

    resolveQuery({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: false,
      message: "backend.printer.ready",
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual(res2);
    expect(mocks.queryPrinterStatus).toHaveBeenCalledTimes(1);
  });

  it("broadcasts printer status to active browser windows", () => {
    const status = {
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: false,
      message: "backend.printer.ready",
    };

    broadcastPrinterStatus(status);
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "printer-status",
      status,
    );
  });

  it("registers Get-PrinterStatus ipc handler returning single flight status", async () => {
    const registration = mocks.handle.mock.calls.find(
      ([channel]) => channel === "Get-PrinterStatus",
    );
    expect(registration).toBeDefined();
    if (!registration) throw new Error("Registration not found");

    const handler = registration[1];
    const result = await handler();
    expect(result.status).toBe(true);
    expect(result.ready).toBe(true);
  });

  it("starts and stops the background poller properly", async () => {
    startPrinterStatusPoller(100);
    await refreshAndBroadcastPrinterStatus();
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "printer-status",
      expect.objectContaining({ ready: true }),
    );
    stopPrinterStatusPoller();
  });

  it("preserves the last measured fleet reading while a print is active", async () => {
    await refreshAndBroadcastPrinterStatus();
    const reading = getLatestFleetStatus();
    const finish = await beginPrinterBatch();
    try {
      mocks.queryPrinterStatus.mockClear();
      await refreshAndBroadcastPrinterStatus();
      expect(mocks.queryPrinterStatus).not.toHaveBeenCalled();
      expect(getLatestFleetStatus()).toBe(reading);
    } finally {
      finish();
    }
  });
});
