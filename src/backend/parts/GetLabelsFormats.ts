import { ipcMain } from "electron";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  getTemplatesPath,
  normalizeTemplateFileName,
} from "../system/TemplatePaths";
import { appendAuditLog, canViewAuditLogs } from "../audit/AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { notifyTemplatesChanged } from "./TemplateEvents";

export default function GetLabelsFormats(): void {
  ipcMain.handle("get-labels-formats", async (event) => {
    if (event?.sender && !isMainRendererAuthorized(event)) {
      return {
        status: false,
        message: "backend.audit.unauthorized",
        data: [],
      };
    }
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
      console.error("Failed to load templates:", error);
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
      const filePath = path.join(getTemplatesPath(), filename);
      const previous = await readFile(filePath).catch(() => null);
      await unlink(filePath);
      await appendAuditLog({
        category: "template",
        action: "TEMPLATE_DELETED",
        status: "success",
        details: {
          name: filename,
          before: {
            name: filename,
            sizeBytes: previous?.length,
            checksum: previous
              ? createHash("sha256").update(previous).digest("hex")
              : undefined,
          },
          after: null,
        },
      });
      notifyTemplatesChanged();
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
