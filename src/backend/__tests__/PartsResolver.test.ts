import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAuthoritativeParts, resolveAuthoritativePart } from "../parts/PartsResolver";

const mocks = vi.hoisted(() => ({
  storeGet: vi.fn(),
}));

vi.mock("../utils/store", () => ({
  store: {
    get: mocks.storeGet,
  },
}));

const partOp10 = {
  Operation: " OP-10 ",
  Part_Number: " 42022977 ",
  Part_Description: " LOWER AC ",
  Serial_Prefix: " 42022977A ",
  Label_Format: " 16x13 ",
};

const partOp20 = {
  Operation: "OP-20",
  Part_Number: "42022977",
  Part_Description: "LOWER AC SECOND OPERATION",
  Serial_Prefix: "42022977B",
  Label_Format: "16x13",
};

const canonicalParts = [
  partOp10,
  partOp20,
];

const localDependencies = {
  readConfig: (): unknown => ({
    source: "local",
    operation: "",
    localParts: canonicalParts,
  }),
};

const createJsonResponse = (
  body: unknown,
  options: {
    ok?: boolean;
    status?: number;
    statusText?: string;
  } = {},
): Response =>
  ({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe("PartsResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.storeGet.mockReturnValue({
      source: "local",
      operation: "",
      localParts: canonicalParts,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("loadAuthoritativeParts - local source", () => {
    it("loads parts configuration from store when dependencies are not provided", async () => {
      const result =
        await loadAuthoritativeParts();

      expect(
        mocks.storeGet,
      ).toHaveBeenCalledWith("parts");

      expect(result.status).toBe(true);

      expect(result.data).toHaveLength(2);
    });

    it("normalizes all valid local records", async () => {
      const result =
        await loadAuthoritativeParts(
          localDependencies,
        );

      expect(result).toEqual({
        status: true,
        message:
          "backend.parts.PARTS_FETCH_SUCCESS",

        data: [
          {
            Operation: "OP-10",
            Part_Number: "42022977",
            Part_Description: "LOWER AC",
            Serial_Prefix: "42022977A",
            Label_Format: "16x13",
          },
          {
            Operation: "OP-20",
            Part_Number: "42022977",
            Part_Description:
              "LOWER AC SECOND OPERATION",
            Serial_Prefix: "42022977B",
            Label_Format: "16x13",
          },
        ],
      });
    });

    it("accepts an empty local parts array", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "local",
            operation: "",
            localParts: [],
          }),
        });

      expect(result).toEqual({
        status: true,
        message:
          "backend.parts.PARTS_FETCH_SUCCESS",
        data: [],
      });
    });

    it("rejects an invalid source configuration", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "invalid",
          }),
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_SOURCE_CONFIG",
        rawError:
          "Invalid parts source: invalid",
        data: [],
      });
    });

    it("rejects missing parts configuration", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => undefined,
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_SOURCE_CONFIG",
        rawError:
          "Invalid parts source: undefined",
        data: [],
      });
    });

    it("rejects local parts data that is not an array", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "local",
            localParts: {
              Part_Number: "42022977",
            },
          }),
        });

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.INVALID_DATA_FORMAT",
        data: [],
        rawError:
          expect.stringContaining(
            "Expected parts data to be an array",
          ),
      });
    });

    it("rejects a local part that is not an object", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "local",
            localParts: [
              "invalid part",
            ],
          }),
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_PART",
        rawError:
          "Part at index 0 must be an object.",
        data: [],
      });
    });

    it.each([
      ["Operation", " "],
      ["Part_Number", ""],
      ["Part_Description", null],
      ["Serial_Prefix", " "],
      ["Label_Format", 123],
    ])(
      "rejects invalid authoritative field %s",
      async (field, value) => {
        const result =
          await loadAuthoritativeParts({
            readConfig: () => ({
              source: "local",
              operation: "",
              localParts: [
                {
                  ...partOp10,
                  [field]: value,
                },
              ],
            }),
          });

        expect(result).toMatchObject({
          status: false,
          message:
            "backend.parts.INVALID_PART_FIELD",
          data: [],
          rawError:
            expect.stringContaining(field),
        });
      },
    );

    it("rejects the entire source when one authoritative record is invalid", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "local",
            operation: "",
            localParts: [
              partOp10,
              {
                ...partOp20,
                Serial_Prefix: " ",
              },
            ],
          }),
        });

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.INVALID_PART_FIELD",
        data: [],
        rawError:
          expect.stringContaining(
            "Serial_Prefix",
          ),
      });
    });
  });

  describe("loadAuthoritativeParts - server source", () => {
    it("loads and normalizes parts from the server", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          createJsonResponse({
            status: true,
            data: [
              partOp10,
            ],
          }),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            operation: "",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          configFile:
            "audi-parts.json",

          fetchImpl,
        });

      expect(result).toEqual({
        status: true,
        message:
          "backend.parts.PARTS_FETCH_SUCCESS",

        data: [
          {
            Operation: "OP-10",
            Part_Number: "42022977",
            Part_Description: "LOWER AC",
            Serial_Prefix: "42022977A",
            Label_Format: "16x13",
          },
        ],
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        "https://parts.example/api",
        expect.objectContaining({
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            file: "audi-parts.json",
          }),

          signal:
            expect.any(AbortSignal),
        }),
      );
    });

    it("returns an error when PARTS_CONFIG_URL is missing", async () => {
      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            operation: "",
            localParts: [],
          }),

          configUrl: "",
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.PARTS_CONFIG_MISSING",
        rawError:
          "PARTS_CONFIG_URL is not configured.",
        data: [],
      });
    });

    it("returns SERVER_HTTP_ERROR for an unsuccessful HTTP response", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          createJsonResponse(
            {},
            {
              ok: false,
              status: 503,
              statusText:
                "Service Unavailable",
            },
          ),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          fetchImpl,
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.SERVER_HTTP_ERROR",
        rawError:
          "Parts server returned HTTP 503 Service Unavailable.",
        data: [],
      });
    });

    it("returns SERVER_REJECTED when the server reports failure", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          createJsonResponse({
            status: false,
            message:
              "Configuration file does not exist",
          }),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          fetchImpl,
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.SERVER_REJECTED",
        rawError:
          "Configuration file does not exist",
        data: [],
      });
    });

    it("uses a fallback error when the server rejects without a message", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          createJsonResponse({
            status: false,
          }),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          fetchImpl,
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.SERVER_REJECTED",
        rawError:
          "Parts server rejected the request without an error message.",
        data: [],
      });
    });

    it("validates authoritative data returned by the server", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          createJsonResponse({
            status: true,
            data: [
              {
                ...partOp10,
                Serial_Prefix: "",
              },
            ],
          }),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          fetchImpl,
        });

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.INVALID_PART_FIELD",
        data: [],
        rawError:
          expect.stringContaining(
            "Serial_Prefix",
          ),
      });
    });

    it("returns GET_PARTS_FAIL when fetch throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "ECONNREFUSED",
          ),
        ) as unknown as typeof fetch;

      const result =
        await loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            localParts: [],
          }),

          configUrl:
            "https://parts.example/api",

          fetchImpl,
        });

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.GET_PARTS_FAIL",
        rawError: "ECONNREFUSED",
        data: [],
      });
    });

    it("aborts a server request after the configured timeout", async () => {
      vi.useFakeTimers();

      const fetchImpl = vi.fn(
        (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> =>
          new Promise(
            (_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  const error =
                    new Error("aborted");

                  error.name =
                    "AbortError";

                  reject(error);
                },
              );
            },
          ),
      ) as unknown as typeof fetch;

      const pending =
        loadAuthoritativeParts({
          readConfig: () => ({
            source: "server",
            operation: "",
            localParts: [],
          }),

          configUrl:
            "https://parts.invalid",

          timeoutMs: 25,

          fetchImpl,
        });

      await vi.advanceTimersByTimeAsync(
        25,
      );

      const result = await pending;

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.REQUEST_TIMEOUT",
        rawError:
          expect.stringContaining(
            "timed out after 25 ms",
          ),
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        "https://parts.invalid",

        expect.objectContaining({
          method: "POST",
          signal:
            expect.any(AbortSignal),
        }),
      );
    });
  });

  describe("resolveAuthoritativePart - lookup validation", () => {
    it("rejects a missing lookup object", async () => {
      const result =
        await resolveAuthoritativePart(
          undefined,
          localDependencies,
        );

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_LOOKUP_DATA",
        rawError:
          "Part payload must be an object.",
      });
    });

    it("rejects a missing part number", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Label_Format: "16x13",
          },
          localDependencies,
        );

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.PART_NUMBER_REQUIRED",
        rawError: undefined,
      });
    });

    it("rejects an empty part number", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "   ",
            Label_Format: "16x13",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.PART_NUMBER_REQUIRED",
      });
    });

    it("rejects a missing label format", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.LABEL_FORMAT_REQUIRED",
      });
    });

    it("rejects Operation with an invalid type", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
            Label_Format: "16x13",
            Operation: 123,
          },
          localDependencies,
        );

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_OPERATION",
        rawError:
          "Operation has invalid type: number.",
      });
    });

    it("rejects Serial_Prefix with an invalid type", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
            Label_Format: "16x13",
            Serial_Prefix: 123,
          },
          localDependencies,
        );

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_SERIAL_PREFIX",
        rawError:
          "Serial_Prefix has invalid type: number.",
      });
    });

    it("does not load authoritative parts when lookup validation fails", async () => {
      const readConfig = vi.fn();

      await resolveAuthoritativePart(
        {
          Part_Number: "",
          Label_Format: "16x13",
        },
        {
          readConfig,
        },
      );

      expect(
        readConfig,
      ).not.toHaveBeenCalled();
    });
  });

  describe("resolveAuthoritativePart - matching", () => {
    it("normalizes valid local records and returns canonical fields", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation: "op-10",
            Part_Number: "42022977",
            Part_Description:
              "SPOOFED",
            Serial_Prefix:
              " 42022977a ",
            Label_Format: "16X13",
          },
          localDependencies,
        );

      expect(result).toEqual({
        status: true,
        message:
          "backend.parts.PARTS_FETCH_SUCCESS",

        data: {
          Operation: "OP-10",
          Part_Number: "42022977",
          Part_Description: "LOWER AC",
          Serial_Prefix: "42022977A",
          Label_Format: "16x13",
        },
      });
    });

    it("matches lookup fields case-insensitively", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation: "op-10",
            Part_Number: "42022977",
            Serial_Prefix:
              "42022977a",
            Label_Format: "16X13",
          },
          localDependencies,
        );

      expect(result.status).toBe(true);

      if (result.status) {
        expect(
          result.data.Operation,
        ).toBe("OP-10");

        expect(
          result.data.Serial_Prefix,
        ).toBe("42022977A");
      }
    });

    it("trims lookup fields before matching", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation: " OP-10 ",
            Part_Number:
              " 42022977 ",
            Serial_Prefix:
              " 42022977A ",
            Label_Format:
              " 16x13 ",
          },
          localDependencies,
        );

      expect(result.status).toBe(true);
    });

    it("requires additional identifying data when PN and format match multiple records", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
            Label_Format: "16x13",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.PART_AMBIGUOUS",

        rawError:
          expect.stringContaining(
            "Found 2 matching authoritative parts",
          ),
      });
    });

    it("allows missing Operation only when PN and format are unambiguous", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
            Label_Format: "16x13",
          },

          {
            readConfig: () => ({
              source: "local",
              operation: "",
              localParts: [
                partOp10,
              ],
            }),
          },
        );

      expect(result.status).toBe(true);

      if (result.status) {
        expect(
          result.data.Operation,
        ).toBe("OP-10");
      }
    });

    it("distinguishes variants with the same PN, operation and format by serial prefix", async () => {
      const variants = [
        {
          Operation: "Audi",
          Part_Number: "42030648",
          Part_Description:
            "HOUSING REV.B",
          Serial_Prefix: "42030648B",
          Label_Format: "16x13",
        },
        {
          Operation: "Audi",
          Part_Number: "42030648",
          Part_Description:
            "HOUSING REV.E",
          Serial_Prefix: "42030648E",
          Label_Format: "16x13",
        },
      ];

      const result =
        await resolveAuthoritativePart(
          {
            Operation: "Audi",
            Part_Number: "42030648",
            Serial_Prefix:
              "42030648E",
            Label_Format: "16x13",
          },

          {
            readConfig: () => ({
              source: "local",
              operation: "Audi",
              localParts: variants,
            }),
          },
        );

      expect(result).toMatchObject({
        status: true,

        data: {
          Part_Description:
            "HOUSING REV.E",
          Serial_Prefix:
            "42030648E",
        },
      });
    });

    it("rejects a serial prefix that does not exist in authoritative source", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation: "OP-10",
            Part_Number: "42022977",
            Serial_Prefix: "SPOOFED",
            Label_Format: "16x13",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.PART_NOT_FOUND",

        rawError:
          expect.stringContaining(
            "Serial_Prefix",
          ),
      });
    });

    it("rejects an operation that does not exist in authoritative source", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation:
              "UNKNOWN-OPERATION",
            Part_Number: "42022977",
            Label_Format: "16x13",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.PART_NOT_FOUND",
      });
    });

    it("rejects a label format that does not match authoritative source", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Operation: "OP-10",
            Part_Number: "42022977",
            Label_Format: "99x99",
          },
          localDependencies,
        );

      expect(result).toMatchObject({
        status: false,
        message:
          "backend.parts.PART_NOT_FOUND",
      });
    });

    it("propagates an authoritative source loading failure", async () => {
      const result =
        await resolveAuthoritativePart(
          {
            Part_Number: "42022977",
            Label_Format: "16x13",
          },

          {
            readConfig: () => ({
              source: "invalid",
            }),
          },
        );

      expect(result).toEqual({
        status: false,
        message:
          "backend.parts.INVALID_SOURCE_CONFIG",
        rawError:
          "Invalid parts source: invalid",
      });
    });
  });
});
