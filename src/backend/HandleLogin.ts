import {ipcMain} from "electron";
import {Client} from "ldapts";

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
        return {
          status: false,
          message: "backend.auth.AUTH_CONFIG_MISSING"
        };
      }

      const client = new Client({
        url: ldapUrl,
        tlsOptions: {rejectUnauthorized},
        timeout
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

        return {
          status: true,
          message: "backend.auth.AUTH_SUCCESS",
          data: {
            FullName: userData.cn.toString(),
            department: userData.department.toString(),
            title: userData.title.toString(),
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

        return {
          status: false,
          message: userMessage,
          rawError: errorMsg,
        };
      }
    },
  );
}
