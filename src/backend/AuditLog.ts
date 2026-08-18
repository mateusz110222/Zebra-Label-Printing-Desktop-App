import { app } from "electron";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export type AuditCategory = "print" | "auth" | "config" | "template" | "system";
export type AuditStatus = "success" | "failure";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: AuditCategory;
  action: string;
  status: AuditStatus;
  actor: string;
  workstation: string;
  appVersion: string;
  details: Record<string, string | number | boolean | null>;
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

interface UserSession {
  actor: string;
  canViewAudit: boolean;
}

let currentSession: UserSession | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const sanitizeDetails = (
  details: Record<string, unknown> = {},
): Record<string, string | number | boolean | null> => {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (
      /password|secret|token/i.test(key) ||
      key === "batchId" ||
      key === "labelId"
    ) {
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = typeof value === "string" ? value.slice(0, 2000) : value;
    } else if (value !== undefined) {
      result[key] = JSON.stringify(value).slice(0, 2000);
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

export const setAuditSession = (actor: string, canViewAudit: boolean): void => {
  currentSession = { actor, canViewAudit };
};

export const clearAuditSession = (): void => {
  currentSession = null;
};

export const getAuditActor = (): string =>
  currentSession?.actor || os.userInfo().username || "anonymous";

export const canViewAuditLogs = (): boolean =>
  currentSession?.canViewAudit === true;

export const appendAuditLog = async (input: AuditLogInput): Promise<void> => {
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

  writeQueue = writeQueue
    .then(async () => {
      await mkdir(getLogsDirectory(), { recursive: true });
      await appendFile(
        getCurrentLogPath(entry.category),
        `${JSON.stringify(entry)}\n`,
        "utf8",
      );
    })
    .catch((error) => {
      console.error("Unable to persist audit log:", error);
    });

  await writeQueue;
};

const matchesQuery = (entry: AuditLogEntry, query: AuditLogQuery): boolean => {
  if (query.scope === "print" && entry.category !== "print") return false;
  if (query.scope === "audit" && entry.category === "print") return false;
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
  const localDate = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")}`;
  if (query.dateFrom && localDate < query.dateFrom) return false;
  if (query.dateTo && localDate > query.dateTo) return false;

  const search = query.search?.trim().toLocaleLowerCase();
  if (search) {
    const searchable = [
      entry.action,
      entry.actor,
      entry.workstation,
      ...Object.values(entry.details).map(String),
    ]
      .join(" ")
      .toLocaleLowerCase();
    if (!searchable.includes(search)) return false;
  }
  return true;
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
  await mkdir(getLogsDirectory(), { recursive: true });
  const filePattern = /^(?:audit|print)-\d{4}-\d{2}(?:-\d{2})?\.jsonl$/;
  const files = (await readdir(getLogsDirectory()))
    .filter((name) => {
      if (!filePattern.test(name)) return false;
      if (query.scope === "audit") return name.startsWith("audit-");
      if (query.scope === "print") {
        // Audit files are also checked for compatibility with the earlier combined format.
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
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as AuditLogEntry;
        entry.details = sanitizeDetails(entry.details || {});
        if (matchesQuery(entry, query)) entries.push(entry);
      } catch {
        // A damaged line must not make the remaining audit history unavailable.
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
