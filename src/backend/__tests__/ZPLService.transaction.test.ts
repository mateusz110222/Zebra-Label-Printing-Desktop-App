import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrintZPL, generateReprintPreviewZPL, generateReprintZPL } from "../hooks/ZPLService";

const databaseMocks = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  return {
    connection,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(),
    },
  };
});

vi.mock("../DatabaseConfig", () => ({
  getDatabase: () => databaseMocks.pool,
}));

vi.mock("../TemplatePaths", () => ({
  getTemplatesPath: () => "C:/templates",
  normalizeTemplateFileName: (name: string) =>
    /\.(zpl|txt)$/i.test(name) ? name : `${name}.zpl`,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi
    .fn()
    .mockResolvedValue(
      "^XA^FD*SERIALPREFIX**JDATE**SERIALNUM1*^FS^PQ*NUMCOPIES*^XZ",
    ),
  writeFile: vi.fn(),
}));

const part = {
  Part_Number: "42022977",
  Part_Description: "LOWER AC",
  Serial_Prefix: "A",
  Label_Format: "16x13",
};

describe("generatePrintZPL serial transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.pool.getConnection.mockResolvedValue(
      databaseMocks.connection,
    );
    databaseMocks.connection.beginTransaction.mockResolvedValue(undefined);
    databaseMocks.connection.commit.mockResolvedValue(undefined);
    databaseMocks.connection.rollback.mockResolvedValue(undefined);
    databaseMocks.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      if (sql.includes("SELECT f.pk")) {
        return [
          [
            {
              pk: 7,
              maxId: "9999",
              next: "0200",
              type_name: "decimal",
            },
          ],
          [],
        ];
      }
      if (sql.includes("UPDATE family")) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
  });

  it("locks the family row and commits the next serial on one connection", async () => {
    const result = await generatePrintZPL(part, 2);

    expect(result.status).toBe(true);
    expect(result.labels?.map((label) => label.serialNumber)).toEqual([
      "0200",
      "0201",
    ]);
    expect(databaseMocks.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("information_schema.TABLES"),
    );
    expect(databaseMocks.connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FOR UPDATE"),
      [part.Part_Number],
    );
    expect(databaseMocks.connection.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("WHERE pk = ?"),
      ["0202", 7],
    );
    expect(databaseMocks.connection.commit).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.rollback).not.toHaveBeenCalled();
    expect(databaseMocks.connection.release).toHaveBeenCalledOnce();
    expect(
      databaseMocks.connection.commit.mock.invocationCallOrder[0],
    ).toBeLessThan(
      databaseMocks.connection.release.mock.invocationCallOrder[0],
    );
  });

  it("rolls back and does not print when the counter update fails", async () => {
    databaseMocks.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      if (sql.includes("SELECT f.pk")) {
        return [
          [
            {
              pk: 7,
              maxId: "9999",
              next: "0200",
              type_name: "decimal",
            },
          ],
          [],
        ];
      }
      throw new Error("Database update failed");
    });

    const result = await generatePrintZPL(part, 1);

    expect(result.status).toBe(false);
    expect(databaseMocks.connection.rollback).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.commit).not.toHaveBeenCalled();
    expect(databaseMocks.connection.release).toHaveBeenCalledOnce();
  });

  it("stops printing when more than one family counter exists", async () => {
    databaseMocks.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      return [
        [
          { pk: 7, maxId: "9999", next: "0200", type_name: "decimal" },
          { pk: 8, maxId: "9999", next: "0300", type_name: "decimal" },
        ],
        [],
      ];
    });

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });
    expect(databaseMocks.connection.rollback).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.commit).not.toHaveBeenCalled();
    expect(databaseMocks.connection.query).toHaveBeenCalledTimes(2);
    expect(databaseMocks.connection.release).toHaveBeenCalledOnce();
  });

  it("refuses to reserve serials when family does not use InnoDB", async () => {
    databaseMocks.connection.query.mockResolvedValueOnce([
      [{ ENGINE: "MyISAM" }],
      [],
    ]);

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });
    expect(databaseMocks.connection.query).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.rollback).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.commit).not.toHaveBeenCalled();
  });

  it("prints maxId once and stores an out-of-range exhausted counter", async () => {
    databaseMocks.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      if (sql.includes("SELECT f.pk")) {
        return [
          [{ pk: 7, maxId: "9999", next: "9999", type_name: "decimal" }],
          [],
        ];
      }
      if (sql.includes("UPDATE family")) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await generatePrintZPL(part, 1);

    expect(result.status).toBe(true);
    expect(result.labels?.[0].serialNumber).toBe("9999");
    expect(databaseMocks.connection.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE family"),
      ["10000", 7],
    );
    expect(databaseMocks.connection.commit).toHaveBeenCalledOnce();
  });

  it("does not reuse a serial after the counter has been exhausted", async () => {
    databaseMocks.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.TABLES")) {
        return [[{ ENGINE: "InnoDB" }], []];
      }
      return [
        [{ pk: 7, maxId: "9999", next: "10000", type_name: "decimal" }],
        [],
      ];
    });

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.serial_range_exceeded",
    });
    expect(databaseMocks.connection.rollback).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.commit).not.toHaveBeenCalled();
  });
});

describe("generateReprintZPL validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.pool.query.mockResolvedValue([
      [{ pk: 7, maxId: "9999", next: "0200", type_name: "decimal" }],
      [],
    ]);
  });

  it("rejects serial 0 for a real reprint before querying the database", async () => {
    const result = await generateReprintZPL(part, "2026-08-13", "0", 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.invalid_data",
    });
    expect(databaseMocks.pool.query).not.toHaveBeenCalled();
  });

  it("allows serial 0 only through the preview path and resolves family.next", async () => {
    const result = await generateReprintPreviewZPL(part, "2026-08-13", "0");

    expect(result.status).toBe(true);
    expect(result.labels?.[0].serialNumber).toBe("0200");
  });

  it.each([
    ["invalid quantity", "2026-08-13", "0200", 0],
    ["invalid date", "2026-02-30", "0200", 1],
    ["invalid serial width", "2026-08-13", "200", 1],
    ["invalid decimal serial", "2026-08-13", "ABCD", 1],
  ])("rejects %s", async (_name, date, serial, quantity) => {
    const result = await generateReprintZPL(part, date, serial, quantity);

    expect(result.status).toBe(false);
  });

  it("stops when the family row is ambiguous", async () => {
    databaseMocks.pool.query.mockResolvedValue([
      [
        { pk: 7, maxId: "9999", next: "0200", type_name: "decimal" },
        { pk: 8, maxId: "9999", next: "0300", type_name: "decimal" },
      ],
      [],
    ]);

    const result = await generateReprintZPL(part, "2026-08-13", "0200", 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });
  });

  it("rejects a future serial that has not been reserved yet", async () => {
    const result = await generateReprintZPL(part, "2026-08-13", "0200", 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.invalid_data",
    });
  });

  it("allows reprinting a serial below family.next", async () => {
    const result = await generateReprintZPL(part, "2026-08-13", "0199", 1);

    expect(result.status).toBe(true);
    expect(result.labels?.[0].serialNumber).toBe("0199");
  });
});
