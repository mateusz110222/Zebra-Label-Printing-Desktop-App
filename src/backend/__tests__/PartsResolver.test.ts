import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuthoritativeParts, resolveAuthoritativePart } from "../PartsResolver";

vi.mock("../store", () => ({
  store: { get: vi.fn() },
}));

const canonicalParts = [
  {
    Operation: " OP-10 ",
    Part_Number: " 42022977 ",
    Part_Description: " LOWER AC ",
    Serial_Prefix: " 42022977A ",
    Label_Format: " 16x13 ",
  },
  {
    Operation: "OP-20",
    Part_Number: "42022977",
    Part_Description: "LOWER AC SECOND OPERATION",
    Serial_Prefix: "42022977B",
    Label_Format: "16x13",
  },
];

const localDependencies = {
  readConfig: (): unknown => ({
    source: "local",
    operation: "",
    localParts: canonicalParts,
  }),
};

describe("authoritative parts loader and resolver", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes valid local records and returns canonical fields", async () => {
    const result = await resolveAuthoritativePart(
      {
        Operation: "op-10",
        Part_Number: "42022977",
        Part_Description: "SPOOFED",
        Serial_Prefix: " 42022977a ",
        Label_Format: "16X13",
      },
      localDependencies,
    );

    expect(result).toEqual({
      status: true,
      message: "backend.parts.PARTS_FETCH_SUCCESS",
      data: {
        Operation: "OP-10",
        Part_Number: "42022977",
        Part_Description: "LOWER AC",
        Serial_Prefix: "42022977A",
        Label_Format: "16x13",
      },
    });
  });

  it("requires Operation when PN and format identify multiple records", async () => {
    const result = await resolveAuthoritativePart(
      { Part_Number: "42022977", Label_Format: "16x13" },
      localDependencies,
    );

    expect(result).toMatchObject({
      status: false,
      message: "backend.print.invalid_data",
      rawError: expect.stringContaining("ambiguous"),
    });
  });

  it("allows a missing Operation only when PN and format are unambiguous", async () => {
    const result = await resolveAuthoritativePart(
      { Part_Number: "42022977", Label_Format: "16x13" },
      {
        readConfig: () => ({
          source: "local",
          operation: "",
          localParts: [canonicalParts[0]],
        }),
      },
    );

    expect(result.status).toBe(true);
    if (result.status) expect(result.data.Operation).toBe("OP-10");
  });

  it("distinguishes valid variants with the same PN, operation and format by serial prefix", async () => {
    const variants = [
      {
        Operation: "Audi",
        Part_Number: "42030648",
        Part_Description: "HOUSING REV.B",
        Serial_Prefix: "42030648B",
        Label_Format: "16x13",
      },
      {
        Operation: "Audi",
        Part_Number: "42030648",
        Part_Description: "HOUSING REV.E",
        Serial_Prefix: "42030648E",
        Label_Format: "16x13",
      },
    ];

    const result = await resolveAuthoritativePart(
      {
        Operation: "Audi",
        Part_Number: "42030648",
        Serial_Prefix: "42030648E",
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
        Part_Description: "HOUSING REV.E",
        Serial_Prefix: "42030648E",
      },
    });
  });

  it("rejects a serial prefix that does not exist in the authoritative source", async () => {
    const result = await resolveAuthoritativePart(
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
      message: "backend.print.invalid_data",
      rawError: expect.stringContaining("Serial_Prefix"),
    });
  });

  it("rejects the entire source when an authoritative record is invalid", async () => {
    const result = await loadAuthoritativeParts({
      readConfig: () => ({
        source: "local",
        operation: "",
        localParts: [{ ...canonicalParts[0], Serial_Prefix: " " }],
      }),
    });

    expect(result).toMatchObject({
      status: false,
      message: "backend.parts.GET_PARTS_FAIL",
      data: [],
      rawError: expect.stringContaining("Serial_Prefix"),
    });
  });

  it("aborts a server request after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    ) as unknown as typeof fetch;

    const pending = loadAuthoritativeParts({
      readConfig: () => ({ source: "server", operation: "", localParts: [] }),
      configUrl: "https://parts.invalid",
      timeoutMs: 25,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toMatchObject({
      status: false,
      message: "backend.parts.GET_PARTS_FAIL",
      rawError: expect.stringContaining("timed out"),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://parts.invalid",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
