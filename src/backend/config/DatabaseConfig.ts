import mysql from "mysql2/promise";
import { store } from "../utils/store";

type DatabasePool = ReturnType<typeof mysql.createPool>;

let dbPool: DatabasePool | null = null;

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
