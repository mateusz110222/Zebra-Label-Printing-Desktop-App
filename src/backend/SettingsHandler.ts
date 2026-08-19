import { ipcMain } from "electron";
import { store } from "./store";

export default function SettingsHandler(): void {
  ipcMain.handle("get-auto-update-setting", () => store.get("autoUpdate"));
}
