import { afterEach, expect, it, vi } from "vitest";
import { measurePrinterCounter } from "../printer/PrinterDiagnostics";
import { queryPrinterStatusOnce } from "../printer/PrinterStatus";

vi.mock("../printer/PrinterStatus", () => ({
  queryPrinterStatusOnce: vi.fn(),
}));

afterEach(() => vi.useRealTimers());

it("continues beyond 70 seconds while formats drain and stops after 20 seconds without progress", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.mocked(queryPrinterStatusOnce).mockImplementation(async () => ({
    status: true,
    reachable: true,
    ready: true,
    detailsAvailable: true,
    message: "backend.printer.ready",
    data: {
      paperOut: false,
      paused: false,
      headOpen: false,
      ribbonOut: false,
      bufferFull: false,
      underTemperature: false,
      overTemperature: false,
      formatsInBuffer: Math.max(3, 83 - Math.floor(Date.now() / 1000)),
      labelsRemaining: 0,
    },
  }));

  const result = measurePrinterCounter({ type: "COM", comPort: "COM3" }, true);
  const finished = vi.fn();
  void result.then(finished);
  await vi.advanceTimersByTimeAsync(99999);
  expect(finished).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toMatchObject({
    count: null,
    errors: expect.arrayContaining(["No decrease in printer queue for 20 s"]),
  });
});
