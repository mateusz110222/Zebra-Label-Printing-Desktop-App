import { ipcMain } from "electron";

interface GithubVersionResponse {
  status: boolean;
  message: string;
  data?: string;
  rawError?: string;
}

export default function GetGithubVersions(): void {
  ipcMain.handle(
    "get-github-version",
    async (): Promise<GithubVersionResponse> => {
      const url = process.env.GITHUB_RELEASE_URL;

      if (!url) {
        return {
          status: false,
          message: "backend.github.url_not_configured",
          rawError: "GITHUB_RELEASE_URL is not configured.",
        };
      }

      try {
        const response = await fetch(url);

        if (!response.ok) {
          return {
            status: false,
            message: "backend.github.fetch_error",
            rawError: `GitHub returned HTTP ${response.status} ${response.statusText}.`,
          };
        }

        const data = (await response.json()) as {
          tag_name?: unknown;
        };

        if (
          typeof data.tag_name !== "string" ||
          data.tag_name.trim().length === 0
        ) {
          return {
            status: false,
            message: "backend.github.invalid_response",
            rawError: "GitHub response does not contain a valid tag_name.",
          };
        }

        return {
          status: true,
          message: "backend.github.fetch_success",
          data: data.tag_name,
        };
      } catch (error) {
        const rawError =
          error instanceof Error ? error.message : String(error);

        console.error("Failed to fetch GitHub version:", rawError);

        return {
          status: false,
          message: "backend.github.fetch_error",
          rawError,
        };
      }
    },
  );
}
