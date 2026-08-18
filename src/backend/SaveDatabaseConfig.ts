import { ipcMain } from "electron";
import mysql from "mysql2/promise";
import { appendAuditLog, canViewAuditLogs } from "./AuditLog";
import { closeDatabase } from "./DatabaseConfig";
import { DatabaseConfig, store } from "./store";

const normalizeConfig = (input: DatabaseConfig): DatabaseConfig => ({
  host: input.host?.trim(),
  user: input.user?.trim(),
  password: input.password || "",
  database: input.database?.trim(),
});

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
    async (_event, input: DatabaseConfig) => {
      if (!canViewAuditLogs()) {
        return { status: false, message: "backend.audit.unauthorized" };
      }

      const config = normalizeConfig(input || {});
      if (!validateConfig(config)) {
        return { status: false, message: "backend.config.invalid_database" };
      }

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

        await closeDatabase();
        store.set("database", config);
        await appendAuditLog({
          category: "config",
          action: "DATABASE_CONFIG_CHANGED",
          status: "success",
          details: {
            host: config.host,
            database: config.database,
            user: config.user,
          },
        });
        return {
          status: true,
          message: "backend.config.database_save_success",
        };
      } catch (error) {
        const rawError = error instanceof Error ? error.message : String(error);
        await appendAuditLog({
          category: "config",
          action: "DATABASE_CONFIG_CHANGED",
          status: "failure",
          details: {
            host: config.host || "",
            database: config.database || "",
            error: rawError,
          },
        });
        return {
          status: false,
          message: "backend.config.database_connection_failed",
          rawError,
        };
      }
    },
  );
}
