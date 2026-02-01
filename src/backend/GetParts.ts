import { ipcMain } from "electron";

export interface PartsResponse {
  status: boolean;
  message: string;
  data: never[] | string;
}

export default function GetParts(): void {
  const body = {
    file: "lps.json",
  };

  ipcMain.handle("get-parts", async (): Promise<PartsResponse> => {
    try {
      const response = await fetch(
        "http://10.142.11.20/custom/matz/phpBB/router.php?job=GetConfig",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const resp = await response.json();
      if (resp.status) {
        return {
          status: true,
          message: "backend.parts.PARTS_FETCH_SUCCESS",
          data: resp.data,
        };
      } else {
        return {
          status: false,
          message: "backend.parts.GET_PARTS_FAIL",
          data: [],
        };
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : String(error) || "Failed to download parts list.";

      return {
        status: false,
        message: errorMsg,
        data: [],
      };
    }
  });
}
