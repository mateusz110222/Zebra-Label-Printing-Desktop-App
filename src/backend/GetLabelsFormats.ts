import { app, ipcMain } from "electron";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const getTemplatesPath = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, "zpl_templates")
    : path.join(app.getAppPath(), "zpl_templates");

const getTemplateFileName = (name: string): string | null => {
  if (!/^[^\\/:*?"<>|]+\.(zpl|txt)$/i.test(name)) return null;
  return path.basename(name);
};

export default function GetLabelsFormats(): void {
  ipcMain.handle("get-labels-formats", async () => {
    try {
      const templatesPath = getTemplatesPath();

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

  ipcMain.handle("delete-label-format", async (_event, name: string) => {
    const filename = getTemplateFileName(name);
    if (!filename) {
      return { status: false, message: "backend.labels.INVALID_TEMPLATE_NAME" };
    }

    try {
      await unlink(path.join(getTemplatesPath(), filename));
      return { status: true, message: "backend.labels.TEMPLATE_DELETED" };
    } catch (error) {
      return {
        status: false,
        message: "backend.labels.ERROR_DELETING_TEMPLATE",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
