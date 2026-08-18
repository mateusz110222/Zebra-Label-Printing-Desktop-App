import { ipcMain } from "electron";

export default function GetGithubVersions(): void {
  ipcMain.handle("get-github-version", async () => {
    const url = process.env.GITHUB_RELEASE_URL;

    if (!url) {
      return "GitHub release URL is not configured.";
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        return `HTTP ${response.status}`;
      }

      const data = await response.json();
      return data.tag_name;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Błąd pobierania wersji GitHub w Main Process:", errMsg);
      return `Błąd pobierania wersji GitHub w Main Process: ${errMsg}`;
    }
  });
}
