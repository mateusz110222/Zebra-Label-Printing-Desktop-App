import mysql from "mysql2/promise";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { store } from "../utils/store";

type DatabasePool = ReturnType<typeof mysql.createPool>;

let dbPool: DatabasePool | null = null;

export const getMysqlSslOptions = (): mysql.SslOptions | undefined => {
  const sslEnv = process.env.MYSQL_SSL?.trim().toLowerCase();
  if (
    sslEnv === "false" ||
    sslEnv === "0" ||
    sslEnv === "disable" ||
    sslEnv === "disabled"
  ) {
    return undefined;
  }

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

export const getDatabase = (): DatabasePool => {
  if (dbPool) {
    return dbPool;
  }

  const dbConfig = store.get("database");

  const missingVars: string[] = [];

  if (!dbConfig.host) missingVars.push("host");
  if (!dbConfig.user) missingVars.push("user");
  if (!dbConfig.password) missingVars.push("password");
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

  try {
    const sslOptions = getMysqlSslOptions();

    dbPool = mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
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
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (!dbPool) return;

  const poolToClose = dbPool;
  dbPool = null;

  await poolToClose.end();
};
