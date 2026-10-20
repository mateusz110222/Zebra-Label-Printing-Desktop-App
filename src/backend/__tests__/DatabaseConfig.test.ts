import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  connectWithTlsFallback,
  decryptDatabasePassword,
  encryptDatabasePassword,
  getDatabase,
  getMysqlSslOptions,
} from "../config/DatabaseConfig";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  createPool: vi.fn(),
  isEncryptionAvailable: vi.fn(() => false),
  encryptString: vi.fn((val: string) => Buffer.from(`dpapi:${val}`, "utf8")),
  decryptString: vi.fn((buf: Buffer) =>
    buf.toString("utf8").replace(/^dpapi:/, ""),
  ),
}));
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => "C:/app" },
  safeStorage: {
    isEncryptionAvailable: mocks.isEncryptionAvailable,
    encryptString: mocks.encryptString,
    decryptString: mocks.decryptString,
  },
}));
vi.mock("node:fs", () => ({ default: { existsSync: () => false } }));
vi.mock("../utils/store", () => ({ store: { get: mocks.get } }));
vi.mock("mysql2/promise", () => ({
  default: { createPool: mocks.createPool },
}));

describe("database TLS mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEncryptionAvailable.mockReturnValue(false);
    vi.stubEnv("MYSQL_SSL", "true");
    mocks.createPool.mockReturnValue({
      end: vi.fn().mockResolvedValue(undefined),
      getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
    });
  });
  afterEach(async () => {
    await closeDatabase();
    vi.unstubAllEnvs();
  });
  it("keeps TLS enabled for existing configurations by default", () => {
    expect(getMysqlSslOptions()).toBeDefined();
  });
  it("tries TLS first in automatic mode even when the legacy environment disables it", () => {
    vi.stubEnv("MYSQL_SSL", "false");
    expect(getMysqlSslOptions("default")).toBeDefined();
    expect(getMysqlSslOptions("required")).toBeDefined();
  });
  it("explicitly disables TLS for a server without TLS support", () => {
    expect(getMysqlSslOptions("disabled")).toBeUndefined();
  });
  it.each(["default", "required", "disabled"] as const)(
    "uses persisted TLS mode %s for normal database connections",
    async (sslMode) => {
      mocks.get.mockReturnValue({
        host: "db",
        user: "usr",
        password: "pwd",
        database: "labels",
        sslMode,
      });
      await getDatabase();
      const options = mocks.createPool.mock.calls[0][0];
      if (sslMode === "disabled") expect(options).not.toHaveProperty("ssl");
      else expect(options.ssl).toBeDefined();
    },
  );

  it("encrypts and decrypts database password via safeStorage when available", () => {
    mocks.isEncryptionAvailable.mockReturnValue(true);
    const encrypted = encryptDatabasePassword("my-secret-db-pass");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("my-secret-db-pass");
    expect(decryptDatabasePassword(encrypted)).toBe("my-secret-db-pass");
    // Legacy plaintext passwords remain readable before migration
    expect(decryptDatabasePassword("legacy-plain")).toBe("legacy-plain");
  });

  it("does not retry when TLS succeeds", async () => {
    const connect = vi.fn().mockResolvedValue("connected");
    expect(await connectWithTlsFallback("default", connect)).toBe("connected");
    expect(connect).toHaveBeenCalledOnce();
    expect(connect.mock.calls[0][0]).toBeDefined();
  });

  it.each(["HANDSHAKE_NO_SSL_SUPPORT", "CERT_HAS_EXPIRED", "ECONNRESET"])(
    "retries without TLS after %s in automatic mode",
    async (code) => {
      const connect = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error(code), { code }))
        .mockResolvedValueOnce("connected without TLS");
      expect(await connectWithTlsFallback(undefined, connect)).toBe(
        "connected without TLS",
      );
      expect(connect).toHaveBeenCalledTimes(2);
      expect(connect.mock.calls[0][0]).toBeDefined();
      expect(connect.mock.calls[1][0]).toBeUndefined();
    },
  );

  it.each(["required", "disabled"] as const)(
    "does not retry a failed connection in %s mode",
    async (mode) => {
      const error = new Error("Connection failed");
      const connect = vi.fn().mockRejectedValue(error);
      await expect(connectWithTlsFallback(mode, connect)).rejects.toBe(error);
      expect(connect).toHaveBeenCalledOnce();
    },
  );

  it("returns the error from the unencrypted attempt when both attempts fail", async () => {
    const lastError = new Error("Access denied");
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("TLS failed"))
      .mockRejectedValueOnce(lastError);
    await expect(connectWithTlsFallback("default", connect)).rejects.toBe(
      lastError,
    );
  });

  it("closes the failed TLS pool and shares the fallback pool between concurrent callers", async () => {
    mocks.get.mockReturnValue({
      host: "db",
      user: "usr",
      password: "pwd",
      database: "labels",
    });
    const failedPool = {
      getConnection: vi.fn().mockRejectedValue(new Error("TLS not supported")),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const release = vi.fn();
    const fallbackPool = {
      getConnection: vi.fn().mockResolvedValue({ release }),
      end: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createPool
      .mockReturnValueOnce(failedPool)
      .mockReturnValueOnce(fallbackPool);
    const pools = await Promise.all([getDatabase(), getDatabase()]);
    expect(pools).toEqual([fallbackPool, fallbackPool]);
    expect(failedPool.end).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(mocks.createPool.mock.calls[0][0].ssl).toBeDefined();
    expect(mocks.createPool.mock.calls[1][0]).not.toHaveProperty("ssl");
    expect(await getDatabase()).toBe(fallbackPool);
    expect(mocks.createPool).toHaveBeenCalledTimes(2);
  });
});
