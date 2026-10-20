import { ipcMain, safeStorage } from "electron";
import mysql from "mysql2/promise";
import {
  appendAuditLog,
  canViewAuditLogs,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import { closeDatabase, connectWithTlsFallback } from "./DatabaseConfig";
import { DatabaseConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

const ENCRYPTED_PASSWORD_PREFIX = "enc:v1:";

const encryptPasswordIfAvailable = (plain: string): string => {
  if (!plain || plain.startsWith(ENCRYPTED_PASSWORD_PREFIX)) return plain;
  try {
    if (safeStorage?.isEncryptionAvailable?.()) {
      return (
        ENCRYPTED_PASSWORD_PREFIX +
        safeStorage.encryptString(plain).toString("base64")
      );
    }
  } catch {
    // Fallback to plain value when OS safeStorage is unavailable
  }
  return plain;
};

const decryptPasswordIfAvailable = (stored: string | undefined): string => {
  if (!stored) return "";
  if (!stored.startsWith(ENCRYPTED_PASSWORD_PREFIX)) return stored;
  try {
    if (safeStorage?.isEncryptionAvailable?.()) {
      const buffer = Buffer.from(
        stored.slice(ENCRYPTED_PASSWORD_PREFIX.length),
        "base64",
      );
      return safeStorage.decryptString(buffer);
    }
  } catch {
    return "";
  }
  return "";
};

const normalizeConfig = (
  input: DatabaseConfig,
  existingPassword?: string,
  existingSslMode?: DatabaseConfig["sslMode"],
): DatabaseConfig => ({
  host: input.host?.trim(),
  user: input.user?.trim(),
  password:
    input.password && input.password.length > 0
      ? input.password
      : existingPassword || "",
  database: input.database?.trim(),
  ...(input.sslMode !== undefined || existingSslMode !== undefined
    ? { sslMode: input.sslMode ?? existingSslMode }
    : {}),
});

const isValidDatabaseInput = (input: unknown): input is DatabaseConfig => {
  if (!input || typeof input !== "object") {
    return false;
  }

  const config = input as Record<string, unknown>;

  return (
    typeof config.host === "string" &&
    typeof config.user === "string" &&
    (typeof config.password === "string" || config.password === undefined) &&
    typeof config.database === "string" &&
    (config.sslMode === undefined ||
      ["default", "required", "disabled"].includes(String(config.sslMode))) &&
    config.host.trim().length > 0 &&
    config.host.length <= 255 &&
    config.user.trim().length > 0 &&
    config.user.length <= 128 &&
    (config.password === undefined || config.password.length <= 1024) &&
    config.database.trim().length > 0 &&
    config.database.length <= 128
  );
};

const validateConfig = (config: DatabaseConfig): boolean =>
  Boolean(config.host && config.user && config.password && config.database);

const connectionErrorMessages: Record<string, string> = {
  ER_ACCESS_DENIED_ERROR: "database_access_denied",
  ER_DBACCESS_DENIED_ERROR: "database_permission_denied",
  ER_BAD_DB_ERROR: "database_not_found",
  ENOTFOUND: "database_host_not_found",
  EAI_AGAIN: "database_host_not_found",
  ECONNREFUSED: "database_connection_refused",
  ETIMEDOUT: "database_connection_timeout",
  EHOSTUNREACH: "database_host_unreachable",
  ENETUNREACH: "database_host_unreachable",
  ECONNRESET: "database_connection_lost",
  PROTOCOL_CONNECTION_LOST: "database_connection_lost",
  HANDSHAKE_NO_SSL_SUPPORT: "database_tls_failed",
  HANDSHAKE_SSL_ERROR: "database_tls_failed",
  DEPTH_ZERO_SELF_SIGNED_CERT: "database_tls_failed",
  SELF_SIGNED_CERT_IN_CHAIN: "database_tls_failed",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "database_tls_failed",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "database_tls_failed",
  CERT_HAS_EXPIRED: "database_tls_failed",
  ERR_TLS_CERT_ALTNAME_INVALID: "database_tls_failed",
  ER_NOT_SUPPORTED_AUTH_MODE: "database_auth_unsupported",
  AUTH_SWITCH_PLUGIN_ERROR: "database_auth_unsupported",
  ER_CON_COUNT_ERROR: "database_too_many_connections",
};

export default function SaveDatabaseConfig(): void {
  ipcMain.handle("get-database-config", (event) => {
    if (event?.sender && !isMainRendererAuthorized(event)) {
      return { status: false, message: "backend.audit.unauthorized" };
    }
    const config = store.get("database") || {};
    const plainPassword = decryptPasswordIfAvailable(config.password);
    return {
      status: true,
      data: {
        host: config.host || "",
        user: config.user || "",
        password: "",
        hasPassword: Boolean(plainPassword && plainPassword.length > 0),
        database: config.database || "",
        sslMode: config.sslMode || "default",
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

      const previousConfig = { ...store.get("database") };
      const previousPlainPassword = decryptPasswordIfAvailable(
        previousConfig.password,
      );
      const config = normalizeConfig(
        input || {},
        previousPlainPassword,
        previousConfig.sslMode,
      );
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

      let testConnection: mysql.Connection | null = null;
      let poolModified = false;
      try {
        testConnection = await connectWithTlsFallback(
          config.sslMode,
          (sslOptions) =>
            mysql.createConnection({
              host: config.host,
              user: config.user,
              password: config.password,
              database: config.database,
              connectTimeout: 5000,
              ...(sslOptions ? { ssl: sslOptions } : {}),
            }),
        );
        await testConnection.query("SELECT 1");
        await testConnection.end();
        testConnection = null;

        poolModified = true;
        store.set("database", {
          ...config,
          password: encryptPasswordIfAvailable(config.password || ""),
        });
        await closeDatabase();
        const auditPersisted = await appendAuditLog({
          category: "config",
          action: "DATABASE_CONFIG_CHANGED",
          status: "success",
          details: {
            host: config.host,
            database: config.database,
            user: config.user,
            sslMode: config.sslMode || "default",
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
        store.set("database", previousConfig);
        if (poolModified) {
          await closeDatabase().catch(() => undefined);
        }
        const errorCode =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "DATABASE_CONNECTION_FAILED";
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Driver messages may contain connection data. Never return a password to the UI.
        let rawError = `${errorCode}: ${errorMessage}`;
        for (const password of [
          config.password,
          previousPlainPassword,
          previousConfig.password,
        ]) {
          if (password) rawError = rawError.split(password).join("[REDACTED]");
        }
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
          message: `backend.config.${connectionErrorMessages[errorCode] || "database_connection_failed"}`,
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
