import { escapeFilter } from "ldapts";

export interface LdapAuthorizationConfig {
  departments?: string;
  groupDn?: string;
}

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase("en-US");

export const parsePositiveTimeout = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value == null || value.trim() === "") return fallback;
  const normalized = normalize(value);
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export const isSecureLdapUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "ldaps:" && url.hostname.length > 0;
  } catch {
    return false;
  }
};

export const buildBindUser = (login: string, domain?: string): string => {
  const normalizedLogin = normalize(login);
  const normalizedDomain = domain?.trim();
  if (!normalizedDomain || normalizedLogin.includes("@")) {
    return normalizedLogin;
  }
  return `${normalizedLogin}@${normalizedDomain}`;
};

export const buildUserSearchFilter = (login: string): string => {
  const normalizedLogin = normalize(login);
  return escapeFilter`(|(userPrincipalName=${normalizedLogin})(sAMAccountName=${normalizedLogin})(mail=${normalizedLogin}))`;
};

export const getLdapAttributeValues = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => getLdapAttributeValues(item));
  }
  if (Buffer.isBuffer(value)) return [value.toString("utf8")];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
};

export const isLdapUserAuthorized = (
  department: string,
  memberOf: unknown,
  config: LdapAuthorizationConfig,
): boolean => {
  const allowedDepartments = (config.departments || "")
    .split(/[;,]/)
    .map(normalize)
    .filter(Boolean);
  const normalizedDepartment = normalize(department);
  const departmentAllowed =
    normalizedDepartment.length > 0 &&
    allowedDepartments.includes(normalizedDepartment);

  const configuredGroup = config.groupDn?.trim();
  const groupAllowed = Boolean(
    configuredGroup &&
    getLdapAttributeValues(memberOf)
      .map(normalize)
      .includes(normalize(configuredGroup)),
  );

  return departmentAllowed || groupAllowed;
};

export const redactSecret = (value: string, secret: string): string => {
  if (!secret) return value;
  return value.replaceAll(secret, "[REDACTED]");
};
