import { ipcMain, app } from "electron";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export default function GetLabelsFormats(): void {
  ipcMain.handle("get-labels-formats", async () => {
    try {
      let templatesPath: string;

      if (app.isPackaged) {
        templatesPath = path.join(process.resourcesPath, "zpl_templates");
      } else {
        templatesPath = path.join(app.getAppPath(), "zpl_templates");
      }

      const filenames = await readdir(templatesPath);

      const validFiles = filenames.filter(
        (file) =>
          !file.startsWith(".") &&
          (file.endsWith(".zpl") || file.endsWith(".txt")),
      );

      const files = await Promise.all(
        validFiles.map(async (filename) => {
          const fullPath = path.join(templatesPath, filename);
          const content = await readFile(fullPath, "utf-8");

          return {
            name: filename,
            data: content,
          };
        }),
      );

      return {
        status: true,
        message: "backend.labels.TEMPLATES_FOUND",
        data: files,
      };
    } catch (error) {
      console.error("Błąd ładowania szablonów z: ", error);
      return {
        status: false,
        message: "backend.labels.ERROR_LOADING_TEMPLATES",
        error: error instanceof Error ? error.message : String(error),
        data: [],
      };
    }
  });
}
