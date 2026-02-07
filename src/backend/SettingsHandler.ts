import { ipcMain } from "electron";
import { store } from "./store";

export default function SettingsHandler(): void {
    ipcMain.handle("get-settings", (_event, key) => {
        return store.get(key);
    });

    ipcMain.on("set-settings", (_event, key, value) => {
        store.set(key, value);
    });
}
