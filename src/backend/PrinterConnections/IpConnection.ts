import net from "net";
import {
  PrinterConnectionBase,
  ConnectionResult,
  PrinterConfig,
} from "../utils/PrinterConnectionBase";

class IpConnectionImpl extends PrinterConnectionBase {
  constructor(config: PrinterConfig, label: string) {
    super(config, label);
  }

  validate(): boolean {
    return !!(
      this.config.ip &&
      this.config.port &&
      this.config.port > 0 &&
      this.config.port < 65536
    );
  }

  getConnectionTypeName(): string {
    return "IP Connection";
  }

  async connect(): Promise<ConnectionResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.connect(this.config.port!, this.config.ip!, () => {
        socket.write(this.label, "utf8", (err) => {
          if (err) {
            socket.destroy();
            resolve({
              status: false,
              message: "backend.printer.send_error",
              rawError: err.message,
            });
          } else {
            socket.end();
            resolve({
              status: true,
              message: "backend.printer.print_success",
            });
          }
        });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({
          status: false,
          message: "backend.printer.connection_error",
          rawError: err.message,
        });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({
          status: false,
          message: "backend.printer.timeout",
        });
      });
    });
  }
}

export default function IpConnection(
  config: PrinterConfig,
  label: string,
): Promise<ConnectionResult> {
  const connection = new IpConnectionImpl(config, label);
  return connection.execute();
}
