import { ipcMain } from "electron";
import {
  appendAuditLog,
  canViewAuditLogs,
  checkAuditLogWritable,
} from "../audit/AuditLog";
import { type PartsConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { normalizeParts } from "../parts/PartsResolver";

interface PartsConfigResponse {
  status: boolean;
  message: string;
  data?: PartsConfig;
  rawError?: string;
}

interface SavePartsConfigResponse {
  status: boolean;
  message: string;
  rawError?: string;
}

type PartsConfigValidation =
  | {
      status: true;
      data: PartsConfig;
    }
  | {
      status: false;
      message: string;
      rawError?: string;
    };

const DEFAULT_PARTS_CONFIG: PartsConfig = {
  source: "server",
  operation: "",
  localParts: [],
};

const getRawError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizePartsConfig = (
  value: unknown,
  requireOperation: boolean,
): PartsConfigValidation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      status: false,
      message: "backend.parts.INVALID_CONFIG",
      rawError: "Parts config must be an object.",
    };
  }

  const config = value as Record<string, unknown>;

  if (config.source !== "server" && config.source !== "local") {
    return {
      status: false,
      message: "backend.parts.INVALID_SOURCE_CONFIG",
      rawError: `Invalid parts source: ${String(config.source)}.`,
    };
  }

  if (typeof config.operation !== "string") {
    return {
      status: false,
      message: "backend.parts.INVALID_OPERATION",
      rawError: `Operation must be a string, received ${typeof config.operation}.`,
    };
  }

  const operation = config.operation.trim();

  if (requireOperation && operation.length === 0) {
    return {
      status: false,
      message: "backend.parts.OPERATION_REQUIRED",
    };
  }

  const normalizedParts = normalizeParts(config.localParts ?? []);

  if (!normalizedParts.status) {
    return {
      status: false,
      message: normalizedParts.message,
      rawError: normalizedParts.rawError,
    };
  }

  if (
    requireOperation &&
    config.source === "local" &&
    normalizedParts.data.length === 0
  ) {
    return {
      status: false,
      message: "backend.parts.LOCAL_PARTS_REQUIRED",
    };
  }

  return {
    status: true,
    data: {
      source: config.source,
      operation,
      localParts: normalizedParts.data,
    },
  };
};

export default function PartsConfigHandler(): void {
  ipcMain.handle("get-parts-config", (event): PartsConfigResponse => {
    if (!isMainRendererAuthorized(event)) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
      };
    }

    try {
      const storedConfig = store.get("parts") as unknown;

      if (storedConfig === undefined) {
        return {
          status: true,
          message: "backend.parts.PARTS_CONFIG_FETCHED",
          data: DEFAULT_PARTS_CONFIG,
        };
      }

      const normalized = normalizePartsConfig(storedConfig, false);

      if (!normalized.status) {
        return {
          status: false,
          message: normalized.message,
          rawError: normalized.rawError,
        };
      }

      return {
        status: true,
        message: "backend.parts.PARTS_CONFIG_FETCHED",
        data: normalized.data,
      };
    } catch (error) {
      return {
        status: false,
        message: "backend.parts.GET_CONFIG_FAIL",
        rawError: getRawError(error),
      };
    }
  });

  ipcMain.handle(
    "save-parts-config",
    async (event, config: unknown): Promise<SavePartsConfigResponse> => {
      if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }

      const normalized = normalizePartsConfig(config, true);

      if (!normalized.status) {
        await appendAuditLog({
          category: "config",
          action: "PARTS_CONFIG_CHANGED",
          status: "failure",
          details: {
            reason: "INVALID_CONFIG",
            message: normalized.message,
            rawError: normalized.rawError,
          },
        });

        return {
          status: false,
          message: normalized.message,
          rawError: normalized.rawError,
        };
      }

      const auditStorage = await checkAuditLogWritable();

      if (!auditStorage.status) {
        return {
          status: false,
          message: "backend.audit.storage_unavailable",
          rawError: auditStorage.rawError,
        };
      }

      let previousConfig: PartsConfig | undefined;

      try {
        previousConfig = store.get("parts");
        store.set("parts", normalized.data);
      } catch (error) {
        const rawError = getRawError(error);

        await appendAuditLog({
          category: "config",
          action: "PARTS_CONFIG_CHANGED",
          status: "failure",
          details: {
            reason: "STORE_WRITE_FAILED",
            rawError,
          },
        });

        return {
          status: false,
          message: "backend.parts.SAVE_CONFIG_FAIL",
          rawError,
        };
      }

      const auditPersisted = await appendAuditLog({
        category: "config",
        action: "PARTS_CONFIG_CHANGED",
        status: "success",
        details: {
          source: normalized.data.source,
          operation: normalized.data.operation,
          localPartsCount: normalized.data.localParts.length,
        },
      });

      if (!auditPersisted) {
        try {
          if (previousConfig === undefined) {
            store.delete("parts");
          } else {
            store.set("parts", previousConfig);
          }
        } catch (error) {
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
            rawError: `Audit log write failed and config rollback failed: ${getRawError(error)}`,
          };
        }

        return {
          status: false,
          message: "backend.audit.storage_unavailable",
        };
      }

      return {
        status: true,
        message: "backend.parts.PARTS_CONFIG_SAVED",
      };
    },
  );
}
