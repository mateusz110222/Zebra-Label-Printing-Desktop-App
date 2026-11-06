import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  beginPrinterBatch,
  resetPrinterActivityForTests,
} from "../backend/printer/PrinterActivity";
import { registerGracefulShutdown } from "./gracefulShutdown";

const app = vi.hoisted(() => ({ on: vi.fn(), quit: vi.fn() }));
vi.mock("electron", () => ({ app }));

function setup(): {
  restart: (install: () => void) => void;
  stop: ReturnType<typeof vi.fn>;
  veto: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn(async () => undefined);
  const veto = vi.fn(() => false);
  const restart = registerGracefulShutdown(stop);
  const listener = (event: string): ((...args: unknown[]) => void) =>
    app.on.mock.calls.find(([name]) => name === event)![1];
  const onContents = vi.fn();
  listener("web-contents-created")({}, { on: onContents });
  app.quit.mockImplementation(() => {
    const preventDefault = vi.fn();
    listener("before-quit")({ preventDefault });
    if (preventDefault.mock.calls.length) return;
    if (veto()) onContents.mock.calls[0][1]();
    else listener("will-quit")({ preventDefault });
  });
  return { restart, stop, veto };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetPrinterActivityForTests();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("restores printing and keeps services running when a window vetoes restart", async () => {
  const { restart, stop, veto } = setup();
  const install = vi.fn();
  veto.mockReturnValueOnce(true);
  restart(install);
  expect(stop).not.toHaveBeenCalled();
  expect(install).not.toHaveBeenCalled();
  const finish = await beginPrinterBatch();
  finish();
  restart(install);
  await vi.advanceTimersByTimeAsync(0);
  expect(stop).toHaveBeenCalledOnce();
  expect(install).toHaveBeenCalledOnce();
});

it("defers an update past the three minute wait and installs only after the queue drains", async () => {
  const { restart, stop } = setup();
  const install = vi.fn();
  const finish = await beginPrinterBatch();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    restart(install);
    await vi.advanceTimersByTimeAsync(180001);
    expect(stop).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    await expect(beginPrinterBatch()).rejects.toThrow("backend.print.error");
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(stop).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledOnce();
  } finally {
    finish();
    warn.mockRestore();
  }
});
