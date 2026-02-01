import { ipcMain } from "electron";
import GenerateZPLString from "./hooks/GenerateZPLString";
import sharp from "sharp";

interface LabelPreviewResponse {
  status: boolean;
  message: string;
  data: string | null;
}

export default function GetLabelPreview(): void {
  ipcMain.handle(
    "get-label-preview",
    async (_event, { part }): Promise<LabelPreviewResponse> => {
      try {
        if (!part || !part.Label_Format) {
          return {
            status: false,
            message: "Invalid part data provided",
            data: null,
          };
        }

        const result = await GenerateZPLString(part, 1, "preview");

        if (!result.status || !result.data) {
          return {
            status: false,
            message: result.message || "Error generating label preview.",
            data: null,
          };
        }

        const filledZpl = result.data;

        const { ready } = await import("zpl-renderer-js");
        const { api } = await ready;

        const rawBase64 = await api.zplToBase64Async(filledZpl, 50.6, 50.6, 24);
        const imgBuffer = Buffer.from(rawBase64, "base64");

        const trimmedBuffer = await sharp(imgBuffer).trim().toBuffer();
        const finalBase64 = trimmedBuffer.toString("base64");

        return {
          status: true,
          message: "backend.printer.GET_LABEL_PREVIEW_SUCCESS",
          data: `data:image/png;base64,${finalBase64}`,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error) || "Unable to generate label preview image.";

        return {
          status: false,
          message: errorMsg,
          data: null,
        };
      }
    },
  );
}
