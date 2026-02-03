import { SerialPort } from "serialport";
import {
  ConnectionResult,
  PrinterConfig,
  PrinterConnectionBase,
} from "../utils/PrinterConnectionBase";

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
        (p) =>
          p.path.toUpperCase() === comPortName ||
          p.path.toUpperCase().includes(comPortName),
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
        const port = new SerialPort({
          path: portInfo.path,
          baudRate: this.config.baudRate,
          autoOpen: false,
        });

        port.on("error", () => {
          if (port.isOpen) {
            port.close(() => {});
          }
        });

        port.open((err) => {
          if (err) {
            const isBusy = err.message.includes("Access denied");
            const msg = isBusy
              ? "backend.printer.com_busy"
              : "backend.printer.com_open_error";

            resolve({ status: false, message: msg });
            return;
          }

          port.write(this.label, (err) => {
            if (err) {
              port.close(() => {
                resolve({
                  status: false,
                  message: "backend.printer.com_write_error",
                });
              });
            } else {
              port.drain(() => {
                port.close(() => {
                  resolve({
                    status: true,
                    message: "backend.printer.label_sent_successfully",
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
