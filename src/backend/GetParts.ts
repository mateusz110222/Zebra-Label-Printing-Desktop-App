import { ipcMain } from "electron";
import { LocalPart, store } from "./store";

export interface PartsResponse {
  status: boolean;
  message: string;
  data: LocalPart[] | string;
  rawError?: string;
}

export default function GetParts(): void {
  ipcMain.handle("get-parts", async (): Promise<PartsResponse> => {
    try {
      const partsConfig = store.get("parts");
      if (partsConfig.source === "local") {
        return {
          status: true,
          message: "backend.parts.PARTS_FETCH_SUCCESS",
          data: partsConfig.localParts,
        };
      }

      const partsConfigUrl = process.env.PARTS_CONFIG_URL;
      const partsConfigFile = process.env.PARTS_CONFIG_FILE || "lps.json";

      if (!partsConfigUrl) {
        return {
          status: false,
          message: "backend.parts.PARTS_CONFIG_MISSING",
          rawError: "PARTS_CONFIG_URL is not configured.",
          data: [],
        };
      }

      const response = await fetch(partsConfigUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: partsConfigFile }),
      });

      const resp = await response.json();
      if (resp.status) {
        return {
          status: true,
          message: "backend.parts.PARTS_FETCH_SUCCESS",
          data: resp.data,
        };
      } else {
        console.error(resp);
        return {
          status: false,
          message: "backend.parts.GET_PARTS_FAIL",
          rawError: resp.message || "Unknown server error",
          data: [],
        };
      }
    } catch (error) {
      console.error(error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : String(error) || "Failed to download parts list.";

      return {
        status: false,
        message: "backend.parts.GET_PARTS_FAIL",
        rawError: errorMsg,
        data: [],
      };
    }
  });
}
