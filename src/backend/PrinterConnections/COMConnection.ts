import { SerialPort } from "serialport";
import { ConnectionResult, PrinterConnectionBase } from "../printer/PrinterConnectionBase";
import { PrinterConfig } from "../utils/store";

class COMConnectionImpl extends PrinterConnectionBase {
  constructor(config: PrinterConfig, label: string) {
    super(config, label);
  }

  validate(): boolean {
    return !!(this.config.comPort && this.config.comPort.trim().length > 0);
  }

  getConnectionTypeName(): string {
    return "COM Connection";
  }

  async connect(): Promise<ConnectionResult> {
    const comPortName = (this.config.comPort || "").trim().toUpperCase();

    if (!comPortName) {
      return {
        status: false,
        message: "backend.printer.no_com_config",
      };
    }

    try {
      const ports = await SerialPort.list();
      const portInfo = ports.find(
        (p) => p.path.trim().toUpperCase() === comPortName,
      );

      if (!portInfo) {
        const availablePorts = ports.map((p) => p.path).join(", ") || "brak";
        return {
          status: false,
          message: "backend.printer.com_not_found",
          rawError: `Dostępne: [${availablePorts}]`,
        };
      }

      return new Promise((resolve) => {
        let settled = false;
        const port = new SerialPort({
          path: portInfo.path,
          baudRate: this.config.baudRate || 9600,
          autoOpen: false,
        });
        const timeout = setTimeout(() => {
          if (port.isOpen) port.close(() => undefined);
          finish({ status: false, message: "backend.printer.timeout" });
        }, 10_000);

        const finish = (result: ConnectionResult): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(result);
        };

        port.on("error", (error) => {
          if (port.isOpen) {
            port.close(() => undefined);
          }
          finish({
            status: false,
            message: "backend.printer.serial_critical_error",
            rawError: error.message,
          });
        });

        port.open((err) => {
          if (err) {
            const isBusy = err.message.includes("Access denied");
            const msg = isBusy
              ? "backend.printer.com_busy"
              : "backend.printer.com_open_error";

            finish({ status: false, message: msg, rawError: err.message });
            return;
          }

          port.write(this.label, (err) => {
            if (err) {
              port.close(() => {
                finish({
                  status: false,
                  message: "backend.printer.com_write_error",
                  rawError: err.message,
                });
              });
            } else {
              port.drain((drainError) => {
                if (drainError) {
                  port.close(() =>
                    finish({
                      status: false,
                      message: "backend.printer.com_write_error",
                      rawError: drainError.message,
                    }),
                  );
                  return;
                }
                port.close((closeError) => {
                  finish({
                    status: !closeError,
                    message: closeError
                      ? "backend.printer.com_close_error"
                      : "backend.printer.label_sent_successfully",
                    rawError: closeError?.message,
                  });
                });
              });
            }
          });
        });
      });
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : String(error) || "backend.config.save_fail";
      return {
        status: false,
        message: "backend.printer.serial_critical_error",
        rawError: errMsg,
      };
    }
  }
}

export default function COMConnection(
  config: PrinterConfig,
  label: string,
): Promise<ConnectionResult> {
  const connection = new COMConnectionImpl(config, label);
  return connection.execute();
}
