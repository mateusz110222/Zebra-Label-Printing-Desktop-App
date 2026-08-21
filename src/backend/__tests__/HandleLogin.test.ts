import path from "node:path";
import { constants } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IpcMainInvokeEvent } from "electron";

import HandleLogin from "../auth/HandleLogin";

const mocks = vi.hoisted(() => {
  const client = {
    bind: vi.fn(),
    search: vi.fn(),
    unbind: vi.fn(),
  };

  return {
    handlers: new Map<
      string,
      (...args: unknown[]) => Promise<unknown>
    >(),

    appendAuditLog: vi.fn(),
    clearAuditSession: vi.fn(),
    setAuditSession: vi.fn(),
    getAuditActor: vi.fn(),

    isMainRendererAuthorized: vi.fn(),

    handle: vi.fn(),
    readFile: vi.fn(),

    client,

    Client: vi.fn(),

    translate: vi.fn((key: string) => key),

    app: {
      isPackaged: false,

      getAppPath: vi.fn(
        () => "C:/workspace/application",
      ),

      getPath: vi.fn((name: string) => {
        if (name === "exe") {
          return "C:/Program Files/Label App/Label App.exe";
        }

        if (name === "userData") {
          return "C:/Users/COATING/AppData/Roaming/Label App";
        }

        return "C:/workspace/application";
      }),

      getVersion: vi.fn(() => "1.2.1"),
    },
  };
});

vi.mock("electron", () => ({
  app: mocks.app,

  ipcMain: {
    handle: mocks.handle,
  },
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized:
  mocks.isMainRendererAuthorized,
}));

vi.mock(
  "node:fs/promises",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("node:fs/promises")
      >();

    return {
      ...actual,
      readFile: mocks.readFile,
    };
  },
);

vi.mock("../audit/AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  clearAuditSession:
  mocks.clearAuditSession,
  getAuditActor: mocks.getAuditActor,
  setAuditSession: mocks.setAuditSession,
}));

vi.mock(
  "ldapts",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("ldapts")
      >();

    return {
      ...actual,
      Client: mocks.Client,
    };
  },
);

vi.mock("i18next", () => ({
  t: mocks.translate,
}));

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

type LoginHandler = (
  event: IpcMainInvokeEvent,
  request?: LoginRequest,
) => Promise<LoginResponse>;

type LogoutHandler = (
  event?: IpcMainInvokeEvent,
) => Promise<void>;

const createEvent = (): IpcMainInvokeEvent =>
  ({}) as IpcMainInvokeEvent;

const getLoginHandler = (): LoginHandler => {
  const handler =
    mocks.handlers.get("handle-login");

  if (!handler) {
    throw new Error(
      "handle-login handler was not registered",
    );
  }

  return handler as LoginHandler;
};

const getLogoutHandler = (): LogoutHandler => {
  const handler =
    mocks.handlers.get("handle-logout");

  if (!handler) {
    throw new Error(
      "handle-logout handler was not registered",
    );
  }

  return handler as LogoutHandler;
};

describe("HandleLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    mocks.handlers.clear();

    mocks.handle.mockReset();
    mocks.handle.mockImplementation(
      (
        channel: string,
        handler: (
          ...args: unknown[]
        ) => Promise<unknown>,
      ) => {
        mocks.handlers.set(
          channel,
          handler,
        );
      },
    );

    mocks.app.isPackaged = false;

    mocks.app.getAppPath.mockReturnValue(
      "C:/workspace/application",
    );

    mocks.app.getPath.mockImplementation(
      (name: string) => {
        if (name === "exe") {
          return "C:/Program Files/Label App/Label App.exe";
        }

        if (name === "userData") {
          return "C:/Users/COATING/AppData/Roaming/Label App";
        }

        return "C:/workspace/application";
      },
    );

    mocks.isMainRendererAuthorized.mockReset();
    mocks.isMainRendererAuthorized.mockReturnValue(
      true,
    );

    mocks.appendAuditLog.mockReset();
    mocks.appendAuditLog.mockResolvedValue(
      true,
    );

    mocks.clearAuditSession.mockReset();
    mocks.setAuditSession.mockReset();

    mocks.getAuditActor.mockReset();
    mocks.getAuditActor.mockReturnValue(
      "Jan Kowalski",
    );

    mocks.translate.mockReset();
    mocks.translate.mockImplementation(
      (key: string) => key,
    );

    mocks.readFile.mockReset();
    mocks.readFile.mockResolvedValue(
      "TEST CA PEM",
    );

    mocks.client.bind.mockReset();
    mocks.client.bind.mockResolvedValue(
      undefined,
    );

    mocks.client.search.mockReset();
    mocks.client.search.mockResolvedValue({
      searchEntries: [
        {
          displayName: "Jan Kowalski",
          department: "QUALITY",
          title: "Operator",
          memberOf: [],
        },
      ],
      searchReferences: [],
    });

    mocks.client.unbind.mockReset();
    mocks.client.unbind.mockResolvedValue(
      undefined,
    );

    mocks.Client.mockReset();
    mocks.Client.mockImplementation(
      function MockClient() {
        return mocks.client;
      },
    );

    vi.stubEnv(
      "LDAP_URL",
      "ldaps://ldap.example.com:636",
    );

    vi.stubEnv(
      "LDAP_LOGIN_DOMAIN",
      "example.com",
    );

    vi.stubEnv(
      "LDAP_SEARCH_BASE",
      "DC=example,DC=com",
    );

    HandleLogin();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("IPC authorization", () => {
    it("rejects an unauthorized renderer before clearing the audit session", async () => {
      mocks.isMainRendererAuthorized.mockReturnValue(
        false,
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,
        message:
          "backend.audit.unauthorized",
      });

      expect(
        mocks.clearAuditSession,
      ).not.toHaveBeenCalled();

      expect(
        mocks.Client,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).not.toHaveBeenCalled();
    });

    it("clears any previous audit session before a new authorized login attempt", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.clearAuditSession,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.clearAuditSession.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.Client.mock
          .invocationCallOrder[0],
      );
    });
  });

  describe("request validation", () => {
    it.each([
      {
        name: "missing request",
        request: undefined,
      },
      {
        name: "missing login",
        request: {
          password: "safe-password",
        },
      },
      {
        name: "empty login",
        request: {
          login: "",
          password: "safe-password",
        },
      },
      {
        name: "whitespace login",
        request: {
          login: "   ",
          password: "safe-password",
        },
      },
      {
        name: "non-string login",
        request: {
          login: 123,
          password: "safe-password",
        },
      },
      {
        name: "missing password",
        request: {
          login: "user",
        },
      },
      {
        name: "empty password",
        request: {
          login: "user",
          password: "",
        },
      },
      {
        name: "non-string password",
        request: {
          login: "user",
          password: 123,
        },
      },
    ])(
      "rejects invalid credentials payload: $name",
      async ({ request }) => {
        const response =
          await getLoginHandler()(
            createEvent(),
            request,
          );

        expect(response).toEqual({
          status: false,
          message:
            "backend.auth.AUTH_INVALID_CREDENTIALS",
        });

        expect(
          mocks.Client,
        ).not.toHaveBeenCalled();

        expect(
          mocks.appendAuditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            category: "auth",
            action: "LOGIN",
            status: "failure",

            details: {
              reason:
                "backend.auth.AUTH_INVALID_CREDENTIALS",
            },
          }),
        );
      },
    );

    it("uses anonymous audit actor when login is missing", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "",
          password: "",
        },
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "anonymous",
        }),
      );
    });

    it("uses trimmed login as audit actor for invalid password", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "  USER  ",
          password: "",
        },
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "USER",
        }),
      );
    });
  });

  describe("LDAP configuration", () => {
    it("rejects missing LDAP URL", async () => {
      vi.stubEnv("LDAP_URL", "");

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,
        message:
          "backend.auth.AUTH_CONFIG_MISSING",
      });

      expect(
        mocks.Client,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failure",
          actor: "user",

          details: {
            reason:
              "AUTH_CONFIG_MISSING",
          },
        }),
      );
    });

    it("rejects missing LDAP search base", async () => {
      vi.stubEnv(
        "LDAP_SEARCH_BASE",
        "",
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,
        message:
          "backend.auth.AUTH_CONFIG_MISSING",
      });

      expect(
        mocks.Client,
      ).not.toHaveBeenCalled();
    });

    it("rejects a configured LDAP URL that does not use LDAPS", async () => {
      vi.stubEnv(
        "LDAP_URL",
        "ldap://ldap.example.com:389",
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,
        message:
          "backend.auth.AUTH_LDAPS_REQUIRED",
      });

      expect(
        mocks.Client,
      ).not.toHaveBeenCalled();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failure",

          details: {
            reason:
              "backend.auth.AUTH_LDAPS_REQUIRED",
          },
        }),
      );
    });
  });

  describe("LDAP client configuration", () => {
    it("uses verified TLS and default timeouts by default", async () => {
      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          url:
            "ldaps://ldap.example.com:636",

          timeout: 5000,

          connectTimeout: 5000,

          tlsOptions:
            expect.objectContaining({
              rejectUnauthorized: true,
            }),
        }),
      );
    });

    it("uses separate operation and connect timeouts", async () => {
      vi.stubEnv(
        "LDAP_TIMEOUT_MS",
        "7000",
      );

      vi.stubEnv(
        "LDAP_CONNECT_TIMEOUT_MS",
        "1200",
      );

      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 7000,
          connectTimeout: 1200,
        }),
      );
    });

    it("falls back to secure timeout defaults for invalid values", async () => {
      vi.stubEnv(
        "LDAP_TIMEOUT_MS",
        "invalid",
      );

      vi.stubEnv(
        "LDAP_CONNECT_TIMEOUT_MS",
        "0",
      );

      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
          connectTimeout: 5000,
        }),
      );
    });

    it("allows TLS certificate verification to be configured at runtime", async () => {
      vi.stubEnv(
        "LDAP_TLS_REJECT_UNAUTHORIZED",
        "false",
      );

      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tlsOptions:
            expect.objectContaining({
              rejectUnauthorized: false,
            }),
        }),
      );
    });

    it("does not enable legacy TLS server certificate mode by default", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      const clientOptions =
        mocks.Client.mock.calls[0][0];

      expect(
        clientOptions.tlsOptions
          .secureOptions,
      ).toBeUndefined();
    });

    it("loads a relative CA certificate in development", async () => {
      vi.stubEnv(
        "LDAP_CA_CERT_PATH",
        "certificates/company-ca.pem",
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        mocks.readFile,
      ).toHaveBeenCalledWith(
        path.resolve(
          "C:/workspace/application",
          "certificates/company-ca.pem",
        ),
        "utf8",
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tlsOptions:
            expect.objectContaining({
              rejectUnauthorized: true,
              ca: "TEST CA PEM",
            }),
        }),
      );
    });

    it("loads a relative CA certificate and enables only requested legacy TLS option", async () => {
      vi.stubEnv(
        "LDAP_CA_CERT_PATH",
        "certificates/company-ca.pem",
      );

      vi.stubEnv(
        "LDAP_TLS_ALLOW_LEGACY_SERVER_CERT",
        "true",
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        mocks.Client,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tlsOptions:
            expect.objectContaining({
              rejectUnauthorized: true,

              ca: "TEST CA PEM",

              secureOptions:
              constants
                .SSL_OP_LEGACY_SERVER_CONNECT,
            }),
        }),
      );
    });

    it("resolves a packaged relative CA certificate next to executable", async () => {
      mocks.app.isPackaged = true;

      vi.stubEnv(
        "LDAP_CA_CERT_PATH",
        "company-ca.pem",
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        mocks.readFile,
      ).toHaveBeenCalledWith(
        path.resolve(
          "C:/Program Files/Label App",
          "company-ca.pem",
        ),
        "utf8",
      );
    });

    it("does not read a CA file when LDAP_CA_CERT_PATH is not configured", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.readFile,
      ).not.toHaveBeenCalled();
    });
  });

  describe("LDAP bind and search", () => {
    it("normalizes login and builds UPN using LDAP_LOGIN_DOMAIN", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "  USER  ",
          password: "safe-password",
        },
      );

      expect(
        mocks.client.bind,
      ).toHaveBeenCalledWith(
        "user@example.com",
        "safe-password",
      );
    });

    it("uses LDAP_DOMAIN as fallback when LDAP_LOGIN_DOMAIN is missing", async () => {
      vi.stubEnv(
        "LDAP_LOGIN_DOMAIN",
        "",
      );

      vi.stubEnv(
        "LDAP_DOMAIN",
        "legacy.example.com",
      );

      await getLoginHandler()(
        createEvent(),
        {
          login: "User",
          password: "safe-password",
        },
      );

      expect(
        mocks.client.bind,
      ).toHaveBeenCalledWith(
        "user@legacy.example.com",
        "safe-password",
      );
    });

    it("does not append configured domain when login already contains a UPN", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login:
            "User@other.example.com",
          password: "safe-password",
        },
      );

      expect(
        mocks.client.bind,
      ).toHaveBeenCalledWith(
        "user@other.example.com",
        "safe-password",
      );
    });

    it("escapes user-controlled LDAP search filter input", async () => {
      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login:
              "User*)(|(cn=*))",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        mocks.client.bind,
      ).toHaveBeenCalledWith(
        "user*)(|(cn=*))@example.com",
        "safe-password",
      );

      const searchOptions =
        mocks.client.search.mock
          .calls[0][1];

      expect(
        searchOptions.filter,
      ).not.toContain("(cn=*)");

      expect(
        searchOptions.attributes,
      ).toContain("memberOf");
    });

    it("searches recursively below the configured LDAP base", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.client.search,
      ).toHaveBeenCalledWith(
        "DC=example,DC=com",

        expect.objectContaining({
          scope: "sub",

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
        }),
      );
    });
  });

  describe("successful authentication", () => {
    it("returns LDAP profile data and creates an audit session", async () => {
      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: true,

        message:
          "backend.auth.AUTH_SUCCESS",

        data: {
          FullName: "Jan Kowalski",
          department: "QUALITY",
          title: "Operator",
          canEdit: false,
        },
      });

      expect(
        mocks.setAuditSession,
      ).toHaveBeenCalledWith(
        "Jan Kowalski",
        false,
      );

      expect(
        mocks.client.unbind,
      ).toHaveBeenCalledOnce();
    });

    it("creates the audit session only after successful login audit persistence", async () => {
      await getLoginHandler()(
        createEvent(),
        {
          login: "user",
          password: "safe-password",
        },
      );

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith({
        category: "auth",
        action: "LOGIN",
        status: "success",
        actor: "Jan Kowalski",

        details: {
          login: "user",
          department: "QUALITY",
          title: "Operator",
        },
      });

      expect(
        mocks.appendAuditLog.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.setAuditSession.mock
          .invocationCallOrder[0],
      );
    });

    it("does not create an IT session when successful login cannot be audited", async () => {
      mocks.appendAuditLog.mockResolvedValueOnce(
        false,
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,

        message:
          "backend.audit.storage_unavailable",
      });

      expect(
        mocks.setAuditSession,
      ).not.toHaveBeenCalled();

      expect(
        mocks.clearAuditSession,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.client.unbind,
      ).toHaveBeenCalledOnce();
    });

    it("grants edit access through exact configured department", async () => {
      vi.stubEnv(
        "LDAP_IT_DEPARTMENTS",
        "IT; Information Technology",
      );

      mocks.client.search.mockResolvedValue({
        searchEntries: [
          {
            displayName:
              "Jan Kowalski",
            department: " it ",
            title:
              "Administrator",
            memberOf: [],
          },
        ],

        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        response.data?.canEdit,
      ).toBe(true);

      expect(
        mocks.setAuditSession,
      ).toHaveBeenCalledWith(
        "Jan Kowalski",
        true,
      );
    });

    it("grants edit access through exact configured LDAP group", async () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      vi.stubEnv(
        "LDAP_IT_GROUP_DN",
        groupDn,
      );

      mocks.client.search.mockResolvedValue({
        searchEntries: [
          {
            displayName:
              "Anna Nowak",

            department:
              "QUALITY",

            memberOf: [
              groupDn.toLowerCase(),
            ],
          },
        ],

        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "anna",
            password: "safe-password",
          },
        );

      expect(response.status).toBe(
        true,
      );

      expect(
        response.data?.canEdit,
      ).toBe(true);

      expect(
        mocks.setAuditSession,
      ).toHaveBeenCalledWith(
        "Anna Nowak",
        true,
      );
    });

    it("does not grant edit access for a partial department match", async () => {
      vi.stubEnv(
        "LDAP_IT_DEPARTMENTS",
        "IT",
      );

      mocks.client.search.mockResolvedValue({
        searchEntries: [
          {
            displayName:
              "Jan Kowalski",

            department:
              "IT SUPPORT",

            memberOf: [],
          },
        ],

        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(
        response.data?.canEdit,
      ).toBe(false);
    });

    it("uses cn when displayName is missing", async () => {
      mocks.client.search.mockResolvedValue({
        searchEntries: [
          {
            cn:
              "Kowalski Jan",

            department:
              "QUALITY",

            title:
              "Operator",

            memberOf: [],
          },
        ],

        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(
        response.data?.FullName,
      ).toBe("Kowalski Jan");

      expect(
        mocks.setAuditSession,
      ).toHaveBeenCalledWith(
        "Kowalski Jan",
        false,
      );
    });

    it("uses normalized login when displayName and cn are missing", async () => {
      mocks.client.search.mockResolvedValue({
        searchEntries: [
          {
            department: "QUALITY",
            memberOf: [],
          },
        ],
        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: " USER ",
            password: "safe-password",
          },
        );

      expect(
        response.data?.FullName,
      ).toBe("user");

      expect(
        response.data?.title,
      ).toBe("");

      expect(
        response.data?.department,
      ).toBe("QUALITY");
    });

    it("handles an empty LDAP search result", async () => {
      mocks.client.search.mockResolvedValue({
        searchEntries: [],
        searchReferences: [],
      });

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "User",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: true,

        message:
          "backend.auth.AUTH_SUCCESS",

        data: {
          FullName: "user",
          department: "",
          title: "",
          canEdit: false,
        },
      });
    });
  });

  describe("authentication errors", () => {
    it.each([
      [
        "InvalidCredentials",
        "backend.auth.AUTH_INVALID_CREDENTIALS",
      ],

      [
        "data 52e",
        "backend.auth.AUTH_INVALID_CREDENTIALS",
      ],

      [
        "data 525",
        "backend.auth.AUTH_INVALID_CREDENTIALS",
      ],

      [
        "data 775",
        "backend.auth.AUTH_ACCOUNT_LOCKED",
      ],

      [
        "data 533",
        "backend.auth.AUTH_ACCOUNT_DISABLED",
      ],

      [
        "data 532",
        "backend.auth.AUTH_PASSWORD_EXPIRED",
      ],

      [
        "data 773",
        "backend.auth.AUTH_PASSWORD_CHANGE_REQUIRED",
      ],

      [
        "data 701",
        "backend.auth.AUTH_ACCOUNT_EXPIRED",
      ],

      [
        "data 530",
        "backend.auth.AUTH_LOGON_TIME_RESTRICTED",
      ],

      [
        "data 531",
        "backend.auth.AUTH_WORKSTATION_RESTRICTED",
      ],

      [
        "Hostname/IP does not match certificate's altnames",
        "backend.auth.AUTH_TLS_CERTIFICATE",
      ],

      [
        "certificate has expired",
        "backend.auth.AUTH_TLS_CERTIFICATE",
      ],

      [
        "unable to verify the first certificate",
        "backend.auth.AUTH_TLS_CERTIFICATE",
      ],

      [
        "self-signed certificate",
        "backend.auth.AUTH_TLS_CERTIFICATE",
      ],

      [
        "ETIMEDOUT",
        "backend.auth.AUTH_TIMEOUT",
      ],

      [
        "connection timed out",
        "backend.auth.AUTH_TIMEOUT",
      ],

      [
        "connection timeout",
        "backend.auth.AUTH_TIMEOUT",
      ],
    ])(
      "maps LDAP error %s to %s",
      async (
        ldapError,
        expectedMessage,
      ) => {
        mocks.client.bind.mockRejectedValueOnce(
          new Error(
            `LdapErr: ${ldapError}`,
          ),
        );

        const response =
          await getLoginHandler()(
            createEvent(),
            {
              login: "user",
              password:
                "safe-password",
            },
          );

        expect(
          response.status,
        ).toBe(false);

        expect(
          response.message,
        ).toBe(expectedMessage);

        expect(
          response.rawError,
        ).toBeUndefined();

        expect(
          mocks.appendAuditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            category: "auth",
            action: "LOGIN",
            status: "failure",

            details: {
              reason:
              expectedMessage,
            },
          }),
        );

        expect(
          mocks.client.unbind,
        ).toHaveBeenCalledOnce();
      },
    );

    it("returns a sanitized rawError for an unknown LDAP error", async () => {
      mocks.client.bind.mockRejectedValueOnce(
        new Error(
          "LDAP server disconnected unexpectedly",
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,

        message:
          "backend.auth.AUTH_ERROR",

        rawError:
          "LDAP server disconnected unexpectedly",
      });

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          details: {
            reason:
              "backend.auth.AUTH_ERROR",
          },
        }),
      );
    });

    it("never persists or returns a password contained in a known LDAP error", async () => {
      const password =
        "S3cr3t!";

      mocks.client.bind.mockRejectedValueOnce(
        new Error(
          `InvalidCredentials: password=${password}`,
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password,
          },
        );

      expect(
        response.status,
      ).toBe(false);

      expect(
        response.message,
      ).toBe(
        "backend.auth.AUTH_INVALID_CREDENTIALS",
      );

      expect(
        response.rawError ?? "",
      ).not.toContain(password);

      expect(
        JSON.stringify(
          mocks.appendAuditLog.mock.calls,
        ),
      ).not.toContain(password);

      expect(
        mocks.client.unbind,
      ).toHaveBeenCalledOnce();
    });

    it("redacts password from rawError for an unknown authentication failure", async () => {
      const password =
        "SuperSecret123!";

      mocks.client.bind.mockRejectedValueOnce(
        new Error(
          `Unexpected LDAP failure while using password=${password}`,
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password,
          },
        );

      expect(
        response.message,
      ).toBe(
        "backend.auth.AUTH_ERROR",
      );

      expect(
        response.rawError,
      ).toContain(
        "[REDACTED]",
      );

      expect(
        response.rawError,
      ).not.toContain(password);

      expect(
        JSON.stringify(
          mocks.appendAuditLog.mock.calls,
        ),
      ).not.toContain(password);
    });

    it("maps an LDAP search failure using the same authentication error policy", async () => {
      mocks.client.search.mockRejectedValueOnce(
        new Error("ETIMEDOUT"),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,
        message:
          "backend.auth.AUTH_TIMEOUT",
        rawError: undefined,
      });

      expect(
        mocks.client.unbind,
      ).toHaveBeenCalledOnce();
    });

    it("returns AUTH_ERROR when reading the configured CA certificate fails", async () => {
      vi.stubEnv(
        "LDAP_CA_CERT_PATH",
        "missing-ca.pem",
      );

      mocks.readFile.mockRejectedValueOnce(
        new Error(
          "ENOENT: CA certificate not found",
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(response).toEqual({
        status: false,

        message:
          "backend.auth.AUTH_ERROR",

        rawError:
          "ENOENT: CA certificate not found",
      });

      expect(
        mocks.Client,
      ).not.toHaveBeenCalled();

      expect(
        mocks.client.unbind,
      ).not.toHaveBeenCalled();
    });

    it("ignores an unbind error after successful authentication", async () => {
      mocks.client.unbind.mockRejectedValueOnce(
        new Error(
          "connection already closed",
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "safe-password",
          },
        );

      expect(
        response.status,
      ).toBe(true);

      expect(
        response.message,
      ).toBe(
        "backend.auth.AUTH_SUCCESS",
      );
    });

    it("ignores an unbind error after failed authentication", async () => {
      mocks.client.bind.mockRejectedValueOnce(
        new Error(
          "InvalidCredentials",
        ),
      );

      mocks.client.unbind.mockRejectedValueOnce(
        new Error(
          "connection already closed",
        ),
      );

      const response =
        await getLoginHandler()(
          createEvent(),
          {
            login: "user",
            password: "bad-password",
          },
        );

      expect(
        response.status,
      ).toBe(false);

      expect(
        response.message,
      ).toBe(
        "backend.auth.AUTH_INVALID_CREDENTIALS",
      );
    });
  });

  describe("logout", () => {
    it("clears the audit session and records logout with the current actor", async () => {
      mocks.getAuditActor.mockReturnValue(
        "Jan Kowalski",
      );

      await getLogoutHandler()(
        createEvent(),
      );

      expect(
        mocks.getAuditActor,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.clearAuditSession,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.appendAuditLog,
      ).toHaveBeenCalledWith({
        category: "auth",
        action: "LOGOUT",
        status: "success",
        actor: "Jan Kowalski",
      });
    });

    it("captures the audit actor before clearing the session", async () => {
      await getLogoutHandler()(
        createEvent(),
      );

      expect(
        mocks.getAuditActor.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.clearAuditSession.mock
          .invocationCallOrder[0],
      );

      expect(
        mocks.clearAuditSession.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.appendAuditLog.mock
          .invocationCallOrder[0],
      );
    });
  });
});
