import { describe, expect, it, vi } from "vitest";
import { beginPrinterBatch, runPrinterStatusQuery } from "../printer/PrinterActivity";

const readyStatus = {
  status: true,
  reachable: true,
  ready: true,
  detailsAvailable: true,
  message: "backend.printer.ready",
};

describe("printer activity coordination", () => {
  it("uses the last ready result instead of querying during a print batch", async () => {
    await runPrinterStatusQuery(async () => readyStatus);
    const finishPrinterBatch = await beginPrinterBatch(readyStatus);
    const backgroundQuery = vi.fn(async () => ({
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message: "backend.printer.connection_error",
    }));

    const statusDuringPrint = await runPrinterStatusQuery(backgroundQuery);

    expect(statusDuringPrint).toEqual(readyStatus);
    expect(backgroundQuery).not.toHaveBeenCalled();

    finishPrinterBatch();

    const statusAfterPrint = await runPrinterStatusQuery(backgroundQuery);
    expect(backgroundQuery).toHaveBeenCalledOnce();
    expect(statusAfterPrint.ready).toBe(false);
  });
});
