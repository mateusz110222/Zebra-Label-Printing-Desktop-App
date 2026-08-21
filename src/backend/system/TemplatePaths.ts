import { app } from "electron";
import path from "node:path";

export const getTemplatesPath = (): string =>
  app.isPackaged
    ? path.join(path.dirname(app.getPath("exe")), "zpl_templates")
    : path.join(app.getAppPath(), "zpl_templates");

export const normalizeTemplateFileName = (name: string): string | null => {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  const withExtension = /\.(zpl|txt)$/i.test(trimmed)
    ? trimmed
    : `${trimmed}.zpl`;
  if (!/^[^\\/:*?"<>|]+\.(zpl|txt)$/i.test(withExtension)) return null;
  if (path.basename(withExtension) !== withExtension) return null;
  return withExtension;
};
