import { ipcMain } from "electron";
import { readdirSync } from "node:fs";

export default function GetLabelsFormats(): void {
  ipcMain.handle("get-labels-formats", async () => {
    const path_to_templates = "zpl_templates";

    const filenames = readdirSync(path_to_templates);

    const files = await Promise.all(
      filenames.map(async (filename) => {
        const zpl_template = await import("../../zpl_templates/" + filename);
        const data = zpl_template.default;
        return { name: filename, data: data };
      }),
    );

    return {
      status: true,
      message: "backend.labels.TEMPLATES_FOUND",
      data: files,
    };
  });
}
