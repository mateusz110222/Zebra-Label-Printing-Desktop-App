import { ipcMain } from "electron";
import { appendAuditLog, canViewAuditLogs, checkAuditLogWritable } from "../audit/AuditLog";
import { LocalPart, PartsConfig, store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

const isValidPart = (part: unknown): part is LocalPart => {
  if (!part || typeof part !== "object") return false;
  const candidate = part as Record<string, unknown>;
  return [
    "Operation",
    "Part_Number",
    "Part_Description",
    "Serial_Prefix",
    "Label_Format",
  ].every(
    (key) =>
      typeof candidate[key] === "string" && candidate[key].trim().length > 0,
  );
};

export default function PartsConfigHandler(): void {
  ipcMain.handle("get-parts-config", (): PartsConfig => store.get("parts"));

  ipcMain.handle("save-parts-config", async (event, config: PartsConfig) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
      return { status: false, message: "backend.audit.unauthorized" };
    }
    if (
      !config ||
      !["server", "local"].includes(config.source) ||
      typeof config.operation !== "string"
    ) {
      await appendAuditLog({
        category: "config",
        action: "PARTS_CONFIG_CHANGED",
        status: "failure",
        details: { reason: "INVALID_CONFIG" },
      });
      return { status: false, message: "backend.parts.INVALID_CONFIG" };
    }

    if (
      !Array.isArray(config.localParts) ||
      !config.localParts.every(isValidPart)
    ) {
      await appendAuditLog({
        category: "config",
        action: "PARTS_CONFIG_CHANGED",
        status: "failure",
        details: { reason: "INVALID_PART" },
      });
      return { status: false, message: "backend.parts.INVALID_PART" };
    }

    const auditStorage = await checkAuditLogWritable();
    if (!auditStorage.status) {
      return {
        status: false,
        message: "backend.audit.storage_unavailable",
        rawError: auditStorage.rawError,
      };
    }

    const previousConfig = store.get("parts");
    const normalizedConfig: PartsConfig = {
      source: config.source,
      operation: config.operation.trim(),
      localParts: config.localParts.map((part) => ({
        Operation: part.Operation.trim(),
        Part_Number: part.Part_Number.trim(),
        Part_Description: part.Part_Description.trim(),
        Serial_Prefix: part.Serial_Prefix.trim(),
        Label_Format: part.Label_Format.trim(),
      })),
    };
    store.set("parts", normalizedConfig);
    const auditPersisted = await appendAuditLog({
      category: "config",
      action: "PARTS_CONFIG_CHANGED",
      status: "success",
      details: {
        source: config.source,
        operation: config.operation.trim(),
        localPartsCount: config.localParts.length,
      },
    });

    if (!auditPersisted) {
      store.set("parts", previousConfig);
      return {
        status: false,
        message: "backend.audit.storage_unavailable",
      };
    }

    return { status: true, message: "backend.parts.PARTS_CONFIG_SAVED" };
  });
}
