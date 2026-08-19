import { beforeEach, describe, expect, it, vi } from "vitest";
import SystemHealthHandler from "../SystemHealth";

interface HealthResponseData {
  overallStatus: "healthy" | "warning" | "error";
  database: {
    status: boolean;
    duplicateFamilies: Array<{ name: string; count: number }>;
  };
  audit: { status: boolean };
}

const mocks = vi.hoisted(() => ({
  ipcHandler: undefined as
    ((...args: unknown[]) => Promise<Record<string, unknown>>) | undefined,
  query: vi.fn(),
  checkAuditLogWritable: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (
        _channel: string,
        handler: (...args: unknown[]) => Promise<Record<string, unknown>>,
      ) => {
        mocks.ipcHandler = handler;
      },
    ),
  },
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn().mockResolvedValue(["16x13.zpl"]),
}));

vi.mock("../DatabaseConfig", () => ({
  getDatabase: () => ({ query: mocks.query }),
}));

vi.mock("../PrinterStatus", () => ({
  queryPrinterStatus: vi.fn().mockResolvedValue({
    status: true,
    reachable: true,
    ready: true,
    detailsAvailable: true,
    message: "backend.printer.ready",
  }),
}));

vi.mock("../store", () => ({
  store: {
    get: vi.fn((key: string) =>
      key === "database"
        ? { host: "db", database: "labels" }
        : { type: "IP", ip: "10.0.0.10", port: 9100 },
    ),
  },
}));

vi.mock("../TemplatePaths", () => ({
  getTemplatesPath: () => "C:/templates",
}));

vi.mock("../AuditLog", () => ({
  checkAuditLogWritable: mocks.checkAuditLogWritable,
}));

describe("system health duplicate-family diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      path: "C:/logs",
      message: "backend.audit.storage_ready",
      lastFailureAt: null,
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("@@hostname")) {
        return [
          [
            {
              serverHostname: "mysql01",
              databaseName: "labels",
              serverTimeMs: Date.now(),
            },
          ],
          [],
        ];
      }
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      if (sql.includes("HAVING COUNT(*) > 1")) {
        return [[{ name: "42022977", count: "2" }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    SystemHealthHandler();
  });

  it("always returns duplicateFamilies and marks duplicates unhealthy", async () => {
    const response = await mocks.ipcHandler!();
    const data = response.data as HealthResponseData;

    expect(data.database.duplicateFamilies).toEqual([
      { name: "42022977", count: 2 },
    ]);
    expect(data.database.status).toBe(false);
    expect(data.overallStatus).not.toBe("healthy");
  });

  it("returns an empty duplicate list if the database check fails", async () => {
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await mocks.ipcHandler!();
    const data = response.data as HealthResponseData;

    expect(data.database.duplicateFamilies).toEqual([]);
    expect(data.database.status).toBe(false);
  });

  it("marks the system unhealthy when print history is not writable", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("@@hostname")) {
        return [
          [
            {
              serverHostname: "mysql01",
              databaseName: "labels",
              serverTimeMs: Date.now(),
            },
          ],
          [],
        ];
      }
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      if (sql.includes("HAVING COUNT(*) > 1")) return [[], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      path: "C:/logs",
      message: "backend.audit.storage_unavailable",
      lastFailureAt: new Date().toISOString(),
    });

    const response = await mocks.ipcHandler!();
    const data = response.data as HealthResponseData;

    expect(data.audit.status).toBe(false);
    expect(data.overallStatus).toBe("error");
  });
});
