import { loadAuthoritativeParts } from "./PartsResolver";
import { generateReprintZPL } from "../hooks/ZPLService";
import { type LocalPart, store } from "../utils/store";

type ScannedReprintResult =
  | {
      status: true;
      data: {
        part: LocalPart;
        date: string;
        serialNumber: string;
        fullSerialNumber: string;
      };
    }
  | { status: false; message: string; rawError?: string };

const usesCmcJulianFormat = (labelFormat: string): boolean =>
  /^cmc[_-]/i.test(labelFormat.trim().replace(/\.(zpl|txt)$/i, ""));

const usesBulkcapFormat = (labelFormat: string): boolean =>
  /^bulkcap$/i.test(labelFormat.trim().replace(/\.(zpl|txt)$/i, ""));

const usesNoDateFormat = (labelFormat: string): boolean =>
  /^6x6$/i.test(labelFormat.trim().replace(/\.(zpl|txt)$/i, ""));

const resolveCmcYear = (yearDigit: number): number => {
  const currentYear = new Date().getUTCFullYear();
  const baseDecade = Math.floor(currentYear / 10) * 10;
  const candidateYear = baseDecade + yearDigit;
  return candidateYear > currentYear ? candidateYear - 10 : candidateYear;
};

export function decodeScannedSerial(
  input: unknown,
  parts: LocalPart[],
): ScannedReprintResult {
  if (typeof input !== "string" || input.length > 256) {
    return { status: false as const, message: "reprint.scan_invalid" };
  }
  const fullSerialNumber = input.trim().toUpperCase();
  if (!/^[A-Z0-9 ]+$/.test(fullSerialNumber)) {
    return { status: false as const, message: "reprint.scan_invalid" };
  }

  const candidates = parts.flatMap((part) => {
    const prefix = part.Serial_Prefix.trim().toUpperCase();
    if (!prefix || !fullSerialNumber.startsWith(prefix)) return [];
    const remainder = fullSerialNumber.slice(prefix.length);

    if (usesBulkcapFormat(part.Label_Format)) {
      const match = /^(\d{5}) 0([A-Z0-9]+) C4EENMX6550ACTJ$/.exec(remainder);
      if (!match) return [];
      const [, julian, serialNumber] = match;
      const year = 2000 + Number(julian.slice(0, 2));
      const day = Number(julian.slice(2));
      const calendarDate = new Date(Date.UTC(year, 0, day));
      if (day < 1 || calendarDate.getUTCFullYear() !== year) return [];
      return [
        {
          part,
          date: calendarDate.toISOString().slice(0, 10),
          serialNumber,
          fullSerialNumber,
        },
      ];
    }

    if (!/^[A-Z0-9]+$/.test(fullSerialNumber)) return [];

    if (usesNoDateFormat(part.Label_Format)) {
      if (!/^[A-Z0-9]+$/.test(remainder)) return [];
      return [
        {
          part,
          date: new Date().toISOString().slice(0, 10),
          serialNumber: remainder,
          fullSerialNumber,
        },
      ];
    }

    if (usesCmcJulianFormat(part.Label_Format)) {
      if (!/^\d{4}[A-Z0-9]+$/.test(remainder)) return [];
      const cmcJulian = remainder.slice(0, 4);
      const year = resolveCmcYear(Number(cmcJulian.slice(0, 1)));
      const day = Number(cmcJulian.slice(1));
      const calendarDate = new Date(Date.UTC(year, 0, day));
      if (day < 1 || calendarDate.getUTCFullYear() !== year) return [];
      return [
        {
          part,
          date: calendarDate.toISOString().slice(0, 10),
          serialNumber: remainder.slice(4),
          fullSerialNumber,
        },
      ];
    }

    if (!/^\d{5}[A-Z0-9]+$/.test(remainder)) return [];
    const julian = remainder.slice(0, 5);
    const year = 2000 + Number(julian.slice(0, 2));
    const day = Number(julian.slice(2));
    const calendarDate = new Date(Date.UTC(year, 0, day));
    if (day < 1 || calendarDate.getUTCFullYear() !== year) return [];
    return [
      {
        part,
        date: calendarDate.toISOString().slice(0, 10),
        serialNumber: remainder.slice(5),
        fullSerialNumber,
      },
    ];
  });

  // Repeated identical config rows are harmless; different parts or operations
  // sharing a prefix must never silently select a label.
  const unique = [
    ...new Map(
      candidates.map((candidate) => [JSON.stringify(candidate), candidate]),
    ).values(),
  ];
  if (unique.length !== 1) {
    return {
      status: false as const,
      message:
        unique.length > 1 ? "reprint.scan_ambiguous" : "reprint.scan_not_found",
    };
  }
  return { status: true as const, data: unique[0] };
}

export async function resolveScannedReprint(
  input: unknown,
): Promise<ScannedReprintResult> {
  // Reject malformed input before making any network or database request.
  if (
    typeof input !== "string" ||
    input.length > 256 ||
    !/^[A-Z0-9 ]+$/i.test(input.trim())
  ) {
    return { status: false as const, message: "reprint.scan_invalid" };
  }
  const loaded = await loadAuthoritativeParts();
  if (!loaded.status)
    return {
      status: false as const,
      message: loaded.message,
      rawError: loaded.rawError,
    };
  const operation = store.get("parts")?.operation?.trim().toLowerCase();
  const parts = operation
    ? loaded.data.filter(
        (part) => part.Operation.trim().toLowerCase() === operation,
      )
    : loaded.data;
  const decoded = decodeScannedSerial(input, parts);
  if (!decoded.status) return decoded;

  // The existing reprint generator verifies the counter against family.next and
  // family.maxId without reserving a new serial or sending anything to a printer.
  const validation = await generateReprintZPL(
    decoded.data.part,
    decoded.data.date,
    decoded.data.serialNumber,
    1,
  );
  if (!validation.status) {
    return {
      status: false as const,
      message: validation.message,
      rawError: validation.rawError,
    };
  }
  return decoded;
}
