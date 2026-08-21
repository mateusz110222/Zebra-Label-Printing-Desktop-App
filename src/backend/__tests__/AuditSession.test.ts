import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUDIT_SESSION_TTL_MS,
  canViewAuditLogs,
  clearAuditSession,
  getAuditActor,
  setAuditSession
} from "../audit/AuditSession";

const mocks = vi.hoisted(() => ({
  userInfo: vi.fn(),
}));

vi.mock("node:os", () => ({
  default: {
    userInfo: mocks.userInfo,
  },
}));

describe("AuditSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-08-18T08:00:00.000Z"),
    );

    mocks.userInfo.mockReset();

    mocks.userInfo.mockReturnValue({
      username: "COATING",
      uid: 1000,
      gid: 1000,
      shell: null,
      homedir: "C:/Users/COATING",
    });

    clearAuditSession();
  });

  afterEach(() => {
    clearAuditSession();

    vi.useRealTimers();
  });

  describe("AUDIT_SESSION_TTL_MS", () => {
    it("uses a fixed 30 minute session TTL", () => {
      expect(
        AUDIT_SESSION_TTL_MS,
      ).toBe(
        30 * 60 * 1000,
      );

      expect(
        AUDIT_SESSION_TTL_MS,
      ).toBe(1_800_000);
    });
  });

  describe("setAuditSession", () => {
    it("stores the authenticated actor", () => {
      setAuditSession(
        "IT User",
        true,
      );

      expect(
        getAuditActor(),
      ).toBe("IT User");
    });

    it("grants audit access when canViewAudit is true", () => {
      setAuditSession(
        "IT User",
        true,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);
    });

    it("does not grant audit access when canViewAudit is false", () => {
      setAuditSession(
        "Operator",
        false,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      expect(
        getAuditActor(),
      ).toBe("Operator");
    });

    it("replaces the previous session", () => {
      setAuditSession(
        "First User",
        true,
      );

      expect(
        getAuditActor(),
      ).toBe("First User");

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      setAuditSession(
        "Second User",
        false,
      );

      expect(
        getAuditActor(),
      ).toBe("Second User");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("starts a new full TTL when session is replaced", () => {
      setAuditSession(
        "First User",
        true,
      );

      vi.advanceTimersByTime(
        20 * 60 * 1000,
      );

      setAuditSession(
        "Second User",
        true,
      );

      vi.advanceTimersByTime(
        20 * 60 * 1000,
      );

      expect(
        getAuditActor(),
      ).toBe("Second User");

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });
  });

  describe("session expiration", () => {
    it("uses a fixed 30 minute TTL without extending it during permission checks", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS / 2,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      expect(
        getAuditActor(),
      ).toBe("IT User");

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS / 2,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      expect(
        getAuditActor(),
      ).toBe("COATING");
    });

    it("does not extend TTL when getAuditActor is called", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        getAuditActor(),
      ).toBe("IT User");

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        getAuditActor(),
      ).toBe("IT User");

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("does not extend TTL when canViewAuditLogs is called", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      vi.advanceTimersByTime(
        10 * 60 * 1000,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("remains active immediately before the TTL boundary", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS - 1,
      );

      expect(
        getAuditActor(),
      ).toBe("IT User");

      expect(
        canViewAuditLogs(),
      ).toBe(true);
    });

    it("expires exactly at the TTL boundary", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("expires after the TTL boundary", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS + 1,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("expires an ordinary authenticated actor as well as IT permissions", () => {
      setAuditSession(
        "Operator",
        false,
      );

      expect(
        getAuditActor(),
      ).toBe("Operator");

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("removes the expired session permanently", () => {
      setAuditSession(
        "Expired User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      vi.advanceTimersByTime(
        60 * 60 * 1000,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });
  });

  describe("clearAuditSession", () => {
    it("removes an active IT session immediately", () => {
      setAuditSession(
        "IT User",
        true,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);

      clearAuditSession();

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      expect(
        getAuditActor(),
      ).toBe("COATING");
    });

    it("removes an ordinary authenticated actor immediately", () => {
      setAuditSession(
        "Operator",
        false,
      );

      expect(
        getAuditActor(),
      ).toBe("Operator");

      clearAuditSession();

      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("can be called repeatedly without throwing", () => {
      clearAuditSession();
      clearAuditSession();
      clearAuditSession();

      expect(
        canViewAuditLogs(),
      ).toBe(false);

      expect(
        getAuditActor(),
      ).toBe("COATING");
    });
  });

  describe("getAuditActor", () => {
    it("returns the authenticated actor while the session is active", () => {
      setAuditSession(
        "Jan Kowalski",
        false,
      );

      expect(
        getAuditActor(),
      ).toBe("Jan Kowalski");
    });

    it("returns the operating system username when there is no session", () => {
      expect(
        getAuditActor(),
      ).toBe("COATING");

      expect(
        mocks.userInfo,
      ).toHaveBeenCalledOnce();
    });

    it("returns the operating system username after session expiration", () => {
      setAuditSession(
        "Jan Kowalski",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS,
      );

      expect(
        getAuditActor(),
      ).toBe("COATING");
    });

    it("returns anonymous when operating system username is empty", () => {
      mocks.userInfo.mockReturnValue({
        username: "",
        uid: 1000,
        gid: 1000,
        shell: null,
        homedir: "C:/Users/COATING",
      });

      expect(
        getAuditActor(),
      ).toBe("anonymous");
    });

    it("does not query the operating system username while an active session exists", () => {
      setAuditSession(
        "Logged User",
        true,
      );

      expect(
        getAuditActor(),
      ).toBe("Logged User");

      expect(
        mocks.userInfo,
      ).not.toHaveBeenCalled();
    });
  });

  describe("canViewAuditLogs", () => {
    it("returns false when there is no session", () => {
      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("returns true only for an active session with audit permission", () => {
      setAuditSession(
        "IT User",
        true,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(true);
    });

    it("returns false for an active session without audit permission", () => {
      setAuditSession(
        "Operator",
        false,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });

    it("returns false once an IT session expires", () => {
      setAuditSession(
        "IT User",
        true,
      );

      vi.advanceTimersByTime(
        AUDIT_SESSION_TTL_MS,
      );

      expect(
        canViewAuditLogs(),
      ).toBe(false);
    });
  });
});
