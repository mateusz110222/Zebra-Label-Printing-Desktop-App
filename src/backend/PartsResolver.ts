import { type LocalPart, type PartsConfig, store } from "./store";

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const PART_FIELDS = [
  "Operation",
  "Part_Number",
  "Part_Description",
  "Serial_Prefix",
  "Label_Format",
] as const;

export interface PartsResponse {
  status: boolean;
  message: string;
  data: LocalPart[];
  rawError?: string;
}

export interface PartsLoaderDependencies {
  readConfig?: () => unknown;
  fetchImpl?: typeof fetch;
  configUrl?: string;
  configFile?: string;
  timeoutMs?: number;
}

export type PartLookup = {
  Part_Number?: unknown;
  Operation?: unknown;
  Serial_Prefix?: unknown;
  Label_Format?: unknown;
};

export type PartResolution =
  | {
      status: true;
      message: string;
      data: LocalPart;
    }
  | {
      status: false;
      message: string;
      rawError?: string;
    };

const failure = (message: string, rawError: string): PartsResponse => ({
  status: false,
  message,
  rawError,
  data: [],
});

const normalizeParts = (
  value: unknown,
):
  { status: true; data: LocalPart[] } | { status: false; rawError: string } => {
  if (!Array.isArray(value)) {
    return { status: false, rawError: "Parts data must be an array." };
  }

  const parts: LocalPart[] = [];
  for (const [index, valuePart] of value.entries()) {
    if (!valuePart || typeof valuePart !== "object") {
      return {
        status: false,
        rawError: `Part at index ${index} must be an object.`,
      };
    }

    const candidate = valuePart as Record<string, unknown>;
    for (const field of PART_FIELDS) {
      if (
        typeof candidate[field] !== "string" ||
        candidate[field].trim().length === 0
      ) {
        return {
          status: false,
          rawError: `Part at index ${index} has an invalid ${field}.`,
        };
      }
    }

    parts.push({
      Operation: (candidate.Operation as string).trim(),
      Part_Number: (candidate.Part_Number as string).trim(),
      Part_Description: (candidate.Part_Description as string).trim(),
      Serial_Prefix: (candidate.Serial_Prefix as string).trim(),
      Label_Format: (candidate.Label_Format as string).trim(),
    });
  }

  return { status: true, data: parts };
};

const normalizeKey = (value: string): string => value.trim().toUpperCase();

const parseLookup = (
  value: unknown,
):
  | {
      status: true;
      partNumber: string;
      operation?: string;
      serialPrefix?: string;
      labelFormat: string;
    }
  | { status: false; rawError: string } => {
  if (!value || typeof value !== "object") {
    return { status: false, rawError: "Part payload must be an object." };
  }

  const candidate = value as PartLookup;
  if (
    typeof candidate.Part_Number !== "string" ||
    candidate.Part_Number.trim().length === 0
  ) {
    return { status: false, rawError: "Part_Number is required." };
  }
  if (
    typeof candidate.Label_Format !== "string" ||
    candidate.Label_Format.trim().length === 0
  ) {
    return { status: false, rawError: "Label_Format is required." };
  }
  if (
    candidate.Operation !== undefined &&
    candidate.Operation !== null &&
    typeof candidate.Operation !== "string"
  ) {
    return { status: false, rawError: "Operation must be a string." };
  }
  if (
    candidate.Serial_Prefix !== undefined &&
    candidate.Serial_Prefix !== null &&
    typeof candidate.Serial_Prefix !== "string"
  ) {
    return { status: false, rawError: "Serial_Prefix must be a string." };
  }

  const operation =
    typeof candidate.Operation === "string" && candidate.Operation.trim()
      ? normalizeKey(candidate.Operation)
      : undefined;
  const serialPrefix =
    typeof candidate.Serial_Prefix === "string" &&
    candidate.Serial_Prefix.trim()
      ? normalizeKey(candidate.Serial_Prefix)
      : undefined;

  return {
    status: true,
    partNumber: normalizeKey(candidate.Part_Number),
    operation,
    serialPrefix,
    labelFormat: normalizeKey(candidate.Label_Format),
  };
};

export async function loadAuthoritativeParts(
  dependencies: PartsLoaderDependencies = {},
): Promise<PartsResponse> {
  try {
    const partsConfig = (
      dependencies.readConfig ?? (() => store.get("parts"))
    )() as Partial<PartsConfig> | undefined;

    if (
      !partsConfig ||
      !["local", "server"].includes(partsConfig.source || "")
    ) {
      return failure(
        "backend.parts.GET_PARTS_FAIL",
        "Parts source configuration is invalid.",
      );
    }

    if (partsConfig.source === "local") {
      const validated = normalizeParts(partsConfig.localParts);
      return validated.status
        ? {
            status: true,
            message: "backend.parts.PARTS_FETCH_SUCCESS",
            data: validated.data,
          }
        : failure("backend.parts.GET_PARTS_FAIL", validated.rawError);
    }

    const configUrl = dependencies.configUrl ?? process.env.PARTS_CONFIG_URL;
    const configFile =
      dependencies.configFile ?? process.env.PARTS_CONFIG_FILE ?? "lps.json";
    if (!configUrl?.trim()) {
      return failure(
        "backend.parts.PARTS_CONFIG_MISSING",
        "PARTS_CONFIG_URL is not configured.",
      );
    }

    const timeoutMs =
      Number.isFinite(dependencies.timeoutMs) &&
      Number(dependencies.timeoutMs) > 0
        ? Number(dependencies.timeoutMs)
        : DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await (dependencies.fetchImpl ?? fetch)(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: configFile }),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        return failure(
          "backend.parts.GET_PARTS_FAIL",
          `Parts request timed out after ${timeoutMs} ms.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return failure(
        "backend.parts.GET_PARTS_FAIL",
        `Parts server returned HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as {
      status?: unknown;
      data?: unknown;
      message?: unknown;
    };
    if (body.status !== true) {
      return failure(
        "backend.parts.GET_PARTS_FAIL",
        typeof body.message === "string"
          ? body.message
          : "Parts server rejected the request.",
      );
    }

    const validated = normalizeParts(body.data);
    return validated.status
      ? {
          status: true,
          message: "backend.parts.PARTS_FETCH_SUCCESS",
          data: validated.data,
        }
      : failure("backend.parts.GET_PARTS_FAIL", validated.rawError);
  } catch (error) {
    return failure(
      "backend.parts.GET_PARTS_FAIL",
      error instanceof Error
        ? error.message
        : String(error) || "Failed to download parts list.",
    );
  }
}

export async function resolveAuthoritativePart(
  lookup: unknown,
  dependencies: PartsLoaderDependencies = {},
): Promise<PartResolution> {
  const parsed = parseLookup(lookup);
  if (!parsed.status) {
    return {
      status: false,
      message: "backend.print.invalid_data",
      rawError: parsed.rawError,
    };
  }

  const loaded = await loadAuthoritativeParts(dependencies);
  if (!loaded.status) {
    return {
      status: false,
      message: loaded.message,
      rawError: loaded.rawError,
    };
  }

  const matches = loaded.data.filter(
    (part) =>
      normalizeKey(part.Part_Number) === parsed.partNumber &&
      normalizeKey(part.Label_Format) === parsed.labelFormat &&
      (!parsed.serialPrefix ||
        normalizeKey(part.Serial_Prefix) === parsed.serialPrefix) &&
      (!parsed.operation || normalizeKey(part.Operation) === parsed.operation),
  );

  if (matches.length !== 1) {
    return {
      status: false,
      message: "backend.print.invalid_data",
      rawError:
        matches.length === 0
          ? "No authoritative part matches Part_Number, Operation, Serial_Prefix and Label_Format."
          : "The part payload is ambiguous; Operation and Serial_Prefix are required to select exactly one authoritative part.",
    };
  }

  return {
    status: true,
    message: "backend.parts.PARTS_FETCH_SUCCESS",
    data: matches[0],
  };
}
