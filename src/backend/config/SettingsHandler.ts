import { ipcMain } from "electron";
import { store } from "../utils/store";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

export default function SettingsHandler(): void {
  ipcMain.handle("get-auto-update-setting", (event) => {
    if (event?.sender && !isMainRendererAuthorized(event)) {
      return false;
    }
    return store.get("autoUpdate");
  });
}
