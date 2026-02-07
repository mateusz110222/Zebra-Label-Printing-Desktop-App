import { ipcMain } from "electron";
import { generatePreviewZPL, generateReprintZPL } from "./hooks/ZPLService";
import sharp from "sharp";

interface LabelPreviewResponse {
  status: boolean;
  message: string;
  data: string | null;
  rawError?: string;
}

export default function GetLabelPreview(): void {
  ipcMain.handle(
    "get-label-preview",
    async (
      _event,
      { part, date, serialNumber },
    ): Promise<LabelPreviewResponse> => {
      try {
        if (!part || !part.Label_Format) {
          return {
            status: false,
            message: "backend.print.invalid_data",
            data: null,
            rawError: "Part or Label_Format missing",
          };
        }
        const useReprint =
          (typeof serialNumber === "string" && serialNumber.trim() !== "") ||
          (typeof date === "string" && date.trim() !== "");

        let result;
        if (useReprint || (serialNumber === "0")) {
          const safeDate = date || new Date().toISOString().split("T")[0];
          const safeSN = serialNumber || "0";
          result = await generateReprintZPL(part, safeDate, safeSN, 1);
        } else {
          result = await generatePreviewZPL(part);
        }

        if (!result.status || !result.data) {
          return {
            status: false,
            message: result.message,
            rawError: result.rawError,
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
          message: "backend.print.generate_error",
          rawError: errorMsg,
          data: null,
        };
      }
    },
  );
}
