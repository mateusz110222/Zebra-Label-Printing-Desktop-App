import { app } from "electron";
import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
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

const getCurrentLogPath = (category: AuditCategory): string => {
  const day = new Date().toISOString().slice(0, 10);
  const prefix = category === "print" ? "print" : "audit";

  return path.join(getLogsDirectory(), `${prefix}-${day}.jsonl`);
};

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
      await mkdir(getLogsDirectory(), {
        recursive: true,
      });

      const file = await open(getCurrentLogPath(entry.category), "a");

      try {
        await file.appendFile(`${JSON.stringify(entry)}\n`, "utf8");

        await file.sync();
      } finally {
        await file.close();
      }

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

  const logsPath = getLogsDirectory();

  const probePath = path.join(
    logsPath,
    `.audit-write-probe-${process.pid}-${randomUUID()}`,
  );

  try {
    await mkdir(logsPath, {
      recursive: true,
    });

    const probe = await open(probePath, "wx");

    try {
      await probe.writeFile(new Date().toISOString(), "utf8");

      await probe.sync();
    } finally {
      await probe.close();
    }

    await unlink(probePath);

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

    await unlink(probePath).catch(() => undefined);

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

const matchesQuery = (entry: AuditLogEntry, query: AuditLogQuery): boolean => {
  if (INTERNAL_ACTIONS.has(entry.action)) {
    return false;
  }

  if (query.scope === "print" && entry.category !== "print") {
    return false;
  }

  if (query.scope === "audit" && entry.category === "print") {
    return false;
  }

  if (
    query.category &&
    query.category !== "all" &&
    entry.category !== query.category
  ) {
    return false;
  }

  if (query.status && query.status !== "all" && entry.status !== query.status) {
    return false;
  }

  const timestamp = new Date(entry.timestamp);

  const localDate =
    `${timestamp.getFullYear()}-` +
    `${String(timestamp.getMonth() + 1).padStart(2, "0")}-` +
    `${String(timestamp.getDate()).padStart(2, "0")}`;

  if (query.dateFrom && localDate < query.dateFrom) {
    return false;
  }

  if (query.dateTo && localDate > query.dateTo) {
    return false;
  }

  const search = query.search?.trim().toLocaleLowerCase();

  if (search) {
    const searchable = [
      entry.action,
      entry.actor,
      entry.workstation,
      JSON.stringify(entry.details),
    ]
      .join(" ")
      .toLocaleLowerCase();

    if (!searchable.includes(search)) {
      return false;
    }
  }

  return true;
};

const shiftIsoDateByDays = (
  isoDate: string | undefined,
  deltaDays: number,
): string | null => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
};

export const readAuditLogs = async (
  query: AuditLogQuery = {},
): Promise<{
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}> => {
  await writeQueue;

  await mkdir(getLogsDirectory(), {
    recursive: true,
  });

  const filePattern = /^(?:audit|print)-(\d{4}-\d{2}(?:-\d{2})?)\.jsonl$/;
  const minFileDate = shiftIsoDateByDays(query.dateFrom, -1);
  const maxFileDate = shiftIsoDateByDays(query.dateTo, 1);

  const files = (await readdir(getLogsDirectory()))
    .filter((name) => {
      const match = filePattern.exec(name);
      if (!match) {
        return false;
      }

      const fileDate = match[1];
      if (fileDate.length === 10) {
        if (minFileDate && fileDate < minFileDate) return false;
        if (maxFileDate && fileDate > maxFileDate) return false;
      }

      if (query.scope === "audit") {
        return name.startsWith("audit-");
      }

      if (query.scope === "print") {
        return name.startsWith("print-") || name.startsWith("audit-");
      }

      return true;
    })
    .sort()
    .reverse()
    .slice(0, 1460);

  const entries: AuditLogEntry[] = [];

  for (const file of files) {
    const fullPath = path.join(getLogsDirectory(), file);

    const content = await readFile(fullPath, "utf8");

    for (const line of content.split("\n")) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as AuditLogEntry;

        const rawDetails =
          typeof entry.details === "object" &&
          entry.details !== null &&
          !Array.isArray(entry.details)
            ? entry.details
            : {};

        entry.details = sanitizeDetails(rawDetails as Record<string, unknown>);

        if (matchesQuery(entry, query)) {
          entries.push(entry);
        }
      } catch {
        // A damaged line must not make the remaining
        // audit history unavailable.
      }
    }
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const page = Math.max(1, query.page || 1);

  const pageSize = Math.min(50000, Math.max(1, query.pageSize || 100));

  const start = (page - 1) * pageSize;

  return {
    entries: entries.slice(start, start + pageSize),
    total: entries.length,
    page,
    pageSize,
  };
};
