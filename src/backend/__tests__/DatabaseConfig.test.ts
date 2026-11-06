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

  it("verifies the server certificate and identity in TLS modes", () => {
    for (const mode of ["default", "required"] as const) {
      expect(getMysqlSslOptions(mode)).toMatchObject({
        rejectUnauthorized: true,
        verifyIdentity: true,
      });
    }
  });

  it("falls back only when the server does not support TLS in automatic mode", async () => {
    const error = Object.assign(new Error("TLS unsupported"), {
      code: "HANDSHAKE_NO_SSL_SUPPORT",
    });
    const connect = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("legacy server");
    await expect(connectWithTlsFallback("default", connect)).resolves.toBe(
      "legacy server",
    );
    expect(connect).toHaveBeenNthCalledWith(2, undefined);

    connect.mockReset().mockRejectedValue(error);
    await expect(connectWithTlsFallback("required", connect)).rejects.toBe(
      error,
    );
    expect(connect).toHaveBeenCalledOnce();
  });

  it("retries the reported self-signed chain error in automatic mode", async () => {
    const error = Object.assign(
      new Error("self signed certificate in certificate chain"),
      { code: "HANDSHAKE_SSL_ERROR" },
    );
    const connect = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("TLS");

    await expect(connectWithTlsFallback("default", connect)).resolves.toBe("TLS");
    expect(connect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rejectUnauthorized: true, verifyIdentity: true }),
    );
    expect(connect).toHaveBeenNthCalledWith(2, {
      rejectUnauthorized: false,
      verifyIdentity: false,
    });

    connect.mockReset().mockRejectedValue(error);
    await expect(connectWithTlsFallback("required", connect)).rejects.toBe(error);
    expect(connect).toHaveBeenCalledOnce();
  });

  it("shares the TLS connection attempt and never downgrades after a certificate failure", async () => {
    mocks.get.mockReturnValue({
      host: "db",
      user: "usr",
      password: "pwd",
      database: "labels",
    });
    const failedPool = {
      getConnection: vi.fn().mockRejectedValue(new Error("CERT_HAS_EXPIRED")),
      end: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createPool.mockReturnValue(failedPool);
    const results = await Promise.allSettled([getDatabase(), getDatabase()]);
    expect(results.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(failedPool.end).toHaveBeenCalledOnce();
    expect(mocks.createPool).toHaveBeenCalledOnce();
  });
});
