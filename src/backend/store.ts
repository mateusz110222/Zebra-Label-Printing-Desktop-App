import Store from "electron-store";

export interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
}

export interface DatabaseConfig {
  host?: string;
  user?: string;
  password?: string;
  database?: string;
}

export const store = new Store<{
  printer: PrinterConfig;
  database: DatabaseConfig;
}>({
  defaults: {
    printer: {
      type: "IP",
      ip: "",
      port: 9100,
      comPort: "",
      baudRate: 9600,
    },
    database: {
      host: "",
      user: "",
      password: "",
      database: "",
    },
  },
});
