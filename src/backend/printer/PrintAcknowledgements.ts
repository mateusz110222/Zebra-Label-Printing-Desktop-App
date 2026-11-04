import { randomBytes } from "node:crypto";
import { Socket } from "node:net";
import { SerialPort } from "serialport";
import type { PrinterConfig } from "../utils/store";

interface Label {
  serial: string;
  zpl: string;
}

export function prepareAcknowledgedBatch(
  labels: Label[],
): { marker: string; labels: Label[] } | null {
  const marker = `ACK-${randomBytes(8).toString("hex")}`;
  const prepared: Label[] = [];
  for (const { serial, zpl } of labels) {
    const field = `^FD${serial}^FS`;
    const index = zpl.indexOf(field);
    if (
      !/^[A-Z0-9]{1,256}$/.test(serial) ||
      index < 0 ||
      index !== zpl.lastIndexOf(field) ||
      /\^FN\s*0*9999(?!\d)/i.test(zpl) ||
      (zpl.match(/\^XA/gi)?.length ?? 0) !== 1 ||
      (zpl.match(/\^XZ/gi)?.length ?? 0) !== 1
    )
      return null;

    prepared.push({
      serial,
      zpl: zpl
        .replace(field, `^FN9999${field}`)
        .replace(
          /\^XZ/i,
          `^FH_^HV9999,${serial.length},${marker}[,]_0D_0A,L^FS^XZ`,
        ),
    });
  }
  if (new Set(prepared.map(({ serial }) => serial)).size !== prepared.length)
    return null;
  return { marker, labels: prepared };
}

export function sendAcknowledgedBatch(
  config: PrinterConfig,
  batch: NonNullable<ReturnType<typeof prepareAcknowledgedBatch>>,
): Promise<{
  sentCount: number;
  confirmed: string[];
  missing: string[];
  repeated: string[];
  error: string | null;
}> {
  const { marker, labels } = batch;
  return new Promise((resolve) => {
    const expected = new Set(labels.map(({ serial }) => serial));
    const confirmed = new Set<string>();
    const repeated = new Set<string>();
    let sentCount = 0;
    let buffer = "";
    let finished = false;
    let close = (done: () => void): void => done();
    const timeout = setTimeout(
      () => finish(new Error("Timed out waiting for printer acknowledgements")),
      20000 + labels.length * 500,
    );

    function finish(error?: Error | null): void {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      close(() =>
        resolve({
          sentCount,
          confirmed: [...confirmed],
          missing: [...expected].filter((serial) => !confirmed.has(serial)),
          repeated: [...repeated],
          error: error?.message ?? null,
        }),
      );
    }

    function completeIfReady(): void {
      if (sentCount === labels.length && confirmed.size === expected.size)
        finish();
    }

    function receive(chunk: Buffer): void {
      if (finished) return;
      buffer += chunk.toString("ascii");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line.startsWith(`${marker}[`) || !line.endsWith("]")) continue;
        const serial = line.slice(marker.length + 1, -1);
        if (!expected.has(serial)) continue;
        if (confirmed.has(serial)) repeated.add(serial);
        confirmed.add(serial);
      }
      if (buffer.length > 4096) buffer = buffer.slice(-512);
      completeIfReady();
    }

    type Write = (data: string, done: (error?: Error | null) => void) => void;
    function sendNext(write: Write): void {
      if (finished) return;
      if (sentCount === labels.length) {
        completeIfReady();
        return;
      }
      write(labels[sentCount].zpl, (error) => {
        if (finished) return;
        if (error) finish(error);
        else {
          sentCount++;
          sendNext(write);
        }
      });
    }

    try {
      if (config.type === "COM" && config.comPort) {
        const port = new SerialPort({
          path: config.comPort,
          baudRate: config.baudRate || 9600,
          autoOpen: false,
        });
        close = (done) => (port.isOpen ? port.close(() => done()) : done());
        port.on("data", receive);
        port.on("error", finish);
        port.open((error) => {
          if (finished) close(() => undefined);
          else if (error) finish(error);
          else
            sendNext((data, done) =>
              port.write(data, (writeError) => {
                if (writeError) done(writeError);
                else port.drain(done);
              }),
            );
        });
      } else if (config.type === "IP" && config.ip && config.port) {
        const socket = new Socket();
        close = (done) => {
          socket.destroy();
          done();
        };
        socket.on("data", receive);
        socket.on("error", finish);
        socket.on("close", () =>
          finish(
            new Error(
              "Printer connection closed before all acknowledgements arrived",
            ),
          ),
        );
        socket.connect(config.port, config.ip, () =>
          sendNext((data, done) => socket.write(data, done)),
        );
      } else {
        finish(
          new Error(
            "Printer connection does not support direct acknowledgements",
          ),
        );
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
