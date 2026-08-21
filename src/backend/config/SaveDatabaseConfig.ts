import { ipcMain } from "electron";
import mysql from "mysql2/promise";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable } from "../audit/AuditLog";
import { closeDatabase } from "./DatabaseConfig";
import { DatabaseConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

const normalizeConfig = (input: DatabaseConfig): DatabaseConfig => ({
  host: input.host?.trim(),
  user: input.user?.trim(),
  password: input.password || "",
  database: input.database?.trim(),
});

const isValidDatabaseInput = (input: unknown): input is DatabaseConfig => {
  if (!input || typeof input !== "object") {
    return false;
  }

  const config = input as Record<string, unknown>;

  return (
    typeof config.host === "string" &&
    typeof config.user === "string" &&
    typeof config.password === "string" &&
    typeof config.database === "string" &&
    config.host.trim().length > 0 &&
    config.host.length <= 255 &&
    config.user.trim().length > 0 &&
    config.user.length <= 128 &&
    config.password.length > 0 &&
    config.password.length <= 1024 &&
    config.database.trim().length > 0 &&
    config.database.length <= 128
  );
};

const validateConfig = (config: DatabaseConfig): boolean =>
  Boolean(config.host && config.user && config.password && config.database);

export default function SaveDatabaseConfig(): void {
  ipcMain.handle("get-database-config", () => {
    const config = store.get("database");
    return {
      status: true,
      data: canViewAuditLogs()
        ? config
        : {
            host: config.host || "",
            user: config.user || "",
            password: "",
            database: config.database || "",
          },
    };
  });

  ipcMain.handle(
    "save-database-config",
    async (event, input: DatabaseConfig) => {
      if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }

      if (!isValidDatabaseInput(input)) {
        return {
          status: false,
          message: "backend.config.invalid_database",
        };
      }

      const config = normalizeConfig(input || {});
      if (!validateConfig(config)) {
        return { status: false, message: "backend.config.invalid_database" };
      }

      const auditStorage = await checkAuditLogWritable();
      if (!auditStorage.status) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          rawError: auditStorage.rawError,
        };
      }

      const previousConfig = { ...store.get("database") };
      let testConnection: mysql.Connection | null = null;
      try {
        testConnection = await mysql.createConnection({
          host: config.host,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 5000,
        });
        await testConnection.query("SELECT 1");
        await testConnection.end();
        testConnection = null;

        store.set("database", config);
        await closeDatabase();
        const auditPersisted = await appendAuditLog({
          category: "config",
          action: "DATABASE_CONFIG_CHANGED",
          status: "success",
          details: {
            host: config.host,
            database: config.database,
            user: config.user,
          },
        });

        if (!auditPersisted) {
          store.set("database", previousConfig);
          await closeDatabase().catch(() => undefined);
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }

        return {
          status: true,
          message: "backend.config.database_save_success",
        };
      } catch (error) {
        const rawError = error instanceof Error ? error.message : String(error);
        store.set("database", previousConfig);
        await closeDatabase().catch(() => undefined);
        const errorCode =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "DATABASE_CONNECTION_FAILED";
        const auditPersisted = await appendAuditLog({
          category: "config",
          action: "DATABASE_CONFIG_CHANGED",
          status: "failure",
          details: {
            host: config.host || "",
            database: config.database || "",
            errorCode,
          },
        });
        if (!auditPersisted) {
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }
        return {
          status: false,
          message: "backend.config.database_connection_failed",
          rawError,
        };
      } finally {
        if (testConnection) {
          await testConnection.end().catch(() => undefined);
        }
      }
    },
  );
}
