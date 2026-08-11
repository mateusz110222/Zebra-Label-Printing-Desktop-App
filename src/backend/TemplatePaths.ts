import { app } from "electron";
import path from "node:path";

export const getTemplatesPath = (): string =>
  app.isPackaged
    ? path.join(path.dirname(app.getPath("exe")), "zpl_templates")
    : path.join(app.getAppPath(), "zpl_templates");
