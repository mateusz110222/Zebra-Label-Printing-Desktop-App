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
  getMysqlSslOptions: vi.fn(() => ({ rejectUnauthorized: true })),
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
  ) => Promise<{ status: boolean; message: string }>) => {
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
});
