import { ipcMain } from "electron";
import { loadAuthoritativeParts, type PartsResponse } from "./PartsResolver";
import {
  isMainRendererAuthorized,
  isPreviewAuthorized,
} from "../auth/IsAutorized";

export type { PartsResponse } from "./PartsResolver";

export default function GetParts(): void {
  ipcMain.handle("get-parts", async (event): Promise<PartsResponse> => {
    if (
      event?.sender &&
      !isMainRendererAuthorized(event) &&
      !isPreviewAuthorized(event)
    ) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
        data: [],
      };
    }
    return loadAuthoritativeParts();
  });
}
