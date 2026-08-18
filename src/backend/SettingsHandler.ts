import { ipcMain } from "electron";
import { store } from "./store";
import { appendAuditLog } from "./AuditLog";

export default function SettingsHandler(): void {
  ipcMain.handle("get-settings", (_event, key) => {
    if (key === "database") return undefined;
    return store.get(key);
  });

  ipcMain.on("set-settings", (_event, key, value) => {
    if (key === "database") return;
    store.set(key, value);
    void appendAuditLog({
      category: "config",
      action: "APP_SETTING_CHANGED",
      status: "success",
      details: {
        key,
        ...(key === "database" && value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : { value }),
      },
    });
  });
}
