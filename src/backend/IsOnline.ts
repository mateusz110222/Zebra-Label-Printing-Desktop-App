import { Socket } from "net";
import { store } from "./store";
import { SerialPort } from "serialport";
import { ipcMain } from "electron";

interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
}

export default async function IsOnline(): Promise<void> {
  ipcMain.handle("Get-PrinterStatus", async () => {
    try {
      const config = store.get("printer") as PrinterConfig;

      if (!config || !config.type) {
        return { status: false, message: "backend.printer.no_config" };
      }

      if (config.type === "IP") {
        return new Promise((resolve) => {
          const socket = new Socket();

          socket.setTimeout(3000);

          socket.connect(config.port!, config.ip!, () => {
            socket.end();
            resolve({ status: true, message: "backend.printer.connected_ip" });
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
      } else {
        if (!config.comPort) {
          return { status: false, message: "backend.printer.no_com_port" };
        }

        return new Promise((resolve) => {
          const port = new SerialPort({
            path: config.comPort!,
            baudRate: 9600,
            autoOpen: false,
          });
          port.open((err) => {
            if (err) {
              resolve({
                status: false,
                message: "backend.printer.com_open_error",
                rawError: err.message,
              });
            } else {
              port.write("", (err) => {
                if (err) {
                  port.close();
                  resolve({
                    status: false,
                    message: "backend.printer.com_write_error",
                    rawError: err.message,
                  });
                } else {
                  port.drain(() => {
                    port.close();
                    resolve({
                      status: true,
                      message: "backend.printer.test_label_sent_com",
                    });
                  });
                }
              });
            }
          });
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { status: false, message: errMsg };
    }
  });
}
