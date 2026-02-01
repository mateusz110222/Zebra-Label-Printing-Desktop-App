import { ipcMain } from "electron";
import { Client } from "ldapts";

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
      const ldapUrl = "ldaps://global.borgwarner.net:3269";

      const client = new Client({
        url: ldapUrl,
        tlsOptions: { rejectUnauthorized: false },
        timeout: 5000,
      });

      try {
        await client.bind(login, password);

        const searchBase = "DC=global,DC=borgwarner,DC=net";

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
