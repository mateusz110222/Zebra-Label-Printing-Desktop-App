import { ipcMain } from "electron";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getTemplatesPath, normalizeTemplateFileName } from "../system/TemplatePaths";
import { appendAuditLog, canViewAuditLogs } from "../audit/AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

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

  ipcMain.handle("delete-label-format", async (event, name: string) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
      };
    }

    if (typeof name !== "string") {
      return {
        status: false,
        message: "backend.labels.INVALID_TEMPLATE_NAME",
      };
    }

    const filename = normalizeTemplateFileName(name);
    if (!filename) {
      await appendAuditLog({
        category: "template",
        action: "TEMPLATE_DELETED",
        status: "failure",
        details: { name, reason: "INVALID_TEMPLATE_NAME" },
      });
      return { status: false, message: "backend.labels.INVALID_TEMPLATE_NAME" };
    }

    try {
      await unlink(path.join(getTemplatesPath(), filename));
      await appendAuditLog({
        category: "template",
        action: "TEMPLATE_DELETED",
        status: "success",
        details: { name: filename },
      });
      return { status: true, message: "backend.labels.TEMPLATE_DELETED" };
    } catch (error) {
      await appendAuditLog({
        category: "template",
        action: "TEMPLATE_DELETED",
        status: "failure",
        details: {
          name: filename,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        status: false,
        message: "backend.labels.ERROR_DELETING_TEMPLATE",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
