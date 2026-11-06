import os from "node:os";

export const AUDIT_SESSION_TTL_MS = 30 * 60 * 1000;

interface UserSession {
  actor: string;
  canViewAudit: boolean;
  canConfigurePrinter: boolean;
  expiresAt: number;
}

let currentSession: UserSession | null = null;
let expirationTimer: ReturnType<typeof setTimeout> | undefined;
const expirationListeners = new Set<(expiresAt: number) => void>();
const sessionListeners = new Set<() => void>();

export const onAuditSessionChanged = (listener: () => void): void => {
  sessionListeners.add(listener);
};

const getActiveSession = (): UserSession | null => {
  if (currentSession && currentSession.expiresAt <= Date.now()) {
    const { expiresAt } = currentSession;
    clearAuditSession();
    for (const listener of expirationListeners) listener(expiresAt);
  }

  return currentSession;
};

const scheduleExpiration = (): void => {
  clearTimeout(expirationTimer);
  const session = getActiveSession();
  if (session) {
    expirationTimer = setTimeout(
      scheduleExpiration,
      Math.max(1, session.expiresAt - Date.now()),
    );
  }
};

export const onAuditSessionExpired = (
  listener: (expiresAt: number) => void,
): (() => void) => {
  expirationListeners.add(listener);
  return () => {
    expirationListeners.delete(listener);
  };
};

export const setAuditSession = (
  actor: string,
  canViewAudit: boolean,
  canConfigurePrinter = canViewAudit,
): number => {
  currentSession = {
    actor,
    canViewAudit,
    canConfigurePrinter,
    expiresAt: Date.now() + AUDIT_SESSION_TTL_MS,
  };
  const { expiresAt } = currentSession;
  scheduleExpiration();
  for (const listener of sessionListeners) listener();
  return expiresAt;
};

export const clearAuditSession = (): void => {
  const hadSession = currentSession !== null;
  currentSession = null;
  clearTimeout(expirationTimer);
  expirationTimer = undefined;
  if (hadSession) for (const listener of sessionListeners) listener();
};

export const hasActiveAuditSession = (): boolean => getActiveSession() !== null;

export const getAuditActor = (): string =>
  getActiveSession()?.actor || os.userInfo().username || "anonymous";

export const canViewAuditLogs = (): boolean =>
  getActiveSession()?.canViewAudit === true;

export const canConfigurePrinter = (): boolean =>
  getActiveSession()?.canConfigurePrinter === true;
