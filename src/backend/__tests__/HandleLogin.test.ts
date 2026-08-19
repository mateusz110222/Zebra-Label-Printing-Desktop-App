import path from "node:path";
import { constants } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HandleLogin from "../HandleLogin";

const mocks = vi.hoisted(() => {
  const client = {
    bind: vi.fn(),
    search: vi.fn(),
    unbind: vi.fn(),
  };
  return {
    appendAuditLog: vi.fn(),
    clearAuditSession: vi.fn(),
    setAuditSession: vi.fn(),
    getAuditActor: vi.fn(() => "actor"),
    handle: vi.fn(),
    readFile: vi.fn(),
    client,
    Client: vi.fn(function MockClient() {
      return client;
    }),
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => "C:/workspace/application"),
      getPath: vi.fn(() => "C:/Program Files/Label App/Label App.exe"),
    },
  };
});

vi.mock("electron", () => ({
  app: mocks.app,
  ipcMain: { handle: mocks.handle },
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("../AuditLog", () => ({
  appendAuditLog: mocks.appendAuditLog,
  clearAuditSession: mocks.clearAuditSession,
  getAuditActor: mocks.getAuditActor,
  setAuditSession: mocks.setAuditSession,
}));

vi.mock("ldapts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ldapts")>();
  return { ...actual, Client: mocks.Client };
});

const ENV_KEYS = [
  "LDAP_URL",
  "LDAP_LOGIN_DOMAIN",
  "LDAP_DOMAIN",
  "LDAP_SEARCH_BASE",
  "LDAP_TIMEOUT_MS",
  "LDAP_CONNECT_TIMEOUT_MS",
  "LDAP_TLS_REJECT_UNAUTHORIZED",
  "LDAP_TLS_ALLOW_LEGACY_SERVER_CERT",
  "LDAP_CA_CERT_PATH",
  "LDAP_IT_DEPARTMENTS",
  "LDAP_IT_GROUP_DN",
] as const;

type LoginHandler = (
  event: unknown,
  request: { login: string; password: string },
) => Promise<{
  status: boolean;
  message: string;
  rawError?: string;
  data?: { canEdit: boolean };
}>;

const getLoginHandler = (): LoginHandler => {
  const registration = mocks.handle.mock.calls.find(
    ([channel]) => channel === "handle-login",
  );
  if (!registration) throw new Error("handle-login was not registered");
  return registration[1] as LoginHandler;
};

describe("HandleLogin LDAP hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendAuditLog.mockResolvedValue(true);
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.LDAP_URL = "ldaps://ldap.example.com:636";
    process.env.LDAP_LOGIN_DOMAIN = "example.com";
    process.env.LDAP_SEARCH_BASE = "DC=example,DC=com";
    mocks.readFile.mockResolvedValue("TEST CA PEM");
    mocks.client.bind.mockResolvedValue(undefined);
    mocks.client.unbind.mockResolvedValue(undefined);
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
    mocks.app.isPackaged = false;
    HandleLogin();
  });

  it("rejects a configured LDAP URL that does not use LDAPS", async () => {
    process.env.LDAP_URL = "ldap://ldap.example.com:389";

    const response = await getLoginHandler()(undefined, {
      login: "user",
      password: "safe-password",
    });

    expect(response).toEqual({
      status: false,
      message: "backend.auth.AUTH_LDAPS_REQUIRED",
    });
    expect(mocks.Client).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        details: { reason: "backend.auth.AUTH_LDAPS_REQUIRED" },
      }),
    );
  });

  it("uses verified TLS by default and separate operation/connect timeouts", async () => {
    process.env.LDAP_TIMEOUT_MS = "7000";
    process.env.LDAP_CONNECT_TIMEOUT_MS = "1200";
    process.env.LDAP_IT_DEPARTMENTS = "IT";

    const response = await getLoginHandler()(undefined, {
      login: "User*)(|(cn=*))",
      password: "safe-password",
    });

    expect(response.status).toBe(true);
    expect(response.data?.canEdit).toBe(false);
    expect(mocks.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "ldaps://ldap.example.com:636",
        timeout: 7000,
        connectTimeout: 1200,
        tlsOptions: expect.objectContaining({ rejectUnauthorized: true }),
      }),
    );
    expect(mocks.client.bind).toHaveBeenCalledWith(
      "user*)(|(cn=*))@example.com",
      "safe-password",
    );
    const searchOptions = mocks.client.search.mock.calls[0][1];
    expect(searchOptions.filter).not.toContain("(cn=*)");
    expect(searchOptions.attributes).toContain("memberOf");
    expect(mocks.setAuditSession).toHaveBeenCalledWith("Jan Kowalski", false);
  });

  it("does not create an IT session when the successful login cannot be audited", async () => {
    mocks.appendAuditLog.mockResolvedValueOnce(false);

    const response = await getLoginHandler()(undefined, {
      login: "user",
      password: "safe-password",
    });

    expect(response).toMatchObject({
      status: false,
      message: "backend.audit.storage_unavailable",
    });
    expect(mocks.setAuditSession).not.toHaveBeenCalled();
    expect(mocks.clearAuditSession).toHaveBeenCalledOnce();
  });

  it("grants edit access through an exact configured LDAP group", async () => {
    const groupDn = "CN=Label IT,OU=Groups,DC=example,DC=com";
    process.env.LDAP_IT_GROUP_DN = groupDn;
    mocks.client.search.mockResolvedValue({
      searchEntries: [
        {
          displayName: "Anna Nowak",
          department: "QUALITY",
          memberOf: [groupDn.toLowerCase()],
        },
      ],
      searchReferences: [],
    });

    const response = await getLoginHandler()(undefined, {
      login: "anna",
      password: "safe-password",
    });

    expect(response.data?.canEdit).toBe(true);
    expect(mocks.setAuditSession).toHaveBeenCalledWith("Anna Nowak", true);
  });

  it("loads a relative CA certificate and enables only the requested legacy TLS option", async () => {
    process.env.LDAP_CA_CERT_PATH = "certificates/company-ca.pem";
    process.env.LDAP_TLS_ALLOW_LEGACY_SERVER_CERT = "true";

    await getLoginHandler()(undefined, {
      login: "user",
      password: "safe-password",
    });

    expect(mocks.readFile).toHaveBeenCalledWith(
      path.resolve("C:/workspace/application", "certificates/company-ca.pem"),
      "utf8",
    );
    expect(mocks.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        tlsOptions: expect.objectContaining({
          rejectUnauthorized: true,
          ca: "TEST CA PEM",
          secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
        }),
      }),
    );
  });

  it("resolves a packaged relative CA certificate next to the executable", async () => {
    mocks.app.isPackaged = true;
    process.env.LDAP_CA_CERT_PATH = "company-ca.pem";

    await getLoginHandler()(undefined, {
      login: "user",
      password: "safe-password",
    });

    expect(mocks.readFile).toHaveBeenCalledWith(
      path.resolve("C:/Program Files/Label App", "company-ca.pem"),
      "utf8",
    );
  });

  it("never persists or returns a password contained in an LDAP error", async () => {
    const password = "S3cr3t!";
    mocks.client.bind.mockRejectedValue(
      new Error(`InvalidCredentials: password=${password}`),
    );

    const response = await getLoginHandler()(undefined, {
      login: "user",
      password,
    });

    expect(response.status).toBe(false);
    expect(response.message).toBe("backend.auth.AUTH_INVALID_CREDENTIALS");
    expect(response.rawError).not.toContain(password);
    expect(JSON.stringify(mocks.appendAuditLog.mock.calls)).not.toContain(
      password,
    );
    expect(mocks.client.unbind).toHaveBeenCalledOnce();
  });

  it.each([
    ["data 775", "backend.auth.AUTH_ACCOUNT_LOCKED"],
    ["data 533", "backend.auth.AUTH_ACCOUNT_DISABLED"],
    ["data 532", "backend.auth.AUTH_PASSWORD_EXPIRED"],
    ["data 773", "backend.auth.AUTH_PASSWORD_CHANGE_REQUIRED"],
    ["data 701", "backend.auth.AUTH_ACCOUNT_EXPIRED"],
    ["data 530", "backend.auth.AUTH_LOGON_TIME_RESTRICTED"],
    ["data 531", "backend.auth.AUTH_WORKSTATION_RESTRICTED"],
    [
      "Hostname/IP does not match certificate's altnames",
      "backend.auth.AUTH_TLS_CERTIFICATE",
    ],
  ])("maps LDAP bind error %s", async (ldapError, expectedMessage) => {
    mocks.client.bind.mockRejectedValue(new Error(`LdapErr: ${ldapError}`));

    const response = await getLoginHandler()(undefined, {
      login: "user",
      password: "safe-password",
    });

    expect(response.message).toBe(expectedMessage);
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ details: { reason: expectedMessage } }),
    );
  });
});
