import { ipcMain } from "electron";
import {
  generatePreviewZPL,
  generateReprintPreviewZPL,
} from "../hooks/ZPLService";
import sharp from "sharp";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

interface LabelPreviewResponse {
  status: boolean;
  message: string;
  data: string | null;
  rawError?: string;
}

const MAX_ZPL_SIZE = 1024 * 1024; // 1 MB

const getLocalIsoDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function GetLabelPreview(): void {
  ipcMain.handle(
    "get-label-preview",
    async (event, payload): Promise<LabelPreviewResponse> => {
      try {
        if (event?.sender && !isMainRendererAuthorized(event)) {
          return {
            status: false,
            message: "backend.audit.unauthorized",
            data: null,
          };
        }

        const { part, date, serialNumber, zpl } = payload ?? {};

        if (!part || !part.Label_Format) {
          return {
            status: false,
            message: "backend.print.invalid_data",
            data: null,
            rawError: `Part: ${part} or Label_Format: ${part?.Label_Format} missing`,
          };
        }

        if (
          typeof zpl === "string" &&
          Buffer.byteLength(zpl, "utf8") > MAX_ZPL_SIZE
        ) {
          return {
            status: false,
            message: "backend.labeledit.template_too_large",
            data: null,
          };
        }

        const useReprint =
          (typeof serialNumber === "string" && serialNumber.trim() !== "") ||
          (typeof date === "string" && date.trim() !== "");

        let result;
        if (useReprint || serialNumber === "0") {
          const safeDate = date || getLocalIsoDate();
          const safeSN = serialNumber || "0";
          result = await generateReprintPreviewZPL(part, safeDate, safeSN);
        } else {
          result = await generatePreviewZPL(part, zpl);
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
