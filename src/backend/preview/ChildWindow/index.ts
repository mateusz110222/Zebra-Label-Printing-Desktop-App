import { ipcMain, IpcMainInvokeEvent } from "electron";
import sharp from "sharp";
import { getZplTemplate, SaveZplTemplate } from "../../hooks/ZPLService";
import { isPreviewAuthorized } from "../../auth/IsAutorized";
import { appendAuditLog, canViewAuditLogs } from "../../audit/AuditLog";

const MAX_ZPL_SIZE = 1024 * 1024; // 1 MB

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
  ipcMain.handle(
    "get-label-zpl",
    async (_event: IpcMainInvokeEvent, formatName: string) => {
      const templateResult = await getZplTemplate(formatName);
      if (!templateResult.status || templateResult.data == null) {
        return templateResult;
      }
      return {
        status: true,
        message: "backend.",
        data: templateResult.data,
      };
    },
  );

  ipcMain.handle(
    "get-labelFormat-preview",
    async (event: IpcMainInvokeEvent, input: string | { zpl: string }) => {
      if (!isPreviewAuthorized(event)) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }
      try {
        const rawZpl =
          typeof input === "object" && input !== null ? input.zpl : undefined;
        const formatName = typeof input === "string" ? input : "";

        if (rawZpl !== undefined) {
          if (typeof rawZpl !== "string" || rawZpl.trim().length === 0) {
            return {
              status: false,
              message: "backend.child.formatName_empty",
              data: null,
            };
          }

          const finalBase64 = await renderZpl(rawZpl);
          return {
            status: true,
            message: "backend.printer.GET_LABEL_PREVIEW_SUCCESS",
            data: finalBase64,
          };
        }

        if (formatName.trim().length === 0) {
          return {
            status: false,
            message: "backend.child.formatName_empty",
            data: null,
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
    },
  );
  ipcMain.handle(
    "save-labelformat",
    async (event: IpcMainInvokeEvent, formatName, data) => {
      if (!isPreviewAuthorized(event) || !canViewAuditLogs()) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }

      if (typeof formatName !== "string" || typeof data !== "string") {
        return {
          status: false,
          message: "backend.labeledit.saved_failed",
        };
      }

      if (formatName.trim().length === 0 || data.trim().length === 0) {
        return {
          status: false,
          message: "backend.labeledit.saved_failed",
        };
      }

      if (Buffer.byteLength(data, "utf8") > MAX_ZPL_SIZE) {
        return {
          status: false,
          message: "backend.labeledit.template_too_large",
        };
      }

      const response = await SaveZplTemplate(formatName, data);

      if (!response.status) {
        await appendAuditLog({
          category: "template",
          action: "TEMPLATE_SAVED",
          status: "failure",
          details: {
            name: formatName,
            error: response.rawError || response.message,
          },
        });
        return response;
      }

      await appendAuditLog({
        category: "template",
        action: "TEMPLATE_SAVED",
        status: "success",
        details: {
          name: formatName,
          sizeBytes: Buffer.byteLength(data, "utf8"),
        },
      });

      return {
        status: true,
        message: "backend.labeledit.saved",
      };
    },
  );
}
