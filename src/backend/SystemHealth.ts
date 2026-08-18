import { ipcMain } from "electron";
import { readdir } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getDatabase } from "./DatabaseConfig";
import { queryPrinterStatus } from "./PrinterStatus";
import { store } from "./store";
import { getTemplatesPath } from "./TemplatePaths";

interface ServerInfoRow extends RowDataPacket {
  serverHostname: string;
  databaseName: string;
  serverTimeMs: string | number;
}

interface EngineRow extends RowDataPacket {
  ENGINE: string | null;
}

export default function SystemHealthHandler(): void {
  ipcMain.handle("get-system-health", async () => {
    const checkedAt = new Date().toISOString();
    const dbConfig = store.get("database");
    const printerConfig = store.get("printer");

    const [printer, templates, database] = await Promise.all([
      queryPrinterStatus(printerConfig).catch((error) => ({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message: "backend.printer.error",
        rawError: error instanceof Error ? error.message : String(error),
      })),
      readdir(getTemplatesPath())
        .then((files) => ({
          status: true,
          path: getTemplatesPath(),
          count: files.filter((file) => /\.(zpl|txt)$/i.test(file)).length,
          message: "backend.health.templates_ok",
        }))
        .catch((error) => ({
          status: false,
          path: getTemplatesPath(),
          count: 0,
          message: "backend.health.templates_error",
          rawError: error instanceof Error ? error.message : String(error),
        })),
      (async () => {
        try {
          const pool = getDatabase();
          const [[serverInfo]] = await pool.query<ServerInfoRow[]>(
            `SELECT @@hostname AS serverHostname,
                    DATABASE() AS databaseName,
                    UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS serverTimeMs`,
          );
          const [[engine]] = await pool.query<EngineRow[]>(
            `SELECT ENGINE
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'family'`,
          );
          const serverTimeMs = Number(serverInfo?.serverTimeMs);
          const timeDriftMs = Number.isFinite(serverTimeMs)
            ? Math.abs(Date.now() - serverTimeMs)
            : null;
          const engineName = engine?.ENGINE || null;
          return {
            status:
              engineName?.toUpperCase() === "INNODB" &&
              timeDriftMs !== null &&
              timeDriftMs <= 30_000,
            reachable: true,
            configuredHost: dbConfig.host || "",
            configuredDatabase: dbConfig.database || "",
            serverHostname: serverInfo?.serverHostname || "",
            databaseName: serverInfo?.databaseName || "",
            engine: engineName,
            engineOk: engineName?.toUpperCase() === "INNODB",
            timeDriftMs,
            message: "backend.health.database_checked",
          };
        } catch (error) {
          return {
            status: false,
            reachable: false,
            configuredHost: dbConfig.host || "",
            configuredDatabase: dbConfig.database || "",
            serverHostname: "",
            databaseName: "",
            engine: null,
            engineOk: false,
            timeDriftMs: null,
            message: "backend.health.database_error",
            rawError: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
    ]);

    const overallStatus =
      database.status && printer.ready && templates.status
        ? "healthy"
        : database.reachable && printer.reachable
          ? "warning"
          : "error";

    return {
      status: true,
      data: {
        overallStatus,
        checkedAt,
        database,
        printer: {
          ...printer,
          type: printerConfig.type,
          target:
            printerConfig.type === "IP"
              ? `${printerConfig.ip || "?"}:${printerConfig.port || "?"}`
              : `${printerConfig.comPort || "?"}@${printerConfig.baudRate || 9600}`,
        },
        templates,
      },
    };
  });
}
