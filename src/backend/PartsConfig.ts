import {ipcMain} from "electron";
import {LocalPart, PartsConfig, store} from "./store";

const isValidPart = (part: unknown): part is LocalPart => {
  if (!part || typeof part !== "object") return false;
  const candidate = part as Record<string, unknown>;
  return [
    "Operation",
    "Part_Number",
    "Part_Description",
    "Serial_Prefix",
    "Label_Format"
  ].every(
    (key) =>
      typeof candidate[key] === "string" && candidate[key].trim().length > 0
  );
};

export default function PartsConfigHandler(): void {
  ipcMain.handle("get-parts-config", (): PartsConfig => store.get("parts"));

  ipcMain.handle("save-parts-config", (_event, config: PartsConfig) => {
    if (
      !config ||
      !["server", "local"].includes(config.source) ||
      typeof config.operation !== "string"
    ) {
      return {status: false, message: "backend.parts.INVALID_CONFIG"};
    }

    if (
      !Array.isArray(config.localParts) ||
      !config.localParts.every(isValidPart)
    ) {
      return {status: false, message: "backend.parts.INVALID_PART"};
    }

    store.set("parts", {
      source: config.source,
      operation: config.operation.trim(),
      localParts: config.localParts.map((part) => ({
        Operation: part.Operation.trim(),
        Part_Number: part.Part_Number.trim(),
        Part_Description: part.Part_Description.trim(),
        Serial_Prefix: part.Serial_Prefix.trim(),
        Label_Format: part.Label_Format.trim()
      }))
    });
    return {status: true, message: "backend.parts.PARTS_CONFIG_SAVED"};
  });
}
