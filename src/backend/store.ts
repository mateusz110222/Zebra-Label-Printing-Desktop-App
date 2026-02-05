import Store from "electron-store";

export interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
}

export const store = new Store<{
  printer: PrinterConfig;
}>({
  defaults: {
    printer: {
      type: "IP",
      ip: "",
      port: 9100,
      comPort: "",
      baudRate: 9600,
    },
  },
});
