import os from "node:os";

export const AUDIT_SESSION_TTL_MS = 30 * 60 * 1000;

interface UserSession {
  actor: string;
  canViewAudit: boolean;
  expiresAt: number;
}

let currentSession: UserSession | null = null;

const getActiveSession = (): UserSession | null => {
  if (currentSession && currentSession.expiresAt <= Date.now()) {
    currentSession = null;
  }

  return currentSession;
};

export const setAuditSession = (actor: string, canViewAudit: boolean): void => {
  currentSession = {
    actor,
    canViewAudit,
    expiresAt: Date.now() + AUDIT_SESSION_TTL_MS,
  };
};

export const clearAuditSession = (): void => {
  currentSession = null;
};

export const getAuditActor = (): string =>
  getActiveSession()?.actor || os.userInfo().username || "anonymous";

export const canViewAuditLogs = (): boolean =>
  getActiveSession()?.canViewAudit === true;
