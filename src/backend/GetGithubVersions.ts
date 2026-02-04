import { ipcMain } from "electron";

export default function GetGithubVersions(): void {
  ipcMain.handle("get-github-version", async () => {
    const url =
      "https://api.github.com/repos/mateusz110222/Zebra-Label-Printing-Desktop-App/releases/latest";

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
