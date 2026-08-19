import { app, ipcMain } from "electron";
import { constants } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client, type ClientOptions } from "ldapts";
import { appendAuditLog, clearAuditSession, getAuditActor, setAuditSession } from "./AuditLog";
import {
  buildBindUser,
  buildUserSearchFilter,
  getLdapAttributeValues,
  isLdapUserAuthorized,
  isSecureLdapUrl,
  parseBoolean,
  parsePositiveTimeout,
  redactSecret
} from "./LdapAuth";
import { t } from "i18next";

interface LoginRequest {
  login?: unknown;
  password?: unknown;
}

interface LoginResponse {
  status: boolean;
  message: string;
  data?: {
    FullName: string;
    department: string;
    title: string;
    canEdit: boolean;
  };
  rawError?: string;
}

const resolveCaCertificatePath = (certificatePath: string): string => {
  if (path.isAbsolute(certificatePath)) return certificatePath;
  const basePath = app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : app.getAppPath() || process.cwd();
  return path.resolve(basePath, certificatePath);
};

const getClientOptions = async (ldapUrl: string): Promise<ClientOptions> => {
  const operationTimeout = parsePositiveTimeout(
    process.env.LDAP_TIMEOUT_MS,
    5000,
  );
  const connectTimeout = parsePositiveTimeout(
    process.env.LDAP_CONNECT_TIMEOUT_MS,
    5000,
  );
  // Keep this runtime-configurable and do not inherit the legacy build-time false default.
  const rejectUnauthorized = parseBoolean(
    process.env["LDAP_TLS_REJECT_UNAUTHORIZED"],
    true,
  );
  const allowLegacyServerCertificate = parseBoolean(
    process.env.LDAP_TLS_ALLOW_LEGACY_SERVER_CERT,
    false,
  );
  const configuredCaPath = process.env.LDAP_CA_CERT_PATH?.trim();
  const ca = configuredCaPath
    ? await readFile(resolveCaCertificatePath(configuredCaPath), "utf8")
    : undefined;

  return {
    url: ldapUrl,
    timeout: operationTimeout,
    connectTimeout,
    tlsOptions: {
      rejectUnauthorized,
      ...(ca ? { ca } : {}),
      ...(allowLegacyServerCertificate
        ? { secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT }
        : {}),
    },
  };
};

const getFirstAttribute = (value: unknown): string =>
  getLdapAttributeValues(value)[0]?.trim() || "";

const getAuthenticationErrorMessage = (errorMessage: string): string => {
  const message = errorMessage.toLowerCase();

  if (
    message.includes("invalidcredentials") ||
    /\bdata\s+(?:52e|525)\b/.test(message)
  ) {
    return "backend.auth.AUTH_INVALID_CREDENTIALS";
  }

  const activeDirectoryErrorMessages: Record<string, string> = {
    "530": "backend.auth.AUTH_LOGON_TIME_RESTRICTED",
    "531": "backend.auth.AUTH_WORKSTATION_RESTRICTED",
    "532": "backend.auth.AUTH_PASSWORD_EXPIRED",
    "533": "backend.auth.AUTH_ACCOUNT_DISABLED",
    "701": "backend.auth.AUTH_ACCOUNT_EXPIRED",
    "773": "backend.auth.AUTH_PASSWORD_CHANGE_REQUIRED",
    "775": "backend.auth.AUTH_ACCOUNT_LOCKED",
  };
  const adError = Object.entries(activeDirectoryErrorMessages).find(([code]) =>
    new RegExp(`\\bdata\\s+${code}\\b`).test(message),
  );
  if (adError) return adError[1];

  if (
    message.includes("hostname/ip does not match certificate") ||
    message.includes("certificate has expired") ||
    message.includes("unable to verify the first certificate") ||
    message.includes("self-signed certificate")
  ) {
    return "backend.auth.AUTH_TLS_CERTIFICATE";
  }

  if (message.includes("etimedout") || /timed?\s*out|timeout/i.test(message)) {
    return "backend.auth.AUTH_TIMEOUT";
  }

  return "backend.auth.AUTH_ERROR";
};

const safeUnbind = async (client: Client | null): Promise<void> => {
  if (!client) return;
  try {
    await client.unbind();
  } catch {
    // The connection may already be closed after an LDAP or TLS error.
  }
};

export default function HandleLogin(): void {
  ipcMain.handle(
    "handle-login",
    async (_event, request?: LoginRequest): Promise<LoginResponse> => {
      clearAuditSession();
      const login =
        typeof request?.login === "string" ? request.login.trim() : "";
      const password =
        typeof request?.password === "string" ? request.password : "";
      const ldapUrl = process.env.LDAP_URL?.trim();
      const loginDomain =
        process.env.LDAP_LOGIN_DOMAIN?.trim() ||
        process.env.LDAP_DOMAIN?.trim();
      const searchBase = process.env.LDAP_SEARCH_BASE?.trim();

      if (!login || !password) {
        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "failure",
          actor: login || "anonymous",
          details: { reason: t("backend.auth.AUTH_INVALID_CREDENTIALS") },
        });
        return {
          status: false,
          message: "backend.auth.AUTH_INVALID_CREDENTIALS",
        };
      }

      if (!ldapUrl || !searchBase) {
        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "failure",
          actor: login?.trim() || "anonymous",
          details: { reason: "AUTH_CONFIG_MISSING" },
        });
        return {
          status: false,
          message: "backend.auth.AUTH_CONFIG_MISSING",
        };
      }

      if (!isSecureLdapUrl(ldapUrl)) {
        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "failure",
          actor: login || "anonymous",
          details: { reason: "backend.auth.AUTH_LDAPS_REQUIRED" },
        });
        return {
          status: false,
          message: "backend.auth.AUTH_LDAPS_REQUIRED",
        };
      }

      let client: Client | null = null;

      try {
        const normalizedLogin = login.trim().toLowerCase();
        const bindUser = buildBindUser(normalizedLogin, loginDomain);
        const clientOptions = await getClientOptions(ldapUrl);
        client = new Client(clientOptions);

        await client.bind(bindUser, password);

        const { searchEntries } = await client.search(searchBase, {
          scope: "sub",
          filter: buildUserSearchFilter(normalizedLogin),
          attributes: [
            "displayName",
            "mail",
            "title",
            "department",
            "cn",
            "givenName",
            "sn",
            "memberOf",
          ],
        });

        const userData = searchEntries[0] || {};

        const fullName =
          getFirstAttribute(userData.displayName) ||
          getFirstAttribute(userData.cn) ||
          normalizedLogin;
        const department = getFirstAttribute(userData.department);
        const title = getFirstAttribute(userData.title);
        const canEdit = isLdapUserAuthorized(department, userData.memberOf, {
          departments: process.env.LDAP_IT_DEPARTMENTS,
          groupDn: process.env.LDAP_IT_GROUP_DN,
        });
        const loginAuditPersisted = await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "success",
          actor: fullName,
          details: { login: normalizedLogin, department, title },
        });
        if (!loginAuditPersisted) {
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }
        setAuditSession(fullName, canEdit);

        return {
          status: true,
          message: "backend.auth.AUTH_SUCCESS",
          data: {
            FullName: fullName,
            department,
            title,
            canEdit,
          },
        };
      } catch (error) {
        const unsafeErrorMsg =
          error instanceof Error ? error.message : "backend.auth.AUTH_UNKNOWN";
        const errorMsg = redactSecret(unsafeErrorMsg, password);
        const userMessage = getAuthenticationErrorMessage(errorMsg);

        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "failure",
          actor: login?.trim() || "anonymous",
          details: { reason: userMessage },
        });

        return {
          status: false,
          message: userMessage,
          rawError: errorMsg,
        };
      } finally {
        await safeUnbind(client);
      }
    },
  );

  ipcMain.handle("handle-logout", async () => {
    const actor = getAuditActor();
    clearAuditSession();
    await appendAuditLog({
      category: "auth",
      action: "LOGOUT",
      status: "success",
      actor,
    });
  });
}
