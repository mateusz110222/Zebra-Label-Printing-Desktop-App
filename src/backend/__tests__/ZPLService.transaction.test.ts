import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrintZPL } from "../hooks/ZPLService";

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
    pool: { getConnection: vi.fn().mockResolvedValue(connection) },
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
      expect.stringContaining("FOR UPDATE"),
      [part.Part_Number],
    );
    expect(databaseMocks.connection.query).toHaveBeenNthCalledWith(
      2,
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
    databaseMocks.connection.query.mockResolvedValueOnce([
      [
        { pk: 7, maxId: "9999", next: "0200", type_name: "decimal" },
        { pk: 8, maxId: "9999", next: "0300", type_name: "decimal" },
      ],
      [],
    ]);

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });
    expect(databaseMocks.connection.rollback).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.commit).not.toHaveBeenCalled();
    expect(databaseMocks.connection.query).toHaveBeenCalledOnce();
    expect(databaseMocks.connection.release).toHaveBeenCalledOnce();
  });
});
