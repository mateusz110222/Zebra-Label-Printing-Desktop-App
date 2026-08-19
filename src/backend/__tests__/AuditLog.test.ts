import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AuditLogEntry, readAuditLogs } from "../AuditLog";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:/app-data"),
    getVersion: vi.fn(() => "1.1.4"),
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  open: vi.fn(),
  readdir: mocks.readdir,
  readFile: mocks.readFile,
  unlink: vi.fn(),
}));

const entry = (action: string, timestamp: string): AuditLogEntry => ({
  id: action,
  timestamp,
  category: "print",
  action,
  status: action.includes("FAILED") ? "failure" : "success",
  actor: "operator",
  workstation: "station-1",
  appVersion: "1.1.4",
  details: {},
});

describe("print history visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readdir.mockResolvedValue(["print-2026-08-18.jsonl"]);
    mocks.readFile.mockResolvedValue(
      [
        entry("LABEL_DATA_PREPARED", "2026-08-18T08:00:00.000Z"),
        entry("LABEL_DATA_SENT", "2026-08-18T08:00:01.000Z"),
        entry("TEST_LABEL_DATA_PREPARED", "2026-08-18T08:00:02.000Z"),
        entry("LABEL_SEND_FAILED", "2026-08-18T08:00:03.000Z"),
      ]
        .map((auditEntry) => JSON.stringify(auditEntry))
        .join("\n"),
    );
  });

  it("hides preparation records while retaining final delivery outcomes", async () => {
    const result = await readAuditLogs({ scope: "print" });

    expect(result.total).toBe(2);
    expect(result.entries.map(({ action }) => action)).toEqual([
      "LABEL_SEND_FAILED",
      "LABEL_DATA_SENT",
    ]);
  });
});
