import { ipcMain } from "electron";
import { store } from "../utils/store";

export default function SettingsHandler(): void {
  ipcMain.handle("get-auto-update-setting", () => store.get("autoUpdate"));
}
