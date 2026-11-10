import { loadAuthoritativeParts } from "./PartsResolver";
import { generateReprintZPL, getZplTemplate } from "../hooks/ZPLService";
import { serialBarcodeFields } from "../hooks/LabelProcessor";
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

const resolveJulianYear = (yearDigit: number): number => {
  const currentYear = new Date().getUTCFullYear();
  const baseDecade = Math.floor(currentYear / 10) * 10;
  const candidateYear = baseDecade + yearDigit;
  return candidateYear > currentYear ? candidateYear - 10 : candidateYear;
};

export function decodeScannedSerial(
  input: unknown,
  parts: LocalPart[],
  shortJulianFormats: ReadonlySet<string> = new Set(),
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

    if (
      usesCmcJulianFormat(part.Label_Format) ||
      shortJulianFormats.has(part.Label_Format)
    ) {
      if (!/^\d{4}[A-Z0-9]+$/.test(remainder)) return [];
      const julian = remainder.slice(0, 4);
      const year = resolveJulianYear(Number(julian.slice(0, 1)));
      const day = Number(julian.slice(1));
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
  const scanned = input.trim().toUpperCase();
  const formats = new Set(
    parts.flatMap(({ Serial_Prefix, Label_Format }) => {
      const prefix = Serial_Prefix.trim().toUpperCase();
      return prefix && scanned.startsWith(prefix) ? [Label_Format] : [];
    }),
  );
  const shortJulianFormats = new Set<string>();
  await Promise.all(
    [...formats].map(async (format) => {
      const template = await getZplTemplate(format);
      if (
        template.status &&
        template.data &&
        serialBarcodeFields(template.data).some(
          (field) => field.trim() === "*SERIALPREFIX**CMCJDATE**SERIALNUM1*",
        )
      ) {
        shortJulianFormats.add(format);
      }
    }),
  );
  // Validate the decoded number and template without reserving a serial or printing.
  const validate = async (
    decoded: ScannedReprintResult,
  ): Promise<ScannedReprintResult> => {
    if (!decoded.status) return decoded;
    const { part, date, serialNumber } = decoded.data;
    const result = await generateReprintZPL(part, date, serialNumber, 1);
    return result.status
      ? decoded
      : { status: false, message: result.message, rawError: result.rawError };
  };
  const decoded = decodeScannedSerial(input, parts, shortJulianFormats);
  if (!shortJulianFormats.size) return validate(decoded);

  const legacy = decodeScannedSerial(input, parts);
  if (!legacy.status && legacy.message === "reprint.scan_ambiguous")
    return legacy;
  if (
    legacy.status &&
    decoded.status &&
    legacy.data.part !== decoded.data.part &&
    shortJulianFormats.has(legacy.data.part.Label_Format)
  )
    return { status: false, message: "reprint.scan_ambiguous" };

  const result = await validate(decoded);
  if (
    !result.status &&
    legacy.status &&
    shortJulianFormats.has(legacy.data.part.Label_Format) &&
    (result.message === "reprint.scan_not_found" ||
      (result.message === "backend.print.invalid_serial_length" &&
        decoded.status &&
        decoded.data.part === legacy.data.part))
  ) {
    return validate(legacy);
  }
  return result;
}
