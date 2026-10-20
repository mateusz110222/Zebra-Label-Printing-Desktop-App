import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import SaveDatabaseConfig from "../config/SaveDatabaseConfig";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  isMainRendererAuthorized: vi.fn(() => true),
  canViewAuditLogs: vi.fn(() => true),
  checkAuditLogWritable: vi.fn(),
  appendAuditLog: vi.fn(),
  closeDatabase: vi.fn(),
  createConnection: vi.fn(),
  getMysqlSslOptions: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: mocks.handle,
  },
  app: {
    isPackaged: false,
    getAppPath: () => "C:/app",
    getPath: () => "C:/app/exe",
  },
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
    set: mocks.storeSet,
  },
}));

vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized: mocks.isMainRendererAuthorized,
}));

vi.mock("../audit/AuditLog", () => ({
  canViewAuditLogs: mocks.canViewAuditLogs,
  checkAuditLogWritable: mocks.checkAuditLogWritable,
  appendAuditLog: mocks.appendAuditLog,
}));

vi.mock("../config/DatabaseConfig", () => ({
  closeDatabase: mocks.closeDatabase,
  getMysqlSslOptions: mocks.getMysqlSslOptions,
  connectWithTlsFallback: async (mode, connect) =>
    connect(mocks.getMysqlSslOptions(mode)),
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: mocks.createConnection,
  },
}));

const createEvent = (): IpcMainInvokeEvent => ({}) as IpcMainInvokeEvent;

describe("SaveDatabaseConfig", () => {
  let mockConnection: {
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMainRendererAuthorized.mockReturnValue(true);
    mocks.canViewAuditLogs.mockReturnValue(true);
    mocks.getMysqlSslOptions.mockImplementation((mode) =>
      mode === "disabled" ? undefined : { rejectUnauthorized: true },
    );
    mockConnection = {
      query: vi.fn().mockResolvedValue([[{ 1: 1 }]]),
      end: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createConnection.mockResolvedValue(mockConnection);
    mocks.checkAuditLogWritable.mockResolvedValue({ status: true });
    mocks.appendAuditLog.mockResolvedValue(true);
    mocks.closeDatabase.mockResolvedValue(undefined);
    mocks.storeGet.mockReturnValue({
      host: "db.example.com",
      user: "dbuser",
      password: "secretpassword",
      database: "production_db",
    });

    SaveDatabaseConfig();
  });

  const getGetConfigHandler = (): (() => {
    status: boolean;
    data: Record<string, unknown>;
  }) => {
    const call = mocks.handle.mock.calls.find(
      ([channel]) => channel === "get-database-config",
    );
    if (!call) throw new Error("get-database-config handler not found");
    return call[1];
  };

  const getSaveConfigHandler = (): ((
    event: unknown,
    input: unknown,
  ) => Promise<{ status: boolean; message: string; rawError?: string }>) => {
    const call = mocks.handle.mock.calls.find(
      ([channel]) => channel === "save-database-config",
    );
    if (!call) throw new Error("save-database-config handler not found");
    return call[1];
  };

  it("never returns the plaintext password in get-database-config", () => {
    const result = getGetConfigHandler()();
    expect(result.status).toBe(true);
    expect(result.data.password).toBe("");
    expect(result.data.hasPassword).toBe(true);
    expect(result.data.host).toBe("db.example.com");
    expect(result.data.user).toBe("dbuser");
    expect(result.data.database).toBe("production_db");
  });

  it("saves database config and preserves existing password when input password is empty", async () => {
    const handler = getSaveConfigHandler();
    const result = await handler(createEvent(), {
      host: "new-db.example.com",
      user: "newuser",
      password: "",
      database: "new_db",
    });

    expect(result.status).toBe(true);
    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "new-db.example.com",
        user: "newuser",
        password: "secretpassword", // preserved from store
        database: "new_db",
      }),
    );
    expect(mocks.storeSet).toHaveBeenCalledWith("database", {
      host: "new-db.example.com",
      user: "newuser",
      password: "secretpassword",
      database: "new_db",
    });
  });

  it("rejects unauthorized caller on save-database-config", async () => {
    mocks.isMainRendererAuthorized.mockReturnValue(false);
    const handler = getSaveConfigHandler();
    const result = await handler(createEvent(), {
      host: "db.com",
      user: "usr",
      password: "pwd",
      database: "db",
    });

    expect(result.status).toBe(false);
    expect(result.message).toBe("backend.audit.unauthorized");
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it.each(["default", "required", "disabled"] as const)(
    "tests and persists the selected TLS mode %s",
    async (sslMode) => {
      const result = await getSaveConfigHandler()(createEvent(), {
        host: "db.com",
        user: "usr",
        password: "pwd",
        database: "db",
        sslMode,
      });
      expect(result.status).toBe(true);
      expect(mocks.getMysqlSslOptions).toHaveBeenCalledWith(sslMode);
      const options = mocks.createConnection.mock.calls[0][0];
      if (sslMode === "disabled") expect(options).not.toHaveProperty("ssl");
      else expect(options.ssl).toEqual({ rejectUnauthorized: true });
      expect(mocks.storeSet).toHaveBeenCalledWith(
        "database",
        expect.objectContaining({ sslMode }),
      );
    },
  );

  it("rejects invalid TLS modes before connecting", async () => {
    const result = await getSaveConfigHandler()(createEvent(), {
      host: "db.com",
      user: "usr",
      password: "pwd",
      database: "db",
      sslMode: "invalid",
    });
    expect(result.status).toBe(false);
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it.each([
    ["ER_ACCESS_DENIED_ERROR", "database_access_denied"],
    ["ER_DBACCESS_DENIED_ERROR", "database_permission_denied"],
    ["ER_BAD_DB_ERROR", "database_not_found"],
    ["ENOTFOUND", "database_host_not_found"],
    ["ECONNREFUSED", "database_connection_refused"],
    ["ETIMEDOUT", "database_connection_timeout"],
    ["EHOSTUNREACH", "database_host_unreachable"],
    ["ECONNRESET", "database_connection_lost"],
    ["HANDSHAKE_NO_SSL_SUPPORT", "database_tls_failed"],
    ["CERT_HAS_EXPIRED", "database_tls_failed"],
    ["ER_NOT_SUPPORTED_AUTH_MODE", "database_auth_unsupported"],
    ["ER_CON_COUNT_ERROR", "database_too_many_connections"],
    ["UNKNOWN_ERROR", "database_connection_failed"],
  ])(
    "explains %s and preserves the previous configuration",
    async (code, key) => {
      mocks.createConnection.mockRejectedValueOnce(
        Object.assign(new Error("Driver diagnostic"), { code }),
      );
      const result = await getSaveConfigHandler()(createEvent(), {
        host: "new-db.example.com",
        user: "newuser",
        password: "new-password",
        database: "new_db",
      });
      expect(result).toEqual({
        status: false,
        message: `backend.config.${key}`,
        rawError: `${code}: Driver diagnostic`,
      });
      expect(mocks.storeSet).toHaveBeenCalledWith("database", {
        host: "db.example.com",
        user: "dbuser",
        password: "secretpassword",
        database: "production_db",
      });
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failure",
          details: expect.objectContaining({ errorCode: code }),
        }),
      );
    },
  );

  it("redacts both new and previous passwords from driver diagnostics", async () => {
    mocks.createConnection.mockRejectedValueOnce(
      new Error("new-password secretpassword"),
    );
    const result = await getSaveConfigHandler()(createEvent(), {
      host: "db.com",
      user: "usr",
      password: "new-password",
      database: "db",
    });
    expect(result.rawError).toBe(
      "DATABASE_CONNECTION_FAILED: [REDACTED] [REDACTED]",
    );
  });

  it("returns query failures and closes the test connection", async () => {
    mockConnection.query.mockRejectedValueOnce(
      Object.assign(new Error("Access denied to database"), {
        code: "ER_DBACCESS_DENIED_ERROR",
      }),
    );
    const result = await getSaveConfigHandler()(createEvent(), {
      host: "db.com",
      user: "usr",
      password: "pwd",
      database: "db",
    });
    expect(result.message).toBe("backend.config.database_permission_denied");
    expect(mockConnection.end).toHaveBeenCalledOnce();
  });
});
