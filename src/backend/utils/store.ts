import Store from "electron-store";

export interface PrinterConfig {
  name?: string;
  type: "IP" | "COM" | "USB";
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
  usbPrinterName?: string;
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
  server: string;
  configPath: string;
  localParts: LocalPart[];
}

export type PrinterMode = "single" | "multiple";

export interface PrinterRoutingConfig {
  mode: PrinterMode;
  formatAssignments: Record<string, string>;
}

export const store = new Store<{
  printer: PrinterConfig;
  printers: PrinterConfig[];
  printerRouting: PrinterRoutingConfig;
  database: DatabaseConfig;
  parts: PartsConfig;
  autoUpdate: boolean;
}>({
  defaults: {
    printer: {
      type: "IP",
      ip: "",
      port: 9100,
      comPort: "",
      baudRate: 9600,
      usbPrinterName: "",
    },
    printers: [],
    printerRouting: {
      mode: "single",
      formatAssignments: {},
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
      server: process.env.PARTS_CONFIG_URL || "",
      configPath: process.env.PARTS_CONFIG_FILE || "",
      localParts: [],
    },
    autoUpdate: true,
  },
});
