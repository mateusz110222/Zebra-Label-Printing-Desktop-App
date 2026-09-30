import { ipcMain } from "electron";
import { readdir } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";

import { getTemplatesPath } from "./TemplatePaths";
import { PrinterConfig, store } from "../utils/store";
import { PrinterStatusResult, queryPrinterStatus } from "../printer/PrinterStatus";
import { getConfiguredPrinters, getPrinterName, getPrinterRoutingConfig } from "../printer/PrinterConfigs";
import { getDatabase } from "../config/DatabaseConfig";
import { checkAuditLogWritable } from "../audit/AuditLog";

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

  await sleep(1000);
  result = await queryPrinterStatus(printerConfig);
  return result;
};

const getPrinterTarget = (printerConfig: PrinterConfig): string =>
  printerConfig.type === "IP"
    ? `${printerConfig.ip || "?"}:${printerConfig.port || "?"}`
    : printerConfig.type === "COM"
      ? `${printerConfig.comPort || "?"}@${printerConfig.baudRate || 9600}`
      : printerConfig.usbPrinterName || "?";

export default function SystemHealthHandler(): void {
  ipcMain.handle("get-system-health", async () => {
    const checkedAt = new Date().toISOString();

    const dbConfig = store.get("database");
    const printerConfig = store.get("printer");
    const printerMode = getPrinterRoutingConfig().mode;
    const configuredPrinters = getConfiguredPrinters();
    const printersToCheck =
      printerMode === "multiple" && configuredPrinters.length > 0
        ? configuredPrinters
        : [printerConfig];
    const activePrinterName = getPrinterName(printerConfig);

    const [printers, templates, database, audit] = await Promise.all([
      Promise.all(
        printersToCheck.map(async (configuredPrinter) => {
          const status = await checkPrinterWithRetry(configuredPrinter).catch(
            (error): PrinterStatusResult => ({
              status: false,
              reachable: false,
              ready: false,
              detailsAvailable: false,
              message: "backend.printer.error",
              rawError: error instanceof Error ? error.message : String(error),
            }),
          );

          const name = getPrinterName(configuredPrinter);
          return {
            ...status,
            name,
            active: name === activePrinterName,
            type: configuredPrinter.type,
            target: getPrinterTarget(configuredPrinter),
          };
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
          const computerTimeMs = Date.now();

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

          const parsedServerTimeMs = Number(serverInfo?.serverTimeMs);
          const serverTimeMs = Number.isFinite(parsedServerTimeMs)
            ? parsedServerTimeMs
            : null;

          const timeDriftMs =
            serverTimeMs !== null
              ? Math.abs(computerTimeMs - serverTimeMs)
              : null;

          const engineName = engine?.ENGINE || null;

          const duplicateFamilies = duplicateRows.map((row) => ({
            name: String(row.name),
            count: Number(row.count),
          }));

          const engineOk = engineName?.toUpperCase() === "INNODB";

          const messages: string[] = [];
          const rawErrors: string[] = [];

          if (!engineOk) {
            messages.push("backend.health.database_engine_invalid");

            rawErrors.push(
              `Invalid storage engine for table "family": ${engineName ?? "UNKNOWN"}. Expected: InnoDB.`,
            );
          }

          if (duplicateFamilies.length > 0) {
            messages.push("backend.health.database_duplicates");

            rawErrors.push(
              `Duplicate family names: ${duplicateFamilies
                .map((item) => `${item.name} (${item.count})`)
                .join(", ")}`,
            );
          }

          if (timeDriftMs === null) {
            messages.push("backend.health.database_time_unavailable");
          } else if (timeDriftMs > 60_000) {
            messages.push("backend.health.database_time_drift");
          }

          const databaseStatus = messages.length === 0;

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
            serverTimeMs,
            computerTimeMs,

            message: databaseStatus ? ["backend.health.database_ok"] : messages,

            rawError: rawErrors.length > 0 ? rawErrors.join("\n") : undefined,
          };
        } catch (error) {
          const rawError =
            error instanceof Error ? error.message : String(error);

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
            serverTimeMs: null,
            computerTimeMs: Date.now(),
            message: ["backend.health.database_error"],
            rawError,
          };
        }
      })(),

      checkAuditLogWritable(),
    ]);

    const printer =
      printers.find((candidate) => candidate.active) || printers[0];
    const allPrintersReady =
      printers.length > 0 && printers.every((candidate) => candidate.ready);
    const allPrintersReachable =
      printers.length > 0 && printers.every((candidate) => candidate.reachable);

    const overallStatus =
      database.status && allPrintersReady && templates.status && audit.status
        ? "healthy"
        : !database.status ||
            !templates.status ||
            !audit.status ||
            !allPrintersReachable
          ? "error"
          : "warning";

    return {
      status: true,
      data: {
        overallStatus,
        checkedAt,
        database,
        printerMode,
        printer,
        printers,
        templates,
        audit,
      },
    };
  });
}
