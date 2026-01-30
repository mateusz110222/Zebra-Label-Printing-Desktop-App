import mysql from 'mysql2/promise'
import path from 'node:path'
import dotenv from 'dotenv'
import { app } from 'electron'

type DatabasePool = ReturnType<typeof mysql.createPool>

const initializeEnv = (): void => {
  try {
    const isProd = app.isPackaged
    const envPath = isProd
      ? path.join(process.resourcesPath, '.env')
      : path.join(process.cwd(), 'src', 'backend', '.env')

    dotenv.config({ path: envPath })
  } catch (error) {
    throw error
  }
}

let dbPool: DatabasePool | null = null

export const getDatabase = (): DatabasePool => {
  if (dbPool) {
    return dbPool
  }

  try {
    initializeEnv()
    dbPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000, // 10s
      idleTimeout: 60000 // 60s
    })

    return dbPool
  } catch (error) {
    throw error
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (dbPool) {
    try {
      const poolToClose = dbPool
      dbPool = null
      await poolToClose.end()
    } catch (error) {}
  }
}
