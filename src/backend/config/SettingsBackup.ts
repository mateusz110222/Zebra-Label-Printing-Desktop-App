import { dialog, ipcMain } from "electron";
import { open, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import {
  appendAuditLog,
  canViewAuditLogs,
  canConfigurePrinter,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import {
  store,
  type PrinterConfig,
  type DatabaseConfig,
  type PrinterRoutingConfig,
  type PartsConfig,
} from "../utils/store";
import { normalizePartsConfig } from "../parts/PartsResolver";
import {
  closeDatabase,
  decryptDatabasePassword,
  encryptDatabasePassword,
} from "./DatabaseConfig";
import {
  parseConfig,
  readConfig,
  writeMonitoringConfig,
  type MonitoringConfig,
} from "../system/Monitoring";
import {
  isPrintQueueBusy,
  pausePrintsForUpdate,
} from "../printer/PrinterActivity";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid object");
  return value as Record<string, unknown>;
};
const string = (value: unknown, limit = 2048): string => {
  if (typeof value !== "string" || value.length > limit)
    throw new Error("Invalid string");
  return value;
};
const integer = (value: unknown, max: number): number => {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max)
    throw new Error("Invalid number");
  return value as number;
};
function printer(value: unknown): PrinterConfig {
  const item = record(value);
  const common =
    item.name === undefined ? {} : { name: string(item.name, 255) };
  if (item.type === "IP") {
    const ip = string(item.ip, 255);
    if (ip && !isIP(ip)) throw new Error("Invalid IP");
    return {
      ...common,
      type: "IP",
      ip,
      port: integer(item.port ?? 9100, 65535),
    };
  }
  if (item.type === "COM")
    return {
      ...common,
      type: "COM",
      comPort: string(item.comPort, 255),
      baudRate: integer(item.baudRate ?? 9600, 4000000),
    };
  if (item.type === "USB")
    return {
      ...common,
      type: "USB",
      usbPrinterName: string(item.usbPrinterName, 255),
    };
  throw new Error("Invalid printer");
}

export interface SettingsBackupData {
  settings: {
    printer: PrinterConfig;
    printers: PrinterConfig[];
    printerRouting: PrinterRoutingConfig;
    database: DatabaseConfig;
    parts: PartsConfig;
    autoUpdate: boolean;
  };
  monitoring: MonitoringConfig | null;
}

export function parseSettingsBackup(value: unknown): SettingsBackupData {
  const backup = record(value);
  if (backup.application !== "zebra-label-printing" || backup.version !== 1)
    throw new Error("Invalid backup version");
  const settings = record(backup.settings);
  if (
    !Array.isArray(settings.printers) ||
    settings.printers.length > 1000 ||
    typeof settings.autoUpdate !== "boolean"
  )
    throw new Error("Invalid settings");
  const db = record(settings.database);
  const sslMode = db.sslMode ?? "default";
  if (
    !["default", "required", "self_signed", "disabled"].includes(
      String(sslMode),
    )
  )
    throw new Error("Invalid SSL mode");
  const database: DatabaseConfig = {
    host: string(db.host, 255),
    user: string(db.user, 128),
    password: string(db.password, 1024),
    database: string(db.database, 128),
    sslMode: sslMode as DatabaseConfig["sslMode"],
  };
  // Backups contain portable plain credentials, never OS-bound ciphertext.
  if (database.password?.startsWith("enc:v1:"))
    throw new Error("Encrypted password is not portable");
  const partsInput = record(settings.parts);
  string(partsInput.server);
  string(partsInput.configPath);
  if (!Array.isArray(partsInput.localParts))
    throw new Error("Invalid parts list");
  const parts = normalizePartsConfig(partsInput, false);
  if (!parts.status) throw new Error("Invalid parts");
  const routing = record(settings.printerRouting);
  if (routing.mode !== "single" && routing.mode !== "multiple")
    throw new Error("Invalid routing");
  const printerRouting: PrinterRoutingConfig = {
    mode: routing.mode,
    formatAssignments: Object.fromEntries(
      Object.entries(record(routing.formatAssignments)).map(
        ([format, target]) => [string(format, 255), string(target, 255)],
      ),
    ),
  };
  return {
    settings: {
      printer: printer(settings.printer),
      printers: settings.printers.map(printer),
      printerRouting,
      database,
      parts: parts.data,
      autoUpdate: settings.autoUpdate,
    },
    monitoring:
      backup.monitoring === null ? null : parseConfig(backup.monitoring),
  };
}

export default function SettingsBackup(): void {
  let busy = false;
  for (const action of ["export", "import"] as const) {
    ipcMain.handle(`${action}-settings-backup`, async (event) => {
      const authorized = (): boolean =>
        isMainRendererAuthorized(event) &&
        canViewAuditLogs() &&
        canConfigurePrinter();
      if (!authorized())
        return { status: false, message: "backend.audit.unauthorized" };
      if (busy) return { status: false, message: "settings_backup.busy" };
      busy = true;
      let resume: (() => void) | undefined;
      try {
        const filters = [{ name: "JSON", extensions: ["json"] }];
        if (action === "export") {
          const selected = await dialog.showSaveDialog({
            defaultPath: `zebra-settings-${new Date().toISOString().slice(0, 10)}.json`,
            filters,
          });
          if (selected.canceled || !selected.filePath)
            return { status: true, canceled: true };
          if (!authorized())
            return { status: false, message: "backend.audit.unauthorized" };
          const database = store.get("database");
          const password = decryptDatabasePassword(database.password);
          if (database.password && !password)
            throw new Error("Cannot decrypt password");
          const backup = {
            application: "zebra-label-printing",
            version: 1,
            settings: {
              printer: store.get("printer"),
              printers: store.get("printers"),
              printerRouting: store.get("printerRouting"),
              database: { ...database, password },
              parts: store.get("parts"),
              autoUpdate: store.get("autoUpdate"),
            },
            monitoring: await readConfig(),
          };
          parseSettingsBackup(backup);
          const contents = JSON.stringify(backup, null, 2) + "\n";
          if (Buffer.byteLength(contents) > MAX_BACKUP_BYTES)
            throw new Error("Backup too large");
          const temporary = selected.filePath + "." + randomUUID() + ".tmp";
          try {
            await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
            await rename(temporary, selected.filePath);
          } finally {
            await unlink(temporary).catch(() => undefined);
          }
          return { status: true, message: "settings_backup.export_success" };
        }
        const selected = await dialog.showOpenDialog({
          properties: ["openFile"],
          filters,
        });
        if (selected.canceled || !selected.filePaths[0])
          return { status: true, canceled: true };
        const file = await open(selected.filePaths[0], "r");
        let backup: ReturnType<typeof parseSettingsBackup>;
        try {
          if ((await file.stat()).size > MAX_BACKUP_BYTES)
            throw new Error("Backup too large");
          backup = parseSettingsBackup(JSON.parse(await file.readFile("utf8")));
        } finally {
          await file.close();
        }
        if (!authorized())
          return { status: false, message: "backend.audit.unauthorized" };
        if (isPrintQueueBusy())
          return { status: false, message: "settings_backup.busy" };
        resume = pausePrintsForUpdate();
        const audit = await checkAuditLogWritable();
        if (!audit.status)
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        const previous = store.store;
        const previousMonitoring = await readConfig();
        if (!authorized())
          return { status: false, message: "backend.audit.unauthorized" };
        try {
          await closeDatabase();
          store.set({
            ...backup.settings,
            database: {
              ...backup.settings.database,
              password: encryptDatabasePassword(
                backup.settings.database.password || "",
              ),
            },
          });
          await writeMonitoringConfig(backup.monitoring);
          if (
            !(await appendAuditLog({
              category: "config",
              action: "SETTINGS_IMPORTED",
              status: "success",
              details: { version: 1 },
            }))
          )
            throw new Error("Audit unavailable");
        } catch (error) {
          store.store = previous;
          await writeMonitoringConfig(previousMonitoring);
          throw error;
        }
        return { status: true, message: "settings_backup.import_success" };
      } catch {
        return { status: false, message: `settings_backup.${action}_error` };
      } finally {
        resume?.();
        busy = false;
      }
    });
  }
}
