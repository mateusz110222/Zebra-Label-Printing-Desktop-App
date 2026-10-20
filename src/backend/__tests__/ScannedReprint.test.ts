import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeScannedSerial,
  resolveScannedReprint,
} from "../parts/ScannedReprint";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  generate: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../parts/PartsResolver", () => ({
  loadAuthoritativeParts: mocks.load,
}));
vi.mock("../hooks/ZPLService", () => ({ generateReprintZPL: mocks.generate }));
vi.mock("../utils/store", () => ({ store: { get: mocks.get } }));

const part = {
  Part_Number: "66849999",
  Serial_Prefix: "PC66849999A",
  Operation: "LINE_A",
  Part_Description: "Test part",
  Label_Format: "16x13",
};

const cmcPart = {
  Part_Number: "42046657",
  Serial_Prefix: "PC42046657A",
  Operation: "LINE_A",
  Part_Description: "CMC part",
  Label_Format: "cmc_d0",
};

describe("scanned reprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ status: true, data: [part] });
    mocks.generate.mockResolvedValue({ status: true });
    mocks.get.mockReturnValue({ operation: "LINE_A" });
  });

  it("decodes the supplied barcode without losing leading counter zeroes", () => {
    expect(decodeScannedSerial("PC66849999A262780009", [part])).toEqual({
      status: true,
      data: {
        part,
        date: "2026-10-05",
        serialNumber: "0009",
        fullSerialNumber: "PC66849999A262780009",
      },
    });
  });

  it("decodes a CMC barcode using 4-digit CMCJDATE (YDDD)", () => {
    expect(decodeScannedSerial("PC42046657A62780009", [cmcPart])).toEqual({
      status: true,
      data: {
        part: cmcPart,
        date: "2026-10-05",
        serialNumber: "0009",
        fullSerialNumber: "PC42046657A62780009",
      },
    });
  });

  it("accepts scanner line endings and lowercase text", () => {
    expect(decodeScannedSerial("pc66849999a262780009\r\n", [part]).status).toBe(
      true,
    );
  });

  it.each([
    "",
    "0009",
    "PC66849999A260000009",
    "PC66849999A263660009",
    "PC66849999A26278",
    "PC66849999A26278 0009",
    "X".repeat(257),
    null,
    { serial: "0009" },
  ])("rejects invalid or incomplete scanned input %j", (input) => {
    expect(decodeScannedSerial(input, [part]).status).toBe(false);
  });

  it("accepts day 366 only in leap years", () => {
    const result = decodeScannedSerial("PC66849999A24366000A", [part]);
    expect(result).toMatchObject({
      status: true,
      data: { date: "2024-12-31", serialNumber: "000A" },
    });
  });

  it("rejects ambiguous parts instead of selecting the first prefix match", () => {
    expect(
      decodeScannedSerial("PC66849999A262780009", [
        part,
        { ...part, Part_Number: "other" },
      ]),
    ).toEqual({ status: false, message: "reprint.scan_ambiguous" });
  });

  it("ignores duplicate identical config rows", () => {
    expect(
      decodeScannedSerial("PC66849999A262780009", [part, { ...part }]).status,
    ).toBe(true);
  });

  it("validates the original date and serial with quantity one without allocating a new serial", async () => {
    const result = await resolveScannedReprint("PC66849999A262780009");
    expect(result.status).toBe(true);
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
      part,
      "2026-10-05",
      "0009",
      1,
    );
  });

  it("propagates the existing unreserved-serial validation", async () => {
    mocks.generate.mockResolvedValueOnce({
      status: false,
      message: "backend.print.reprint_serial_not_reserved",
    });
    expect(await resolveScannedReprint("PC66849999A262780009")).toMatchObject({
      status: false,
      message: "backend.print.reprint_serial_not_reserved",
    });
  });

  it("only resolves parts in the configured operation", async () => {
    mocks.load.mockResolvedValueOnce({
      status: true,
      data: [{ ...part, Operation: "LINE_B" }],
    });
    expect(await resolveScannedReprint("PC66849999A262780009")).toMatchObject({
      status: false,
      message: "reprint.scan_not_found",
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not contact any service for malformed input", async () => {
    await resolveScannedReprint("invalid barcode!");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("reports an unavailable parts source", async () => {
    mocks.load.mockResolvedValueOnce({
      status: false,
      message: "backend.parts.REQUEST_TIMEOUT",
    });
    expect(await resolveScannedReprint("PC66849999A262780009")).toMatchObject({
      status: false,
      message: "backend.parts.REQUEST_TIMEOUT",
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
