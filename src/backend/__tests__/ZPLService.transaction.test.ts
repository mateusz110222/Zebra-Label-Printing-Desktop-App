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
      getConnection: vi.fn(),
      query: vi.fn(),
    },
  };
});

vi.mock("../config/DatabaseConfig", () => ({
  getDatabase: () => databaseMocks.pool,
}));

vi.mock("../system/TemplatePaths", () => ({
  getTemplatesPath: () => "C:/templates",

  normalizeTemplateFileName: (name: string) =>
    /\.(zpl|txt)$/i.test(name)
      ? name
      : `${name}.zpl`,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,

    readFile: vi.fn().mockResolvedValue(
      "^XA^FD*SERIALPREFIX**JDATE**SERIALNUM1*^FS^PQ*NUMCOPIES*^XZ",
    ),

    writeFile: vi.fn(),
  };
});

const part = {
  Part_Number: "42022977",
  Part_Description: "LOWER AC ASM",
  Serial_Prefix: "42022977A",
  Label_Format: "16x13",
};

describe("generatePrintZPL serial transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    databaseMocks.pool.getConnection.mockResolvedValue(
      databaseMocks.connection,
    );

    databaseMocks.connection.beginTransaction.mockResolvedValue(
      undefined,
    );

    databaseMocks.connection.commit.mockResolvedValue(undefined);

    databaseMocks.connection.rollback.mockResolvedValue(undefined);

    databaseMocks.connection.release.mockReturnValue(undefined);

    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
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
          return [
            {
              affectedRows: 1,
            },
            [],
          ];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
  });

  it("locks the family row and commits the next serial on one connection", async () => {
    const result = await generatePrintZPL(part, 2);

    expect(result.status).toBe(true);

    expect(
      result.labels?.map((label) => label.serialNumber),
    ).toEqual([
      "0200",
      "0201",
    ]);

    expect(
      databaseMocks.connection.beginTransaction,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        "information_schema.TABLES",
      ),
    );

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FOR UPDATE"),
      [part.Part_Number],
    );

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        "UPDATE family SET next = ? WHERE pk = ?",
      ),
      ["0202", 7],
    );

    expect(
      databaseMocks.connection.commit,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.rollback,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit.mock.invocationCallOrder[0],
    ).toBeLessThan(
      databaseMocks.connection.release.mock
        .invocationCallOrder[0],
    );
  });

  it("rolls back and does not commit when the counter update fails", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
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
          throw new Error("Database update failed");
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });

    expect(result.rawError).toContain(
      "Database update failed",
    );

    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("stops printing when more than one family counter exists", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
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
              {
                pk: 8,
                maxId: "9999",
                next: "0300",
                type_name: "decimal",
              },
            ],
            [],
          ];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });

    expect(result.rawError).toContain(
      `Multiple family rows found for ${part.Part_Number}`,
    );

    /*
     * Aktualny ZPLService robi rollback przed throw,
     * a następnie jeszcze raz w catch.
     *
     * Nie sprawdzamy więc dokładnie liczby wywołań,
     * tylko to, że rollback rzeczywiście nastąpił.
     */
    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalled();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenCalledTimes(2);

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("refuses to reserve serials when family does not use InnoDB", async () => {
    databaseMocks.connection.query.mockResolvedValueOnce([
      [
        {
          ENGINE: "MyISAM",
        },
      ],
      [],
    ]);

    const result = await generatePrintZPL(part, 1);

    expect(result).toEqual({
      status: false,
      message: "backend.db.error",
      rawError: "backend.db.wrong_engine",
    });

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("stops when the family counter does not exist", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (sql.includes("SELECT f.pk")) {
          return [[], []];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result).toEqual({
      status: false,
      message: "backend.db.part_not_found",
      rawError: part.Part_Number,
    });

    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("prints maxId once and stores an out-of-range exhausted counter", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (sql.includes("SELECT f.pk")) {
          return [
            [
              {
                pk: 7,
                maxId: "9999",
                next: "9999",
                type_name: "decimal",
              },
            ],
            [],
          ];
        }

        if (sql.includes("UPDATE family")) {
          return [
            {
              affectedRows: 1,
            },
            [],
          ];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result.status).toBe(true);

    expect(
      result.labels?.[0].serialNumber,
    ).toBe("9999");

    expect(
      databaseMocks.connection.query,
    ).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        "UPDATE family SET next = ? WHERE pk = ?",
      ),
      ["10000", 7],
    );

    expect(
      databaseMocks.connection.commit,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.rollback,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("does not reuse a serial after the counter has been exhausted", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
        }

        if (sql.includes("SELECT f.pk")) {
          return [
            [
              {
                pk: 7,
                maxId: "9999",
                next: "10000",
                type_name: "decimal",
              },
            ],
            [],
          ];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.serial_range_exceeded",
    });

    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });

  it("rolls back when UPDATE does not affect exactly one row", async () => {
    databaseMocks.connection.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("information_schema.TABLES")) {
          return [
            [
              {
                ENGINE: "InnoDB",
              },
            ],
            [],
          ];
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
          return [
            {
              affectedRows: 0,
            },
            [],
          ];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await generatePrintZPL(part, 1);

    expect(result).toMatchObject({
      status: false,
      message: "backend.db.error",
    });

    expect(result.rawError).toContain(
      "Serial counter update affected 0 rows",
    );

    expect(
      databaseMocks.connection.rollback,
    ).toHaveBeenCalledOnce();

    expect(
      databaseMocks.connection.commit,
    ).not.toHaveBeenCalled();

    expect(
      databaseMocks.connection.release,
    ).toHaveBeenCalledOnce();
  });
});

describe("generateReprintZPL validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    databaseMocks.pool.query.mockResolvedValue([
      [
        {
          pk: 7,
          maxId: "9999",
          next: "0200",
          type_name: "decimal",
        },
      ],
      [],
    ]);
  });

  it("rejects serial 0 for a real reprint before querying the database", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0",
      1,
    );

    expect(result).toEqual({
      status: false,
      message:
        "backend.print.serial_zero_reprint_not_allowed",
      rawError: undefined,
    });

    expect(
      databaseMocks.pool.query,
    ).not.toHaveBeenCalled();
  });

  it("allows serial 0 only through the preview path and resolves family.next", async () => {
    const result = await generateReprintPreviewZPL(
      part,
      "2026-08-13",
      "0",
    );

    expect(result.status).toBe(true);

    expect(result.message).toBe(
      "backend.reprint.success",
    );

    expect(
      result.labels?.[0].serialNumber,
    ).toBe("0200");

    expect(
      databaseMocks.pool.query,
    ).toHaveBeenCalledOnce();
  });

  it("rejects invalid quantity", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0200",
      0,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.print.invalid_quantity",
      rawError: "Invalid quantity: 0",
    });

    expect(
      databaseMocks.pool.query,
    ).not.toHaveBeenCalled();
  });

  it("rejects invalid date", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-02-30",
      "0200",
      1,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.print.invalid_date",
      rawError: "Invalid date: 2026-02-30",
    });

    expect(
      databaseMocks.pool.query,
    ).not.toHaveBeenCalled();
  });

  it("rejects invalid serial width", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "200",
      1,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.print.invalid_serial_length",
      rawError: "Expected length: 4",
    });

    expect(
      databaseMocks.pool.query,
    ).toHaveBeenCalledOnce();
  });

  it("rejects an invalid decimal serial", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "ABCD",
      1,
    );

    expect(result.status).toBe(false);

    expect(result.message).toBe("backend.print.invalid_decimal");

    expect(
      databaseMocks.pool.query,
    ).toHaveBeenCalledOnce();
  });

  it("stops when the family row does not exist", async () => {
    databaseMocks.pool.query.mockResolvedValue([
      [],
      [],
    ]);

    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0199",
      1,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.db.part_not_found",
      rawError: part.Part_Number,
    });
  });

  it("stops when the family row is ambiguous", async () => {
    databaseMocks.pool.query.mockResolvedValue([
      [
        {
          pk: 7,
          maxId: "9999",
          next: "0200",
          type_name: "decimal",
        },
        {
          pk: 8,
          maxId: "9999",
          next: "0300",
          type_name: "decimal",
        },
      ],
      [],
    ]);

    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0199",
      1,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.db.error",
      rawError:
        `Multiple family rows found for ${part.Part_Number}`,
    });
  });

  it("rejects a serial equal to family.next because it has not been reserved yet", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0200",
      1,
    );

    expect(result).toEqual({
      status: false,
      message:
        "backend.print.reprint_serial_not_reserved",
      rawError: undefined,
    });
  });

  it("rejects a serial above family.next because it has not been reserved yet", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0201",
      1,
    );

    expect(result).toEqual({
      status: false,
      message:
        "backend.print.reprint_serial_not_reserved",
      rawError: undefined,
    });
  });

  it("allows reprinting a serial below family.next", async () => {
    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "0199",
      1,
    );

    expect(result.status).toBe(true);

    expect(result.message).toBe(
      "backend.reprint.success",
    );

    expect(
      result.labels?.[0].serialNumber,
    ).toBe("0199");
  });

  it("rejects preview when family.next is already above maxId", async () => {
    databaseMocks.pool.query.mockResolvedValue([
      [
        {
          pk: 7,
          maxId: "9999",
          next: "10000",
          type_name: "decimal",
        },
      ],
      [],
    ]);

    const result = await generateReprintPreviewZPL(
      part,
      "2026-08-13",
      "0",
    );

    expect(result).toEqual({
      status: false,
      message: "backend.print.serial_range_exceeded",
      rawError: "The serial range is exhausted",
    });
  });

  it("rejects a reprint range that exceeds maxId", async () => {
    databaseMocks.pool.query.mockResolvedValue([
      [
        {
          pk: 7,
          maxId: "9999",
          next: "10000",
          type_name: "decimal",
        },
      ],
      [],
    ]);

    const result = await generateReprintZPL(
      part,
      "2026-08-13",
      "9999",
      2,
    );

    expect(result).toEqual({
      status: false,
      message: "backend.print.serial_range_exceeded",
      rawError:
        "The requested serial range is outside family.maxId",
    });
  });
});
