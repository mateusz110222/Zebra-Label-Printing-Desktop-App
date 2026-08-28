import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginPrinterBatch,
  isPrintQueueBusy,
  resetPrinterActivityForTests,
  runPrinterStatusQuery,
  waitForPrintQueueIdle
} from "../printer/PrinterActivity";

const readyStatus = {
  status: true,
  reachable: true,
  ready: true,
  detailsAvailable: true,
  message: "backend.printer.ready",
};

describe("printer activity coordination", () => {
  beforeEach(() => {
    resetPrinterActivityForTests();
  });

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

  it("serializes parallel print batches in FIFO order without interleaving", async () => {
    const executionOrder: string[] = [];

    const finishFirst = await beginPrinterBatch(readyStatus);
    executionOrder.push("first-acquired");

    // Second batch attempts to start while first is active
    const secondBatchPromise = (async () => {
      executionOrder.push("second-requested");
      const finishSecond = await beginPrinterBatch(readyStatus);
      executionOrder.push("second-acquired");
      finishSecond();
      executionOrder.push("second-finished");
    })();

    // Yield macro-task to let second promise register in queue
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(executionOrder).toEqual(["first-acquired", "second-requested"]);
    expect(isPrintQueueBusy()).toBe(true);

    // Finish first batch
    finishFirst();
    executionOrder.push("first-finished");

    await secondBatchPromise;

    expect(executionOrder).toEqual([
      "first-acquired",
      "second-requested",
      "first-finished",
      "second-acquired",
      "second-finished",
    ]);
    expect(isPrintQueueBusy()).toBe(false);
  });

  it("waitForPrintQueueIdle resolves when queue becomes idle", async () => {
    const finishBatch = await beginPrinterBatch(readyStatus);
    expect(isPrintQueueBusy()).toBe(true);

    let idleResolved = false;
    const waitPromise = waitForPrintQueueIdle(5000).then((res) => {
      idleResolved = res;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(idleResolved).toBe(false);

    finishBatch();
    await waitPromise;
    expect(idleResolved).toBe(true);
    expect(isPrintQueueBusy()).toBe(false);
  });
});
