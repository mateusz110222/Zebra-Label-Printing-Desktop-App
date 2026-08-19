import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIT_SESSION_TTL_MS,
  canViewAuditLogs,
  clearAuditSession,
  getAuditActor,
  setAuditSession
} from "../AuditSession";

describe("audit authorization session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T08:00:00.000Z"));
    clearAuditSession();
  });

  afterEach(() => {
    clearAuditSession();
    vi.useRealTimers();
  });

  it("uses a fixed 30 minute TTL without extending it during checks", () => {
    expect(AUDIT_SESSION_TTL_MS).toBe(30 * 60 * 1000);
    setAuditSession("IT User", true);

    vi.advanceTimersByTime(AUDIT_SESSION_TTL_MS / 2);
    expect(canViewAuditLogs()).toBe(true);
    expect(getAuditActor()).toBe("IT User");

    vi.advanceTimersByTime(AUDIT_SESSION_TTL_MS / 2);
    expect(canViewAuditLogs()).toBe(false);
    expect(getAuditActor()).not.toBe("IT User");
  });

  it("expires an ordinary authenticated actor as well as IT permissions", () => {
    setAuditSession("Operator", false);
    expect(getAuditActor()).toBe("Operator");
    expect(canViewAuditLogs()).toBe(false);

    vi.advanceTimersByTime(AUDIT_SESSION_TTL_MS);
    expect(getAuditActor()).not.toBe("Operator");
    expect(canViewAuditLogs()).toBe(false);
  });
});
