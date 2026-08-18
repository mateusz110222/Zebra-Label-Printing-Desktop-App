import { ipcMain } from "electron";
import { Client } from "ldapts";
import { appendAuditLog, clearAuditSession, getAuditActor, setAuditSession } from "./AuditLog";

interface LoginResponse {
  status: boolean;
  message: string;
  data?: {
    FullName: string;
    department: string;
    title: string;
  };
  rawError?: string;
}

export default function HandleLogin(): void {
  ipcMain.handle(
    "handle-login",
    async (_event, { login, password }): Promise<LoginResponse> => {
      const ldapUrl = process.env.LDAP_URL;
      const ldapDomain = process.env.LDAP_DOMAIN;
      const searchBase = process.env.LDAP_SEARCH_BASE;
      const timeout = Number(process.env.LDAP_TIMEOUT_MS || 5000);
      const rejectUnauthorized =
        process.env.LDAP_TLS_REJECT_UNAUTHORIZED === "true";

      if (!ldapUrl || !ldapDomain || !searchBase) {
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

      const client = new Client({
        url: ldapUrl,
        tlsOptions: { rejectUnauthorized },
        timeout,
      });

      try {
        const normalizedLogin = login.trim().toLowerCase();

        const bindUser = normalizedLogin.includes("@")
          ? normalizedLogin
          : `${normalizedLogin}@${ldapDomain}`;

        await client.bind(bindUser, password);

        const { searchEntries } = await client.search(searchBase, {
          scope: "sub",
          filter: `(|(userPrincipalName=${login})(sAMAccountName=${login})(mail=${login}))`,
          attributes: [
            "displayName",
            "mail",
            "title",
            "department",
            "cn",
            "givenName",
            "sn",
          ],
        });

        await client.unbind();
        const userData = searchEntries[0] || {};

        const fullName = userData.cn?.toString() || normalizedLogin;
        const department = userData.department?.toString() || "";
        const title = userData.title?.toString() || "";
        setAuditSession(fullName, department.includes("IT"));
        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "success",
          actor: fullName,
          details: { login: normalizedLogin, department, title },
        });

        return {
          status: true,
          message: "backend.auth.AUTH_SUCCESS",
          data: {
            FullName: fullName,
            department,
            title,
          },
        };
      } catch (error) {
        await client.unbind();

        let userMessage = "backend.auth.AUTH_ERROR";
        const errorMsg =
          error instanceof Error ? error.message : "backend.auth.AUTH_UNKNOWN";

        if (
          errorMsg.includes("InvalidCredentials") ||
          errorMsg.includes("data 52e")
        ) {
          userMessage = "backend.auth.AUTH_INVALID_CREDENTIALS";
        } else if (errorMsg.includes("ETIMEDOUT")) {
          userMessage = "backend.auth.AUTH_TIMEOUT";
        }

        await appendAuditLog({
          category: "auth",
          action: "LOGIN",
          status: "failure",
          actor: login?.trim() || "anonymous",
          details: { reason: userMessage, error: errorMsg },
        });

        return {
          status: false,
          message: userMessage,
          rawError: errorMsg,
        };
      }
    },
  );

  ipcMain.handle("handle-logout", async () => {
    const actor = getAuditActor();
    await appendAuditLog({
      category: "auth",
      action: "LOGOUT",
      status: "success",
      actor,
    });
    clearAuditSession();
  });
}
