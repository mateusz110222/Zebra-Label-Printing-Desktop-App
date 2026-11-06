import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuditLogEntry } from "../audit/AuditLog";

let audit: typeof import("../audit/AuditLog");
let readAuditLogs: typeof audit.readAuditLogs;

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  databases: [] as DatabaseSync[],
  databasePath: ":memory:",
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:/app-data"),

    getVersion: vi.fn(() => "1.1.4"),
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,

    mkdir: mocks.mkdir,
    readdir: mocks.readdir,
    readFile: mocks.readFile,
  };
});

vi.mock("node:sqlite", async (importOriginal) => {
  const { DatabaseSync } = await importOriginal<typeof import("node:sqlite")>();
  return {
    DatabaseSync: class extends DatabaseSync {
      constructor() {
        super(mocks.databasePath);
        mocks.databases.push(this);
      }
    },
  };
});

const entry = (
  action: string,
  timestamp: string,
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry => ({
  id: `${action}:${timestamp}`,
  timestamp,
  category: "print",
  action,

  status: action.includes("FAILED") ? "failure" : "success",

  actor: "operator",
  workstation: "station-1",
  appVersion: "1.1.4",
  details: {},

  ...overrides,
});

const asJsonl = (entries: AuditLogEntry[]): string =>
  entries.map((auditEntry) => JSON.stringify(auditEntry)).join("\n");

describe("readAuditLogs", () => {
  beforeEach(async () => {
    for (const db of mocks.databases.splice(0)) db.close();
    vi.resetModules();
    vi.resetAllMocks();
    audit = await import("../audit/AuditLog");
    readAuditLogs = audit.readAuditLogs;

    mocks.mkdir.mockResolvedValue(undefined);

    mocks.readdir.mockResolvedValue(["print-2026-08-18.jsonl"]);

    mocks.readFile.mockResolvedValue(
      asJsonl([
        entry("TEST_LABEL_DATA_PREPARED", "2026-08-18T08:00:00.000Z"),

        entry("LABEL_DATA_SENT", "2026-08-18T08:00:01.000Z"),

        entry("TEST_LABEL_DATA_PREPARED", "2026-08-18T08:00:02.000Z"),

        entry("LABEL_SEND_FAILED", "2026-08-18T08:00:03.000Z"),
      ]),
    );
  });

  it("keeps the requested newest page and exact total when trimming a large result", async () => {
    const records = Array.from({ length: 2500 }, (_, index) =>
      entry(
        "PRINT",
        new Date(Date.UTC(2026, 7, 18, 0, 0, index)).toISOString(),
        { id: String(index) },
      ),
    );
    mocks.readFile.mockResolvedValueOnce(asJsonl(records));
    const result = await readAuditLogs({ page: 2, pageSize: 3 });
    expect(result.total).toBe(2500);
    expect(result.entries.map(({ id }) => id)).toEqual([
      "2496",
      "2495",
      "2494",
    ]);
  });

  describe("internal records", () => {
    it("hides preparation records while retaining final delivery outcomes", async () => {
      const result = await readAuditLogs({
        scope: "print",
      });

      expect(result.total).toBe(2);

      expect(result.entries.map(({ action }) => action)).toEqual([
        "LABEL_SEND_FAILED",
        "LABEL_DATA_SENT",
      ]);
    });

    it("hides legacy LABEL_DATA_PREPARED records", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([entry("LABEL_DATA_PREPARED", "2026-08-18T08:00:00.000Z")]),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(0);
      expect(result.entries).toEqual([]);
    });

    it("hides TEST_LABEL_DATA_PREPARED", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("TEST_LABEL_DATA_PREPARED", "2026-08-18T08:00:00.000Z"),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(0);
    });

    it("hides legacy LABEL_BATCH_REQUESTED records", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([entry("LABEL_BATCH_REQUESTED", "2026-08-18T08:00:00.000Z")]),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(0);
      expect(result.entries).toEqual([]);
    });

    it("does not hide final test-label delivery records", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("TEST_LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z"),

          entry("TEST_LABEL_SEND_FAILED", "2026-08-18T08:00:01.000Z"),
        ]),
      );

      const result = await readAuditLogs({
        scope: "print",
      });

      expect(result.entries.map(({ action }) => action)).toEqual([
        "TEST_LABEL_SEND_FAILED",
        "TEST_LABEL_DATA_SENT",
      ]);
    });
  });

  describe("file discovery", () => {
    it("creates the logs directory before reading files", async () => {
      await readAuditLogs();

      expect(mocks.mkdir).toHaveBeenCalledWith(
        expect.stringContaining("logs"),
        {
          recursive: true,
        },
      );
    });

    it("reads valid daily audit log files", async () => {
      mocks.readdir.mockResolvedValue(["print-2026-08-18.jsonl"]);

      await readAuditLogs();

      expect(mocks.readFile).toHaveBeenCalledWith(
        expect.stringContaining("print-2026-08-18.jsonl"),
        "utf8",
      );
    });

    it("supports legacy monthly audit log filenames", async () => {
      mocks.readdir.mockResolvedValue(["print-2026-08.jsonl"]);

      mocks.readFile.mockResolvedValue(
        asJsonl([entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z")]),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(1);

      expect(mocks.readFile).toHaveBeenCalledOnce();
    });

    it("ignores files with unsupported names", async () => {
      mocks.readdir.mockResolvedValue([
        "README.txt",
        "something.jsonl",
        "print.jsonl",
        "print-2026.jsonl",
        "print-2026-08-18.txt",
        "print-2026-08-18.jsonl.bak",
        "audit-2026-08-18.jsonl",
      ]);

      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LOGIN", "2026-08-18T08:00:00.000Z", {
            category: "auth",
          }),
        ]),
      );

      await readAuditLogs({
        scope: "audit",
      });

      expect(mocks.readFile).toHaveBeenCalledTimes(1);

      expect(mocks.readFile.mock.calls[0][0]).toEqual(
        expect.stringContaining("audit-2026-08-18.jsonl"),
      );
    });

    it("imports legacy files only once and writes new entries only to SQLite", async () => {
      const databasePath = path.join(
        os.tmpdir(),
        `audit-test-${randomUUID()}.sqlite`,
      );
      mocks.databasePath = databasePath;
      try {
        await readAuditLogs();
        await expect(
          audit.appendAuditLog({
            category: "print",
            action: "NEW_PRINT",
            status: "success",
          }),
        ).resolves.toBe(true);
        await expect(audit.checkAuditLogWritable()).resolves.toMatchObject({
          status: true,
        });

        const key = "monitoring:test";
        const since = "2026-01-01T00:00:00.000Z";
        const pending = await audit.readMonitoringBatch(key, since);
        expect(pending.events).toHaveLength(5);

        mocks.databases.pop()?.close();
        vi.resetModules();
        const reopened = await import("../audit/AuditLog");
        await expect(reopened.readMonitoringBatch(key, since)).resolves.toEqual(
          pending,
        );
        await reopened.acknowledgeMonitoringBatch(key, pending.through);
        await expect(reopened.readMonitoringBatch(key, since)).resolves.toEqual(
          {
            through: pending.through,
            events: [],
          },
        );
        await expect(
          reopened.readMonitoringBatch("monitoring:other", since),
        ).resolves.toEqual(pending);
        const result = await reopened.readAuditLogs();
        expect(result.total).toBe(3);
        expect(result.entries[0].action).toBe("NEW_PRINT");
        expect(mocks.readFile).toHaveBeenCalledOnce();
      } finally {
        mocks.databases.pop()?.close();
        mocks.databasePath = ":memory:";
        unlinkSync(databasePath);
      }
    });
  });

  describe("scope filtering", () => {
    beforeEach(() => {
      mocks.readdir.mockResolvedValue([
        "print-2026-08-18.jsonl",
        "audit-2026-08-18.jsonl",
      ]);

      mocks.readFile.mockImplementation(async (filePath: unknown) => {
        const path = String(filePath);

        if (path.includes("print-2026-08-18")) {
          return asJsonl([
            entry("LABEL_DATA_SENT", "2026-08-18T09:00:00.000Z", {
              category: "print",
            }),
          ]);
        }

        return asJsonl([
          entry("LOGIN", "2026-08-18T08:00:00.000Z", {
            category: "auth",
          }),
        ]);
      });
    });

    it("returns both print and audit records for scope all", async () => {
      const result = await readAuditLogs({
        scope: "all",
      });

      expect(result.entries.map(({ action }) => action)).toEqual([
        "LABEL_DATA_SENT",
        "LOGIN",
      ]);
    });

    it("returns only print category records for print scope", async () => {
      const result = await readAuditLogs({
        scope: "print",
      });

      expect(result.entries.map(({ action }) => action)).toEqual([
        "LABEL_DATA_SENT",
      ]);
    });

    it("returns only non-print records for audit scope", async () => {
      const result = await readAuditLogs({
        scope: "audit",
      });

      expect(result.entries.map(({ action }) => action)).toEqual(["LOGIN"]);
    });
  });

  describe("category filtering", () => {
    beforeEach(() => {
      mocks.readdir.mockResolvedValue(["audit-2026-08-18.jsonl"]);

      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LOGIN", "2026-08-18T08:00:00.000Z", {
            category: "auth",
          }),

          entry("PRINTER_CONFIG_CHANGED", "2026-08-18T08:01:00.000Z", {
            category: "config",
          }),

          entry("TEMPLATE_DELETED", "2026-08-18T08:02:00.000Z", {
            category: "template",
          }),
        ]),
      );
    });

    it("filters by exact category", async () => {
      const result = await readAuditLogs({
        category: "config",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].action).toBe("PRINTER_CONFIG_CHANGED");
    });

    it("does not filter category when category is all", async () => {
      const result = await readAuditLogs({
        category: "all",
      });

      expect(result.total).toBe(3);
    });
  });

  describe("status filtering", () => {
    beforeEach(() => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            status: "success",
          }),

          entry("LABEL_SEND_FAILED", "2026-08-18T08:01:00.000Z", {
            status: "failure",
          }),
        ]),
      );
    });

    it("returns only successful records", async () => {
      const result = await readAuditLogs({
        status: "success",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].action).toBe("LABEL_DATA_SENT");
    });

    it("returns only failed records", async () => {
      const result = await readAuditLogs({
        status: "failure",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].action).toBe("LABEL_SEND_FAILED");
    });

    it("does not filter by status when status is all", async () => {
      const result = await readAuditLogs({
        status: "all",
      });

      expect(result.total).toBe(2);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            actor: "Jan Kowalski",

            workstation: "LINE-PC-01",

            details: {
              partNumber: "42022977",

              serialNumber: "0200",

              printerTarget: "10.0.0.10:9100",
            },
          }),

          entry("LABEL_SEND_FAILED", "2026-08-18T08:01:00.000Z", {
            actor: "Anna Nowak",

            workstation: "LINE-PC-02",

            details: {
              partNumber: "42099999",
            },
          }),
        ]),
      );
    });

    it("searches by action", async () => {
      const result = await readAuditLogs({
        search: "label_data_sent",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].action).toBe("LABEL_DATA_SENT");
    });

    it("searches by actor case-insensitively", async () => {
      const result = await readAuditLogs({
        search: "JAN KOWALSKI",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].actor).toBe("Jan Kowalski");
    });

    it("searches by workstation", async () => {
      const result = await readAuditLogs({
        search: "line-pc-02",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].actor).toBe("Anna Nowak");
    });

    it("searches inside audit details", async () => {
      const result = await readAuditLogs({
        search: "42022977",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].details.partNumber).toBe("42022977");
    });

    it("searches numeric detail values after converting them to strings", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            details: {
              quantity: 123,
            },
          }),
        ]),
      );

      const result = await readAuditLogs({
        search: "123",
      });

      expect(result.total).toBe(1);
    });

    it("searches inside nested batch label details", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("BATCH_PRINT", "2026-08-18T08:00:00.000Z", {
            details: {
              partNumber: "42022977",
              labels: [
                {
                  serialNumber: "0200",
                  fullSerialNumber: "42022977A262250200",
                  deliveryState: "sent",
                },
                {
                  serialNumber: "0201",
                  fullSerialNumber: "42022977A262250201",
                  deliveryState: "failed",
                },
              ],
            },
          }),
        ]),
      );

      const result = await readAuditLogs({
        search: "42022977A262250201",
      });

      expect(result.total).toBe(1);
      expect(result.entries[0].action).toBe("BATCH_PRINT");
    });

    it("trims search text", async () => {
      const result = await readAuditLogs({
        search: "  jan kowalski  ",
      });

      expect(result.total).toBe(1);
    });

    it("does not filter when search is whitespace only", async () => {
      const result = await readAuditLogs({
        search: "   ",
      });

      expect(result.total).toBe(2);
    });
  });

  describe("date filtering", () => {
    beforeEach(() => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("EVENT_17", "2026-08-17T12:00:00.000Z"),

          entry("EVENT_18", "2026-08-18T12:00:00.000Z"),

          entry("EVENT_19", "2026-08-19T12:00:00.000Z"),
        ]),
      );
    });

    it("includes dateFrom boundary", async () => {
      const result = await readAuditLogs({
        dateFrom: "2026-08-18",
      });

      expect(result.entries.map(({ action }) => action)).toEqual([
        "EVENT_19",
        "EVENT_18",
      ]);
    });

    it("includes dateTo boundary", async () => {
      const result = await readAuditLogs({
        dateTo: "2026-08-18",
      });

      expect(result.entries.map(({ action }) => action)).toEqual([
        "EVENT_18",
        "EVENT_17",
      ]);
    });

    it("filters records between dateFrom and dateTo inclusively", async () => {
      const result = await readAuditLogs({
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0].action).toBe("EVENT_18");
    });
  });

  describe("sorting", () => {
    it("sorts entries by timestamp descending regardless of file order", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("OLDEST", "2026-08-18T08:00:00.000Z"),

          entry("NEWEST", "2026-08-18T10:00:00.000Z"),

          entry("MIDDLE", "2026-08-18T09:00:00.000Z"),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.entries.map(({ action }) => action)).toEqual([
        "NEWEST",
        "MIDDLE",
        "OLDEST",
      ]);
    });
  });

  describe("pagination", () => {
    beforeEach(() => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("EVENT_1", "2026-08-18T10:00:00.000Z"),

          entry("EVENT_2", "2026-08-18T09:00:00.000Z"),

          entry("EVENT_3", "2026-08-18T08:00:00.000Z"),

          entry("EVENT_4", "2026-08-18T07:00:00.000Z"),
        ]),
      );
    });

    it("uses default page 1 and pageSize 100", async () => {
      const result = await readAuditLogs();

      expect(result.page).toBe(1);

      expect(result.pageSize).toBe(100);

      expect(result.total).toBe(4);
    });

    it("returns requested page", async () => {
      const result = await readAuditLogs({
        page: 2,
        pageSize: 2,
      });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(2);

      expect(result.total).toBe(4);

      expect(result.entries.map(({ action }) => action)).toEqual([
        "EVENT_3",
        "EVENT_4",
      ]);
    });

    it("normalizes page values below 1 to page 1", async () => {
      const result = await readAuditLogs({
        page: -10,
        pageSize: 2,
      });

      expect(result.page).toBe(1);

      expect(result.entries.map(({ action }) => action)).toEqual([
        "EVENT_1",
        "EVENT_2",
      ]);
    });

    it("normalizes pageSize values below 1 to 1", async () => {
      const result = await readAuditLogs({
        pageSize: -10,
      });

      expect(result.pageSize).toBe(1);

      expect(result.entries).toHaveLength(1);
    });

    it("limits pageSize to 50000", async () => {
      const result = await readAuditLogs({
        pageSize: 100000,
      });

      expect(result.pageSize).toBe(50000);
    });

    it("returns an empty page when page is beyond available entries", async () => {
      const result = await readAuditLogs({
        page: 10,
        pageSize: 2,
      });

      expect(result.total).toBe(4);

      expect(result.entries).toEqual([]);
    });
  });

  describe("damaged log entries", () => {
    it("ignores malformed JSON lines without losing valid records", async () => {
      mocks.readFile.mockResolvedValue(
        [
          JSON.stringify(entry("VALID_1", "2026-08-18T08:00:00.000Z")),

          "{this is invalid json",

          JSON.stringify(entry("VALID_2", "2026-08-18T09:00:00.000Z")),
        ].join("\n"),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(2);

      expect(result.entries.map(({ action }) => action)).toEqual([
        "VALID_2",
        "VALID_1",
      ]);
    });

    it("ignores blank lines", async () => {
      mocks.readFile.mockResolvedValue(
        [
          "",
          JSON.stringify(entry("VALID", "2026-08-18T08:00:00.000Z")),
          "",
          "   ",
          "",
        ].join("\n"),
      );

      const result = await readAuditLogs();

      expect(result.total).toBe(1);
    });
  });

  describe("detail sanitization while reading", () => {
    it("removes password, secret and token fields", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LOGIN", "2026-08-18T08:00:00.000Z", {
            category: "auth",

            details: {
              login: "user",
              password: "very-secret",
              ldapSecret: "secret",
              accessToken: "token-value",
              normalField: "visible",
            },
          }),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.entries[0].details).toEqual({
        login: "user",
        normalField: "visible",
      });
    });

    it("removes internal batchId and labelId fields", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            details: {
              batchId: "batch-secret",
              labelId: "label-secret",
              serialNumber: "0200",
            },
          }),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.entries[0].details).toEqual({
        serialNumber: "0200",
      });
    });

    it("truncates string details to 2000 characters", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            details: {
              rawError: "X".repeat(3000),
            },
          }),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.entries[0].details.rawError).toBe("X".repeat(2000));
    });

    it("preserves nested object detail values", async () => {
      mocks.readFile.mockResolvedValue(
        JSON.stringify({
          ...entry("BATCH_PRINT", "2026-08-18T08:00:00.000Z"),

          details: {
            metadata: {
              serial: "0200",
              quantity: 1,
            },
          },
        }),
      );

      const result = await readAuditLogs();

      expect(result.entries[0].details.metadata).toEqual({
        serial: "0200",
        quantity: 1,
      });
    });

    it("preserves batch labels as an array and sanitizes nested sensitive fields", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("BATCH_PRINT", "2026-08-18T08:00:00.000Z", {
            details: {
              requestedQuantity: 2,
              labels: [
                {
                  batchPosition: 1,
                  serialNumber: "0200",
                  deliveryState: "sent",
                  accessToken: "must-not-survive",
                },
                {
                  batchPosition: 2,
                  serialNumber: "0201",
                  deliveryState: "failed",
                  nested: {
                    password: "must-not-survive",
                    printerError: "timeout",
                  },
                },
              ],
            },
          }),
        ]),
      );

      const result = await readAuditLogs();
      const labels = result.entries[0].details.labels;

      expect(Array.isArray(labels)).toBe(true);
      expect(labels).toEqual([
        {
          batchPosition: 1,
          serialNumber: "0200",
          deliveryState: "sent",
        },
        {
          batchPosition: 2,
          serialNumber: "0201",
          deliveryState: "failed",
          nested: {
            printerError: "timeout",
          },
        },
      ]);
    });

    it("preserves null, string, number and boolean detail values", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T08:00:00.000Z", {
            details: {
              stringValue: "text",
              numberValue: 123,
              booleanValue: true,
              nullValue: null,
            },
          }),
        ]),
      );

      const result = await readAuditLogs();

      expect(result.entries[0].details).toEqual({
        stringValue: "text",
        numberValue: 123,
        booleanValue: true,
        nullValue: null,
      });
    });
  });

  describe("combined filters", () => {
    it("applies scope, status, search and date filters together", async () => {
      mocks.readFile.mockResolvedValue(
        asJsonl([
          entry("LABEL_DATA_SENT", "2026-08-18T10:00:00.000Z", {
            status: "success",
            actor: "Jan Kowalski",

            details: {
              partNumber: "42022977",
            },
          }),

          entry("LABEL_SEND_FAILED", "2026-08-18T11:00:00.000Z", {
            status: "failure",
            actor: "Jan Kowalski",

            details: {
              partNumber: "42022977",
            },
          }),

          entry("LABEL_DATA_SENT", "2026-08-17T10:00:00.000Z", {
            status: "success",
            actor: "Jan Kowalski",

            details: {
              partNumber: "42022977",
            },
          }),

          entry("LABEL_DATA_SENT", "2026-08-18T12:00:00.000Z", {
            status: "success",
            actor: "Anna Nowak",

            details: {
              partNumber: "99999999",
            },
          }),
        ]),
      );

      const result = await readAuditLogs({
        scope: "print",
        status: "success",
        search: "42022977",
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
      });

      expect(result.total).toBe(1);

      expect(result.entries[0]).toMatchObject({
        action: "LABEL_DATA_SENT",
        actor: "Jan Kowalski",

        details: {
          partNumber: "42022977",
        },
      });
    });
  });
});
