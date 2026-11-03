import { Socket } from "node:net";
import { SerialPort } from "serialport";
import type { PrinterConfig } from "../utils/store";
import { queryPrinterStatusOnce } from "./PrinterStatus";

const COUNTER_QUERY = '! U1 getvar "odometer.total_label_count"\r\n';
const QUERY_TIMEOUT_MS = 2500;
const MIN_DRAIN_TIMEOUT_MS = 20000;

function readCounter(config: PrinterConfig): Promise<number> {
  return new Promise((resolve, reject) => {
    let response = "";
    let settled = false;
    let close = (done: () => void): void => done();
    const timeout = setTimeout(
      () => finish(new Error("No complete odometer response")),
      QUERY_TIMEOUT_MS,
    );

    function finish(result: number | Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      close(() => {
        if (result instanceof Error) reject(result);
        else resolve(result);
      });
    }

    const receive = (chunk: Buffer): void => {
      response += chunk.toString("ascii");
      const match = /^\s*(?:"(\d+)"|(\d+)[\r\n])/.exec(response);
      if (match) {
        const value = Number(match[1] ?? match[2]);
        finish(
          Number.isSafeInteger(value)
            ? value
            : new Error("Invalid odometer value"),
        );
      } else if (/^\s*""/.test(response) || response.length > 128) {
        finish(new Error("Unsupported or invalid odometer response"));
      }
    };

    try {
      if (config.type === "COM" && config.comPort) {
        const port = new SerialPort({
          path: config.comPort,
          baudRate: config.baudRate || 9600,
          autoOpen: false,
        });
        // Keep the batch lock until the serial handle is closed.
        const closePort = (done: () => void): void => {
          if (port.isOpen) port.close(() => done());
          else done();
        };
        close = closePort;
        port.on("data", receive);
        port.on("error", finish);
        port.open((error) => {
          if (settled) closePort(() => undefined);
          else if (error) finish(error);
          else
            port.write(COUNTER_QUERY, (writeError) => {
              if (writeError) finish(writeError);
            });
        });
      } else if (config.type === "IP" && config.ip && config.port) {
        const socket = new Socket();
        close = (done) => {
          socket.destroy();
          done();
        };
        socket.on("data", receive);
        socket.on("error", finish);
        socket.on("end", () => finish(new Error("Odometer connection closed")));
        socket.connect(config.port, config.ip, () =>
          socket.write(COUNTER_QUERY),
        );
      } else {
        finish(
          new Error("Printer connection does not support odometer queries"),
        );
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function measurePrinterCounter(
  config: PrinterConfig,
  batchSize?: number,
): Promise<{ count: number | null; errors: string[] }> {
  const errors = new Set<string>();
  const deadline = Date.now() + MIN_DRAIN_TIMEOUT_MS + (batchSize ?? 0) * 500;
  try {
    do {
      // The caller already owns the print queue. Bypass the cached UI status.
      const status = await queryPrinterStatusOnce(config);
      if (!status.ready) errors.add(status.message);
      const details = status.data;
      if (
        status.ready &&
        details?.formatsInBuffer === 0 &&
        details.labelsRemaining === 0
      ) {
        return { count: await readCounter(config), errors: [...errors] };
      }
      if (batchSize === undefined) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    errors.add("Printer queue did not report idle");
  } catch (error) {
    errors.add(error instanceof Error ? error.message : String(error));
  }
  return { count: null, errors: [...errors] };
}
