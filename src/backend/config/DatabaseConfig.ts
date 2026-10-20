import mysql from "mysql2/promise";
import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { store } from "../utils/store";

type DatabasePool = ReturnType<typeof mysql.createPool>;

let dbPool: DatabasePool | null = null;
let pendingPool: Promise<DatabasePool> | null = null;

const ENCRYPTED_PASSWORD_PREFIX = "enc:v1:";

export const encryptDatabasePassword = (plain: string): string => {
  if (!plain || plain.startsWith(ENCRYPTED_PASSWORD_PREFIX)) {
    return plain;
  }
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

export const decryptDatabasePassword = (stored: string | undefined): string => {
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

export const getMysqlSslOptions = (
  mode: "default" | "required" | "disabled" = "default",
): mysql.SslOptions | undefined => {
  if (mode === "disabled") return undefined;

  const rejectUnauthorized =
    process.env.MYSQL_TLS_REJECT_UNAUTHORIZED === "true" ||
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === "true";

  let ca: string | undefined = undefined;
  const caPathEnv = process.env.MYSQL_CA_CERT_PATH?.trim();

  try {
    const basePath = app?.isPackaged
      ? path.dirname(app.getPath("exe"))
      : app?.getAppPath
        ? app.getAppPath()
        : process.cwd();

    if (caPathEnv) {
      const resolvedPath = path.isAbsolute(caPathEnv)
        ? caPathEnv
        : path.resolve(basePath, caPathEnv);
      if (fs.existsSync(resolvedPath)) {
        ca = fs.readFileSync(resolvedPath, "utf8");
      }
    } else {
      const defaultCertPath = path.resolve(
        basePath,
        "certs/borgwarner-enterprise-root.pem",
      );
      if (fs.existsSync(defaultCertPath)) {
        ca = fs.readFileSync(defaultCertPath, "utf8");
      }
    }
  } catch {
    // ignore filesystem / electron errors during test environments
  }

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
};

export const connectWithTlsFallback = async <T>(
  mode: "default" | "required" | "disabled" | undefined,
  connect: (ssl: mysql.SslOptions | undefined) => Promise<T>,
): Promise<T> => {
  const ssl = getMysqlSslOptions(mode);
  try {
    return await connect(ssl);
  } catch (error) {
    if (mode === "required" || mode === "disabled") throw error;
    return connect(undefined);
  }
};

export const getDatabase = async (): Promise<DatabasePool> => {
  if (dbPool) {
    return dbPool;
  }
  if (pendingPool) return pendingPool;

  const dbConfig = store.get("database");
  const resolvedPassword = decryptDatabasePassword(dbConfig.password);

  const missingVars: string[] = [];

  if (!dbConfig.host) missingVars.push("host");
  if (!dbConfig.user) missingVars.push("user");
  if (!resolvedPassword) missingVars.push("password");
  if (!dbConfig.database) missingVars.push("database");

  if (missingVars.length > 0) {
    const error = new Error("backend.config.database_missing_config");

    Object.assign(error, {
      code: "DATABASE_CONFIG_MISSING",
      details: {
        missingFields: missingVars,
      },
    });

    throw error;
  }

  pendingPool = connectWithTlsFallback(dbConfig.sslMode, async (sslOptions) => {
    const pool = mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: resolvedPassword,
      database: dbConfig.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000,
      idleTimeout: 60000,
      ...(sslOptions ? { ssl: sslOptions } : {}),
    });
    try {
      const connection = await pool.getConnection();
      connection.release();
      return pool;
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw error;
    }
  });
  try {
    dbPool = await pendingPool;
    return dbPool;
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error);

    const databaseError = new Error(
      "backend.config.database_initialization_failed",
    );

    Object.assign(databaseError, {
      code: "DATABASE_INITIALIZATION_FAILED",
      rawError,
    });

    throw databaseError;
  } finally {
    pendingPool = null;
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (pendingPool) await pendingPool.catch(() => undefined);
  if (!dbPool) return;

  const poolToClose = dbPool;
  dbPool = null;

  await poolToClose.end();
};
