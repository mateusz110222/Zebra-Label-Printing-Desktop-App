import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import {
  prepareAcknowledgedBatch,
  sendAcknowledgedBatch,
} from "../printer/PrintAcknowledgements";

const { socket } = vi.hoisted(() => ({
  socket: { current: null as EventEmitter | null },
}));

vi.mock("node:net", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Socket: class extends EventEmitter {
      constructor() {
        super();
        socket.current = this;
      }
      connect(_port: number, _ip: string, done: () => void): void {
        done();
      }
      write(_zpl: string, done: () => void): void {
        done();
      }
      destroy(): void {
        this.emit("close");
      }
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const printer = { type: "IP", ip: "192.0.2.1", port: 9100 } as const;
const labels = ["TEST01", "TEST02"].map((serial) => ({
  serial,
  zpl: `^XA^FO10,10^BXN,4,200^FD${serial}^FS^PQ1^XZ`,
}));

it("attaches acknowledgement to the CMC barcode even when the same serial appears as text", () => {
  const serial = "3555EA63080429";
  const barcode = "^B3N,N,210,N,Y";
  const text = "^A0N,67,67";
  const batch = prepareAcknowledgedBatch([
    {
      serial,
      zpl: `^XA${barcode}^FD${serial}^FS${text}^FD${serial}^FS^XZ`,
    },
  ]);
  expect(batch?.labels[0].zpl).toContain(
    `${barcode}^FN9999^FD${serial}^FS${text}^FD${serial}^FS`,
  );
});

it("returns the existing barcode field and waits for both unique acknowledgements", async () => {
  const batch = prepareAcknowledgedBatch(labels)!;
  expect(batch.labels[0].zpl).toContain("^FN9999^FDTEST01^FS");
  const result = sendAcknowledgedBatch(printer, batch);
  const onComplete = vi.fn();
  void result.then(onComplete);
  socket.current!.emit(
    "data",
    Buffer.from(`${batch.marker}[TEST01]\r\n${batch.marker}[TEST01]\r\n`),
  );
  await Promise.resolve();
  expect(onComplete).not.toHaveBeenCalled();
  socket.current!.emit("data", Buffer.from(`${batch.marker}[TEST`));
  socket.current!.emit("data", Buffer.from("02]\r\n"));
  await expect(result).resolves.toEqual({
    sentCount: 2,
    confirmed: ["TEST01", "TEST02"],
    missing: [],
    repeated: ["TEST01"],
    error: null,
  });
});

it("finds the barcode before a long suffix without field separators", () => {
  const [label] = labels;
  const suffix = " ".repeat(250_000);
  const batch = prepareAcknowledgedBatch([{ ...label, zpl: label.zpl + suffix }]);
  expect(batch?.labels[0].zpl).toContain("^FN9999^FDTEST01^FS");
  expect(batch?.labels[0].zpl.endsWith(suffix)).toBe(true);
});

it("reports missing serials on timeout without resending", async () => {
  vi.useFakeTimers();
  const batch = prepareAcknowledgedBatch(labels)!;
  const result = sendAcknowledgedBatch(printer, batch);
  socket.current!.emit("data", Buffer.from(`${batch.marker}[TEST01]\r\n`));
  await vi.advanceTimersByTimeAsync(21000);
  await expect(result).resolves.toMatchObject({
    sentCount: 2,
    confirmed: ["TEST01"],
    missing: ["TEST02"],
  });
});
