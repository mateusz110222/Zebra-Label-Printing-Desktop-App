import { ipcMain } from "electron";
import { loadAuthoritativeParts, type PartsResponse } from "./PartsResolver";

export type { PartsResponse } from "./PartsResolver";

export default function GetParts(): void {
  ipcMain.handle("get-parts", (): Promise<PartsResponse> =>
    loadAuthoritativeParts(),
  );
}
