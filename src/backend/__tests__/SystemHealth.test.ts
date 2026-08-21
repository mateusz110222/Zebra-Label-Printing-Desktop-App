import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SystemHealthHandler from "../system/SystemHealth";

interface HealthResponseData {
  overallStatus: "healthy" | "warning" | "error";
  checkedAt: string;

  database: {
    status: boolean;
    reachable: boolean;
    configuredHost: string;
    configuredDatabase: string;
    serverHostname: string;
    databaseName: string;
    engine: string | null;
    engineOk: boolean;
    duplicateFamilies: Array<{
      name: string;
      count: number;
    }>;
    timeDriftMs: number | null;
    message: string[];
    rawError?: string;
  };

  printer: {
    status: boolean;
    reachable: boolean;
    ready: boolean;
    detailsAvailable: boolean;
    message: string;
    rawError?: string;
    type: string;
    target: string;
  };

  templates: {
    status: boolean;
    path: string;
    count: number;
    message: string;
    rawError?: string;
  };

  audit: {
    status: boolean;
    message: string;
    rawError?: string;
  };
}

interface HealthResponse {
  status: boolean;
  data: HealthResponseData;
}

const mocks = vi.hoisted(() => ({
  ipcHandler: undefined as
    | (() => Promise<HealthResponse>)
    | undefined,

  query: vi.fn(),

  queryPrinterStatus: vi.fn(),

  checkAuditLogWritable: vi.fn(),

  readdir: vi.fn(),

  storeGet: vi.fn(),

  getTemplatesPath: vi.fn(
    () => "C:/templates",
  ),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (
        channel: string,
        handler: () => Promise<HealthResponse>,
      ) => {
        if (channel === "get-system-health") {
          mocks.ipcHandler = handler;
        }
      },
    ),
  },
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
      readdir: mocks.readdir,
    };
  },
);

vi.mock("../config/DatabaseConfig", () => ({
  getDatabase: () => ({
    query: mocks.query,
  }),
}));

vi.mock("../printer/PrinterStatus", () => ({
  queryPrinterStatus:
  mocks.queryPrinterStatus,
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
  },
}));

vi.mock("../system/TemplatePaths", () => ({
  getTemplatesPath:
  mocks.getTemplatesPath,
}));

vi.mock("../audit/AuditLog", () => ({
  checkAuditLogWritable:
  mocks.checkAuditLogWritable,
}));

const getHandler = (): (() => Promise<HealthResponse>) => {
  if (!mocks.ipcHandler) {
    throw new Error(
      "get-system-health handler was not registered",
    );
  }

  return mocks.ipcHandler;
};

const setHealthyDatabase = (): void => {
  mocks.query.mockImplementation(
    async (sql: string) => {
      if (sql.includes("@@hostname")) {
        return [
          [
            {
              serverHostname: "mysql01",
              databaseName: "labels",
              serverTimeMs: Date.now(),
            },
          ],
          [],
        ];
      }

      if (
        sql.includes(
          "information_schema.TABLES",
        )
      ) {
        return [
          [
            {
              ENGINE: "InnoDB",
            },
          ],
          [],
        ];
      }

      if (
        sql.includes(
          "HAVING COUNT(*) > 1",
        )
      ) {
        return [[], []];
      }

      throw new Error(
        `Unexpected SQL: ${sql}`,
      );
    },
  );
};

describe("SystemHealthHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date(
        "2026-08-21T10:00:00.000Z",
      ),
    );

    vi.clearAllMocks();

    mocks.ipcHandler = undefined;

    mocks.getTemplatesPath.mockReturnValue(
      "C:/templates",
    );

    mocks.storeGet.mockImplementation(
      (key: string) => {
        if (key === "database") {
          return {
            host: "db",
            database: "labels",
          };
        }

        if (key === "printer") {
          return {
            type: "IP",
            ip: "10.0.0.10",
            port: 9100,
          };
        }

        return undefined;
      },
    );

    mocks.readdir.mockResolvedValue([
      "16x13.zpl",
      "Test_Print_label.zpl",
      "README.md",
    ]);

    mocks.queryPrinterStatus.mockResolvedValue({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: true,
      message: "backend.printer.ready",
    });

    mocks.checkAuditLogWritable.mockResolvedValue({
      status: true,
      path: "C:/logs",
      message:
        "backend.audit.storage_ready",
      lastFailureAt: null,
    });

    setHealthyDatabase();

    SystemHealthHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a healthy system when all checks succeed", async () => {
    const response = await getHandler()();

    expect(response.status).toBe(true);

    expect(
      response.data.overallStatus,
    ).toBe("healthy");

    expect(response.data.checkedAt).toBe(
      "2026-08-21T10:00:00.000Z",
    );

    expect(response.data.database).toMatchObject({
      status: true,
      reachable: true,
      configuredHost: "db",
      configuredDatabase: "labels",
      serverHostname: "mysql01",
      databaseName: "labels",
      engine: "InnoDB",
      engineOk: true,
      duplicateFamilies: [],
      timeDriftMs: 0,
      message: [
        "backend.health.database_ok",
      ],
    });

    expect(response.data.printer).toMatchObject({
      status: true,
      reachable: true,
      ready: true,
      type: "IP",
      target: "10.0.0.10:9100",
    });

    expect(response.data.templates).toEqual({
      status: true,
      path: "C:/templates",
      count: 2,
      message:
        "backend.health.templates_ok",
    });

    expect(response.data.audit.status).toBe(
      true,
    );
  });

  it("returns duplicateFamilies and marks duplicate family names unhealthy", async () => {
    mocks.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("@@hostname")) {
          return [
            [
              {
                serverHostname: "mysql01",
                databaseName: "labels",
                serverTimeMs: Date.now(),
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "information_schema.TABLES",
          )
        ) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "HAVING COUNT(*) > 1",
          )
        ) {
          return [
            [
              {
                name: "42022977",
                count: "2",
              },
              {
                name: "42022978",
                count: 3,
              },
            ],
            [],
          ];
        }

        throw new Error(
          `Unexpected SQL: ${sql}`,
        );
      },
    );

    const response = await getHandler()();

    expect(
      response.data.database.duplicateFamilies,
    ).toEqual([
      {
        name: "42022977",
        count: 2,
      },
      {
        name: "42022978",
        count: 3,
      },
    ]);

    expect(
      response.data.database.status,
    ).toBe(false);

    expect(
      response.data.database.message,
    ).toContain(
      "backend.health.database_duplicates",
    );

    expect(
      response.data.database.rawError,
    ).toContain(
      "Duplicate family names: 42022977 (2), 42022978 (3)",
    );

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("marks database unhealthy when family table does not use InnoDB", async () => {
    mocks.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("@@hostname")) {
          return [
            [
              {
                serverHostname: "mysql01",
                databaseName: "labels",
                serverTimeMs: Date.now(),
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "information_schema.TABLES",
          )
        ) {
          return [
            [
              {
                ENGINE: "MyISAM",
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "HAVING COUNT(*) > 1",
          )
        ) {
          return [[], []];
        }

        throw new Error(
          `Unexpected SQL: ${sql}`,
        );
      },
    );

    const response = await getHandler()();

    expect(
      response.data.database.status,
    ).toBe(false);

    expect(
      response.data.database.engine,
    ).toBe("MyISAM");

    expect(
      response.data.database.engineOk,
    ).toBe(false);

    expect(
      response.data.database.message,
    ).toContain(
      "backend.health.database_engine_invalid",
    );

    expect(
      response.data.database.rawError,
    ).toContain(
      'Invalid storage engine for table "family": MyISAM. Expected: InnoDB.',
    );

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("marks database unhealthy when database clock drift exceeds 30 seconds", async () => {
    mocks.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("@@hostname")) {
          return [
            [
              {
                serverHostname: "mysql01",
                databaseName: "labels",

                // 45 seconds behind
                serverTimeMs:
                  Date.now() - 45_000,
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "information_schema.TABLES",
          )
        ) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "HAVING COUNT(*) > 1",
          )
        ) {
          return [[], []];
        }

        throw new Error(
          `Unexpected SQL: ${sql}`,
        );
      },
    );

    const response = await getHandler()();

    expect(
      response.data.database.timeDriftMs,
    ).toBe(45_000);

    expect(
      response.data.database.status,
    ).toBe(false);

    expect(
      response.data.database.message,
    ).toContain(
      "backend.health.database_time_drift",
    );

    expect(
      response.data.database.rawError,
    ).toContain(
      "Database server time drift: 45 seconds.",
    );

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("marks database unhealthy when server time cannot be determined", async () => {
    mocks.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("@@hostname")) {
          return [
            [
              {
                serverHostname: "mysql01",
                databaseName: "labels",
                serverTimeMs: "invalid",
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "information_schema.TABLES",
          )
        ) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (
          sql.includes(
            "HAVING COUNT(*) > 1",
          )
        ) {
          return [[], []];
        }

        throw new Error(
          `Unexpected SQL: ${sql}`,
        );
      },
    );

    const response = await getHandler()();

    expect(
      response.data.database.timeDriftMs,
    ).toBeNull();

    expect(
      response.data.database.message,
    ).toContain(
      "backend.health.database_time_unavailable",
    );

    expect(
      response.data.database.rawError,
    ).toContain(
      "Unable to calculate database server time drift.",
    );

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("returns an empty duplicate list if database check fails", async () => {
    mocks.query.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await getHandler()();

    expect(
      response.data.database,
    ).toMatchObject({
      status: false,
      reachable: false,
      engine: null,
      engineOk: false,
      duplicateFamilies: [],
      timeDriftMs: null,
      message: [
        "backend.health.database_error",
      ],
      rawError: "database unavailable",
    });

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("marks the system unhealthy when print history is not writable", async () => {
    mocks.checkAuditLogWritable.mockResolvedValueOnce({
      status: false,
      path: "C:/logs",
      message:
        "backend.audit.storage_unavailable",
      lastFailureAt:
        "2026-08-21T09:59:00.000Z",
      rawError: "Access denied",
    });

    const response = await getHandler()();

    expect(
      response.data.audit.status,
    ).toBe(false);

    expect(
      response.data.audit.message,
    ).toBe(
      "backend.audit.storage_unavailable",
    );

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("marks the system unhealthy when templates cannot be read", async () => {
    mocks.readdir.mockRejectedValueOnce(
      new Error("EACCES: access denied"),
    );

    const response = await getHandler()();

    expect(
      response.data.templates,
    ).toEqual({
      status: false,
      path: "C:/templates",
      count: 0,
      message:
        "backend.health.templates_error",
      rawError: "EACCES: access denied",
    });

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("counts only ZPL and TXT template files", async () => {
    mocks.readdir.mockResolvedValue([
      "label1.zpl",
      "label2.ZPL",
      "label3.txt",
      "label4.TXT",
      "readme.md",
      "image.png",
      "notes.json",
    ]);

    const response = await getHandler()();

    expect(
      response.data.templates.count,
    ).toBe(4);

    expect(
      response.data.templates.status,
    ).toBe(true);
  });

  it("returns warning when printer is reachable but not ready", async () => {
    mocks.queryPrinterStatus.mockResolvedValueOnce({
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: true,
      message: "backend.printer.head_open",
    });

    const response = await getHandler()();

    expect(
      response.data.printer,
    ).toMatchObject({
      status: false,
      reachable: true,
      ready: false,
      message:
        "backend.printer.head_open",
    });

    expect(
      response.data.overallStatus,
    ).toBe("warning");
  });

  it("returns error when printer is unreachable", async () => {
    mocks.queryPrinterStatus.mockResolvedValueOnce({
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message:
        "backend.printer.unreachable",
      rawError: "ECONNREFUSED",
    });

    const response = await getHandler()();

    expect(
      response.data.printer.reachable,
    ).toBe(false);

    expect(
      response.data.overallStatus,
    ).toBe("error");

    expect(
      mocks.queryPrinterStatus,
    ).toHaveBeenCalledOnce();
  });

  it("retries printer status once after access denied", async () => {
    mocks.queryPrinterStatus
      .mockResolvedValueOnce({
        status: false,
        reachable: false,
        ready: false,
        detailsAvailable: false,
        message:
          "backend.printer.error",
        rawError:
          "EPERM: operation not permitted - Access denied",
      })
      .mockResolvedValueOnce({
        status: true,
        reachable: true,
        ready: true,
        detailsAvailable: true,
        message:
          "backend.printer.ready",
      });

    const responsePromise =
      getHandler()();

    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(
      1000,
    );

    const response =
      await responsePromise;

    expect(
      mocks.queryPrinterStatus,
    ).toHaveBeenCalledTimes(2);

    expect(
      response.data.printer.ready,
    ).toBe(true);

    expect(
      response.data.overallStatus,
    ).toBe("healthy");
  });

  it.each([
    "Access denied",
    "Access is denied",
    "EACCES",
    "EPERM",
    "Permission denied",
  ])(
    "retries printer check for permission error: %s",
    async (rawError) => {
      mocks.queryPrinterStatus
        .mockResolvedValueOnce({
          status: false,
          reachable: false,
          ready: false,
          detailsAvailable: false,
          message:
            "backend.printer.error",
          rawError,
        })
        .mockResolvedValueOnce({
          status: true,
          reachable: true,
          ready: true,
          detailsAvailable: true,
          message:
            "backend.printer.ready",
        });

      const responsePromise =
        getHandler()();

      await Promise.resolve();

      await vi.advanceTimersByTimeAsync(
        1000,
      );

      const response =
        await responsePromise;

      expect(
        mocks.queryPrinterStatus,
      ).toHaveBeenCalledTimes(2);

      expect(
        response.data.printer.ready,
      ).toBe(true);
    },
  );

  it("does not retry printer status for a non-permission error", async () => {
    mocks.queryPrinterStatus.mockResolvedValueOnce({
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message:
        "backend.printer.error",
      rawError: "ECONNREFUSED",
    });

    const response = await getHandler()();

    expect(
      mocks.queryPrinterStatus,
    ).toHaveBeenCalledOnce();

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it("converts a thrown printer status error into an unhealthy printer result", async () => {
    mocks.queryPrinterStatus.mockRejectedValueOnce(
      new Error("printer check crashed"),
    );

    const response = await getHandler()();

    expect(
      response.data.printer,
    ).toMatchObject({
      status: false,
      reachable: false,
      ready: false,
      detailsAvailable: false,
      message: "backend.printer.error",
      rawError: "printer check crashed",
    });

    expect(
      response.data.overallStatus,
    ).toBe("error");
  });

  it.each([
    [
      {
        type: "IP",
        ip: "10.0.0.10",
        port: 9100,
      },
      "10.0.0.10:9100",
    ],

    [
      {
        type: "COM",
        comPort: "COM7",
        baudRate: 115200,
      },
      "COM7@115200",
    ],

    [
      {
        type: "COM",
        comPort: "COM4",
      },
      "COM4@9600",
    ],

    [
      {
        type: "USB",
        usbPrinterName:
          "ZDesigner ZD421-203dpi ZPL",
      },
      "ZDesigner ZD421-203dpi ZPL",
    ],
  ])(
    "returns correct printer target for %j",
    async (printerConfig, expectedTarget) => {
      mocks.storeGet.mockImplementation(
        (key: string) => {
          if (key === "database") {
            return {
              host: "db",
              database: "labels",
            };
          }

          if (key === "printer") {
            return printerConfig;
          }

          return undefined;
        },
      );

      const response =
        await getHandler()();

      expect(
        response.data.printer.target,
      ).toBe(expectedTarget);
    },
  );
});
