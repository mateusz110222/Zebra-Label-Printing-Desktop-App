import { app } from "electron";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { getAuditActor } from "./AuditSession";

export {
  AUDIT_SESSION_TTL_MS,
  canConfigurePrinter,
  canViewAuditLogs,
  clearAuditSession,
  getAuditActor,
  setAuditSession,
} from "./AuditSession";

export type AuditCategory = "print" | "auth" | "config" | "template" | "system";

export type AuditStatus = "success" | "failure";

export type AuditDetailValue =
  | string
  | number
  | boolean
  | null
  | AuditDetailValue[]
  | { [key: string]: AuditDetailValue };

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: AuditCategory;
  action: string;
  status: AuditStatus;
  actor: string;
  workstation: string;
  appVersion: string;
  details: Record<string, AuditDetailValue>;
}

export interface AuditLogQuery {
  scope?: "all" | "print" | "audit";
  category?: AuditCategory | "all";
  status?: AuditStatus | "all";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface AuditLogInput {
  category: AuditCategory;
  action: string;
  status: AuditStatus;
  actor?: string;
  details?: Record<string, unknown>;
}

const MAX_DETAIL_STRING_LENGTH = 2000;
const MAX_DETAIL_DEPTH = 10;

let writeQueue: Promise<void> = Promise.resolve();
let lastWriteError: string | null = null;
let lastWriteFailureAt: string | null = null;

const shouldSkipDetailKey = (key: string): boolean =>
  /password|secret|token/i.test(key) || key === "batchId" || key === "labelId";

const sanitizeDetailValue = (
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): AuditDetailValue | undefined => {
  if (depth > MAX_DETAIL_DEPTH) {
    return "[max-depth]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, MAX_DETAIL_STRING_LENGTH);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    const result: AuditDetailValue[] = [];

    for (const item of value) {
      const sanitized = sanitizeDetailValue(item, seen, depth + 1);

      if (sanitized !== undefined) {
        result.push(sanitized);
      }
    }

    seen.delete(value);

    return result;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    const result: Record<string, AuditDetailValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (shouldSkipDetailKey(key)) {
        continue;
      }

      const sanitized = sanitizeDetailValue(nestedValue, seen, depth + 1);

      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    seen.delete(value);

    return result;
  }

  return undefined;
};

const sanitizeDetails = (
  details: Record<string, unknown> = {},
): Record<string, AuditDetailValue> => {
  const result: Record<string, AuditDetailValue> = {};
  const seen = new WeakSet<object>();

  for (const [key, value] of Object.entries(details)) {
    if (shouldSkipDetailKey(key)) {
      continue;
    }

    const sanitized = sanitizeDetailValue(value, seen, 0);

    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }

  return result;
};

const getLogsDirectory = (): string =>
  path.join(app.getPath("userData"), "logs");

const rememberWriteFailure = (error: unknown): void => {
  lastWriteError = error instanceof Error ? error.message : String(error);

  lastWriteFailureAt = new Date().toISOString();

  console.error("Unable to persist audit log:", error);
};

export const appendAuditLog = async (
  input: AuditLogInput,
): Promise<boolean> => {
  const entry: AuditLogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: input.category,
    action: input.action,
    status: input.status,
    actor: input.actor?.trim() || getAuditActor(),
    workstation: os.hostname(),
    appVersion: app.getVersion(),
    details: sanitizeDetails(input.details),
  };

  let persisted = false;

  writeQueue = writeQueue.then(async () => {
    try {
      insertEntries(await getDatabase(), [entry]);

      persisted = true;
      lastWriteError = null;
      lastWriteFailureAt = null;
    } catch (error) {
      rememberWriteFailure(error);
    }
  });

  await writeQueue;

  return persisted;
};

export interface AuditStorageStatus {
  status: boolean;
  path: string;
  message: string;
  lastFailureAt: string | null;
  rawError?: string;
}

export const checkAuditLogWritable = async (): Promise<AuditStorageStatus> => {
  await writeQueue;

  const logsPath = getDatabasePath();

  try {
    const db = await getDatabase();
    db.prepare("INSERT OR REPLACE INTO metadata VALUES (?, ?)").run(
      "last_write_probe",
      new Date().toISOString(),
    );

    lastWriteError = null;
    lastWriteFailureAt = null;

    return {
      status: true,
      path: logsPath,
      message: "backend.audit.storage_ready",
      lastFailureAt: null,
    };
  } catch (error) {
    rememberWriteFailure(error);

    return {
      status: false,
      path: logsPath,
      message: "backend.audit.storage_unavailable",
      lastFailureAt: lastWriteFailureAt,
      rawError: lastWriteError || undefined,
    };
  }
};

const INTERNAL_ACTIONS = new Set([
  "TEST_LABEL_DATA_PREPARED",
  "LABEL_DATA_PREPARED",
  "LABEL_BATCH_REQUESTED",
]);

const getDatabasePath = (): string =>
  path.join(getLogsDirectory(), "history.sqlite");

export async function readMonitoringBatch(
  key: string,
  since: string,
): Promise<{ through: number; events: AuditLogEntry[] }> {
  const db = await getDatabase();
  const cursor = Number(
    db.prepare("SELECT value FROM metadata WHERE key = ?").get(key)?.value ?? 0,
  );
  const rows = db
    .prepare(
      "SELECT rowid, payload FROM entries WHERE rowid > ? AND timestamp >= ? ORDER BY rowid LIMIT 100",
    )
    .all(cursor, since);
  const events: AuditLogEntry[] = [];
  let through = cursor;
  let bytes = 0;
  for (const row of rows) {
    const payload = String(row.payload);
    bytes += Buffer.byteLength(payload, "utf8") + 1;
    if (events.length && bytes > 1024 * 1024) break;
    events.push(JSON.parse(payload) as AuditLogEntry);
    through = Number(row.rowid);
  }
  return { through, events };
}

export async function acknowledgeMonitoringBatch(
  key: string,
  through: number,
): Promise<void> {
  const db = await getDatabase();
  db.prepare("INSERT OR REPLACE INTO metadata VALUES (?, ?)").run(
    key,
    String(through),
  );
}

let database: Promise<DatabaseSync> | undefined;

function getDatabase(): Promise<DatabaseSync> {
  database ??= openDatabase().catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function openDatabase(): Promise<DatabaseSync> {
  await mkdir(getLogsDirectory(), { recursive: true });
  const db = new DatabaseSync(getDatabasePath());
  try {
    db.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS entries (" +
        "id TEXT NOT NULL UNIQUE, timestamp TEXT NOT NULL, category TEXT NOT NULL, " +
        "status TEXT NOT NULL, visible INTEGER NOT NULL, payload TEXT NOT NULL, search_text TEXT NOT NULL);" +
        "CREATE INDEX IF NOT EXISTS entries_by_time ON entries(timestamp DESC) WHERE visible = 1;" +
        "CREATE INDEX IF NOT EXISTS entries_by_category ON entries(category, timestamp DESC) WHERE visible = 1;" +
        "CREATE INDEX IF NOT EXISTS entries_by_status ON entries(status, timestamp DESC) WHERE visible = 1;" +
        "CREATE VIRTUAL TABLE IF NOT EXISTS entry_search USING fts5(search_text, content='', tokenize='trigram case_sensitive 1');",
    );
    const getMarker = db.prepare("SELECT 1 FROM metadata WHERE key = ?");
    if (!getMarker.get("jsonl-import-v1")) {
      const files = await readdir(getLogsDirectory());
      for (const file of files) {
        if (!/^(?:audit|print)-\d{4}-\d{2}(?:-\d{2})?\.jsonl$/.test(file))
          continue;
        const marker = "imported:" + file;
        if (getMarker.get(marker)) continue;
        const content = await readFile(
          path.join(getLogsDirectory(), file),
          "utf8",
        );
        insertEntries(db, legacyEntries(content), marker);
      }
      db.prepare("INSERT OR IGNORE INTO metadata VALUES (?, ?)").run(
        "jsonl-import-v1",
        "1",
      );
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function* legacyEntries(content: string): Generator<AuditLogEntry> {
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: AuditLogEntry;
    try {
      entry = JSON.parse(line) as AuditLogEntry;
    } catch {
      continue;
    }
    if (
      typeof entry?.timestamp !== "string" ||
      !Number.isFinite(Date.parse(entry.timestamp))
    ) {
      continue;
    }
    if (typeof entry.id !== "string" || !entry.id) {
      entry.id = createHash("sha256").update(line).digest("hex");
    }
    entry.details = sanitizeDetails(
      entry.details &&
        typeof entry.details === "object" &&
        !Array.isArray(entry.details)
        ? entry.details
        : {},
    );
    yield entry;
  }
}

function insertEntries(
  db: DatabaseSync,
  entries: Iterable<AuditLogEntry>,
  marker?: string,
): void {
  const insert = db.prepare(
    "INSERT INTO entries (id, timestamp, category, status, visible, payload, search_text) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING rowid",
  );
  const index = db.prepare(
    "INSERT INTO entry_search (rowid, search_text) VALUES (?, ?)",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of entries) {
      const visible = !INTERNAL_ACTIONS.has(entry.action);
      const searchText = visible
        ? [
            entry.action,
            entry.actor,
            entry.workstation,
            JSON.stringify(entry.details),
          ]
            .join(" ")
            .toLocaleLowerCase()
        : "";
      const row = insert.get(
        entry.id,
        new Date(entry.timestamp).toISOString(),
        String(entry.category ?? ""),
        String(entry.status ?? ""),
        Number(visible),
        JSON.stringify(entry),
        searchText,
      );
      if (row && visible) index.run(row.rowid, searchText);
    }
    if (marker) {
      db.prepare("INSERT OR IGNORE INTO metadata VALUES (?, ?)").run(
        marker,
        "1",
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function localDateBoundary(
  value: string | undefined,
  nextDay = false,
): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value + "T00:00:00");
  if (!Number.isFinite(date.getTime())) return;
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export const readAuditLogs = async (
  query: AuditLogQuery = {},
): Promise<{
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}> => {
  await writeQueue;
  const db = await getDatabase();
  const conditions = ["visible = 1"];
  const parameters: SQLInputValue[] = [];
  const filter = (condition: string, value: SQLInputValue): void => {
    conditions.push(condition);
    parameters.push(value);
  };
  if (query.scope === "print") conditions.push("category = 'print'");
  if (query.scope === "audit") conditions.push("category <> 'print'");
  if (query.category && query.category !== "all")
    filter("category = ?", query.category);
  if (query.status && query.status !== "all")
    filter("status = ?", query.status);

  const from = localDateBoundary(query.dateFrom);
  const until = localDateBoundary(query.dateTo, true);
  if (from) filter("timestamp >= ?", from);
  if (until) filter("timestamp < ?", until);

  const search = query.search?.trim().toLocaleLowerCase();
  if (search) {
    if ([...search].length >= 3 && !search.includes("\0")) {
      filter(
        "rowid IN (SELECT rowid FROM entry_search WHERE entry_search MATCH ?)",
        '"' + search.replaceAll('"', '""') + '"',
      );
    } else {
      filter("instr(search_text, ?) > 0", search);
    }
  }

  const page = Math.max(
    1,
    Math.min(Number.MAX_SAFE_INTEGER, Math.floor(query.page || 1)),
  );
  const pageSize = Math.min(
    50000,
    Math.max(1, Math.floor(query.pageSize || 100)),
  );
  const offset = Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * pageSize);
  const where = conditions.join(" AND ");
  const total = Number(
    db
      .prepare("SELECT count(*) AS total FROM entries WHERE " + where)
      .get(...parameters)?.total,
  );
  const rows =
    offset >= total
      ? []
      : db
          .prepare(
            "SELECT payload FROM entries WHERE " +
              where +
              " ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?",
          )
          .all(...parameters, pageSize, offset);
  return {
    entries: rows.map(
      (row) => JSON.parse(String(row.payload)) as AuditLogEntry,
    ),
    total,
    page,
    pageSize,
  };
};
