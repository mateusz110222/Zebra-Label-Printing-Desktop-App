import { ipcMain } from "electron";
import { readdir } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";

import { checkAuditLogWritable } from "./AuditLog";
import { getDatabase } from "./DatabaseConfig";
import { type PrinterStatusResult, queryPrinterStatus } from "./PrinterStatus";
import { type PrinterConfig, store } from "./store";
import { getTemplatesPath } from "./TemplatePaths";

interface ServerInfoRow extends RowDataPacket {
  serverHostname: string;
  databaseName: string;
  serverTimeMs: string | number;
}

interface EngineRow extends RowDataPacket {
  ENGINE: string | null;
}

interface DuplicateFamilyRow extends RowDataPacket {
  name: string;
  count: string | number;
}

const PRINTER_RETRY_DELAY_MS = 1000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isAccessDenied = (rawError?: string): boolean => {
  if (!rawError) {
    return false;
  }

  const value = rawError.toLowerCase();

  return (
    value.includes("access denied") ||
    value.includes("access is denied") ||
    value.includes("eacces") ||
    value.includes("eperm") ||
    value.includes("permission denied")
  );
};

const checkPrinterWithRetry = async (
  printerConfig: PrinterConfig,
): Promise<PrinterStatusResult> => {
  let result = await queryPrinterStatus(printerConfig);

  if (!isAccessDenied(result.rawError)) {
    return result;
  }

  await sleep(PRINTER_RETRY_DELAY_MS);
  result = await queryPrinterStatus(printerConfig);
  return result;
};

export default function SystemHealthHandler(): void {
  ipcMain.handle("get-system-health", async () => {
    const checkedAt = new Date().toISOString();

    const dbConfig = store.get("database");
    const printerConfig = store.get("printer");

    const [printer, templates, database, audit] = await Promise.all([
      checkPrinterWithRetry(printerConfig).catch(
        (error): PrinterStatusResult => ({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message: "backend.printer.error",
          rawError: error instanceof Error ? error.message : String(error),
        }),
      ),

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
            `SELECT
               @@hostname AS serverHostname,
               DATABASE() AS databaseName,
               UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS serverTimeMs`,
          );

          const [[engine]] = await pool.query<EngineRow[]>(
            `SELECT ENGINE
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'family'`,
          );

          const [duplicateRows] = await pool.query<DuplicateFamilyRow[]>(
            `SELECT name, COUNT(*) AS count
             FROM family
             GROUP BY name
             HAVING COUNT(*) > 1
             ORDER BY name
               LIMIT 100`,
          );

          const serverTimeMs = Number(serverInfo?.serverTimeMs);

          const timeDriftMs = Number.isFinite(serverTimeMs)
            ? Math.abs(Date.now() - serverTimeMs)
            : null;

          const engineName = engine?.ENGINE || null;

          const duplicateFamilies = duplicateRows.map((row) => ({
            name: String(row.name),
            count: Number(row.count),
          }));

          const engineOk = engineName?.toUpperCase() === "INNODB";

          const databaseStatus =
            engineOk &&
            duplicateFamilies.length === 0 &&
            timeDriftMs !== null &&
            timeDriftMs <= 30_000;

          return {
            status: databaseStatus,
            reachable: true,
            configuredHost: dbConfig.host || "",
            configuredDatabase: dbConfig.database || "",
            serverHostname: serverInfo?.serverHostname || "",
            databaseName: serverInfo?.databaseName || "",
            engine: engineName,
            engineOk,
            duplicateFamilies,
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
            duplicateFamilies: [],
            timeDriftMs: null,
            message: "backend.health.database_error",
            rawError: error instanceof Error ? error.message : String(error),
          };
        }
      })(),

      checkAuditLogWritable(),
    ]);

    const overallStatus =
      database.status && printer.ready && templates.status && audit.status
        ? "healthy"
        : !database.status ||
            !templates.status ||
            !audit.status ||
            !printer.reachable
          ? "error"
          : "warning";

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
              : printerConfig.type === "COM"
                ? `${printerConfig.comPort || "?"}@${printerConfig.baudRate || 9600}`
                : printerConfig.usbPrinterName || "?",
        },
        templates,
        audit,
      },
    };
  });
}
