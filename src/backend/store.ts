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

export interface LocalPart {
  Operation: string;
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
}

export interface PartsConfig {
  source: "server" | "local";
  operation: string;
  localParts: LocalPart[];
}

export const store = new Store<{
  printer: PrinterConfig;
  database: DatabaseConfig;
  parts: PartsConfig;
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
    parts: {
      source: "server",
      operation: "",
      localParts: [],
    },
  },
});
