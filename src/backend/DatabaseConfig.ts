import mysql from "mysql2/promise";

type DatabasePool = ReturnType<typeof mysql.createPool>;

let dbPool: DatabasePool | null = null;

export const getDatabase = (): DatabasePool => {
  if (dbPool) {
    return dbPool;
  }

  const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

  const missingVars: string[] = [];

  if (!dbConfig.host) missingVars.push("DB_HOST");
  if (!dbConfig.user) missingVars.push("DB_USER");
  if (!dbConfig.password) missingVars.push("DB_PASSWORD");
  if (!dbConfig.database) missingVars.push("DB_NAME");

  if (missingVars.length > 0) {
    const errorMsg = `BŁĄD KRYTYCZNY: Brakuje zmiennych środowiskowych: ${missingVars.join(", ")}.
    Ponieważ używasz 'define' w Vite, upewnij się, że plik .env istniał na komputerze deweloperskim PODCZAS BUDOWANIA (npm run build) i zawierał te wartości.`;

    throw new Error(errorMsg);
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database initialization failed: ${message}`);
  }
};

/**
 * Execute a database operation with retry logic and exponential backoff.
 * @param operation - The async operation to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns The result of the operation
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-transient errors
      const errorMessage = lastError.message.toLowerCase();
      if (
        errorMessage.includes("access denied") ||
        errorMessage.includes("unknown database") ||
        errorMessage.includes("backend.")
      ) {
        throw lastError;
      }

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export const closeDatabase = async (): Promise<void> => {
  if (dbPool) {
    try {
      const poolToClose = dbPool;
      dbPool = null;
      await poolToClose.end();
    } catch (error) {
      throw error;
    }
  }
};
