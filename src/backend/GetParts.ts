import { ipcMain } from "electron";

interface PartsResponse {
  status: boolean;
  message: string;
  data: [];
}

export default function GetParts() {
  const body = {
    file: "lps.json"
  };

  ipcMain.handle("get-parts", async () => {
    try {
      const response = await fetch(
        "http://10.142.11.20/custom/matz/phpBB/router.php?job=GetConfig",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      );

      const resp = await response.json();
      if (resp.status) {
        return {
          status: true,
          message: "Parts fetched successfully",
          data: resp.data
        };
      } else {
        throw new Error("Failed to fetch parts");
      }
    } catch (error: PartsResponse | any) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : error?.message || "Nie udało się pobrać listy części";

      return {
        status: false,
        message: errorMsg || "Nie udało się pobrać listy części",
        data: []
      };
    }
  });
}
