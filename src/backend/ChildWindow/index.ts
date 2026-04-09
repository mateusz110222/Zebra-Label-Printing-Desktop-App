import { ipcMain } from "electron";
import sharp from "sharp";
import { getZplTemplate, SaveZplTemplate } from "../hooks/ZPLService";

const renderZpl = async (zpl: string): Promise<string> => {
  const { ready } = await import("zpl-renderer-js");
  const { api } = await ready;

  const rawBase64 = await api.zplToBase64Async(zpl, 50.6, 50.6, 24);
  const imgBuffer = Buffer.from(rawBase64, "base64");

  const trimmedBuffer = await sharp(imgBuffer).trim().toBuffer();
  const finalBase64 = trimmedBuffer.toString("base64");

  return `data:image/png;base64,${finalBase64}`;
};

export default function ChildWindowHandlers(): void {
  ipcMain.handle("get-label-zpl", async (_, formatName: string) => {
    const templateResult = await getZplTemplate(formatName);
    if (!templateResult.status || templateResult.data == null) {
      return templateResult;
    }
    return {
      status: true,
      message: "backend.",
      data: templateResult.data,
    };
  });

  ipcMain.handle("get-labelFormat-preview", async (_, formatName: string) => {
    try {
      if (formatName.trim().length === 0) {
        return {
          status: false,
          message: "backend.child.formatName_empty",
          data: null,
          rawError: "formatName missing",
        };
      }

      let Label_ZPL: string;
      if (formatName.trim().startsWith("^XA")) {
        Label_ZPL = formatName;
      } else {
        const templateResult = await getZplTemplate(formatName);
        if (!templateResult.status || templateResult.data == null) {
          return templateResult;
        }
        Label_ZPL = templateResult.data;
      }

      const finalBase64 = await renderZpl(Label_ZPL);

      return {
        status: true,
        message: "backend.printer.GET_LABEL_PREVIEW_SUCCESS",
        data: finalBase64,
      };
    } catch (error) {
      return {
        status: false,
        message: "backend.print.generate_error",
        rawError: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });
  ipcMain.handle("save-labelformat", async (_, formatName, data) => {
    if (formatName.trim().length === 0 || data.trim().length === 0) {
      return {
        status: false,
        message: "backend.labeledit.saved_failed",
      };
    }

    const response = await SaveZplTemplate(formatName, data);

    if (!response.status) {
      return response;
    }

    return {
      status: true,
      message: "backend.labeledit.saved",
    };
  });
}
