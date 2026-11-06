import { ipcMain, IpcMainInvokeEvent } from "electron";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { getZplTemplate, SaveZplTemplate } from "../../hooks/ZPLService";
import GetJulianDate from "../../hooks/GetJulianDate";
import GetCmcJulianDate from "../../hooks/GetCmcJulianDate";
import GetBmsDate from "../../hooks/GetBmsDate";
import {
  disableReprintAfterError,
  fillZplTemplate,
} from "../../hooks/LabelProcessor";
import { beginPrinterBatch } from "../../printer/PrinterActivity";
import { findPrinterForLabelFormat } from "../../printer/PrinterConfigs";
import { sendToPrinter } from "../../printer/sendToPrinter";
import { isPreviewAuthorized } from "../../auth/IsAutorized";
import {
  appendAuditLog,
  canViewAuditLogs,
  checkAuditLogWritable,
} from "../../audit/AuditLog";
import { notifyTemplatesChanged } from "../../parts/TemplateEvents";
import {
  getTemplatesPath,
  normalizeTemplateFileName,
  queueTemplateWrite,
} from "../../system/TemplatePaths";

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
    "get-label-edit-permission",
    (event) => isPreviewAuthorized(event) && canViewAuditLogs(),
  );

  ipcMain.handle(
    "print-label-format-test",
    async (event, name: unknown, input: unknown) => {
      if (!isPreviewAuthorized(event)) {
        return { status: false, message: "backend.audit.unauthorized" };
      }
      if (typeof name !== "string" || !normalizeTemplateFileName(name)) {
        return {
          status: false,
          message: "backend.labels.INVALID_TEMPLATE_NAME",
        };
      }
      const editable = canViewAuditLogs();
      const formatName = name.trim();
      let target = findPrinterForLabelFormat(formatName);
      const baseName = formatName.replace(/\.(?:zpl|txt)$/i, "");
      if (
        !target.status &&
        target.message === "backend.printer.format_not_assigned" &&
        baseName !== formatName
      ) {
        target = findPrinterForLabelFormat(baseName);
      }
      if (!target.status) return target;

      let finish: (() => void) | undefined;
      try {
        finish = await beginPrinterBatch();
        const auditStorage = await checkAuditLogWritable();
        if (!auditStorage.status) return auditStorage;

        let template = input;
        if (!editable || !canViewAuditLogs()) {
          const saved = await getZplTemplate(formatName);
          if (!saved.status) return saved;
          template = saved.data;
        }
        if (
          typeof template !== "string" ||
          !/^\^XA[\s\S]*\^XZ$/i.test(template.trim()) ||
          template.match(/\^X[AZ]/gi)?.length !== 2
        ) {
          return {
            status: false,
            message: "label_editor.print_invalid_format",
          };
        }
        if (Buffer.byteLength(template, "utf8") > MAX_ZPL_SIZE) {
          return {
            status: false,
            message: "backend.labeledit.template_too_large",
          };
        }

        const julianDate = GetJulianDate("");
        const zpl = disableReprintAfterError(
          fillZplTemplate(template.trim(), {
            PARTNUM: "TEST",
            SERIALPREFIX: "TEST",
            SERIALNUM1: "0001",
            JDATE: julianDate,
            CMCJDATE: GetCmcJulianDate(julianDate),
            BMSCSTDATEF: GetBmsDate(""),
            NUMCOPIES: 1,
            DESCRIPTION: "TEST",
            ID_LABEL: "TEST",
          }),
        )
          .replace(/\^PQ[^^~\r\n]*/gi, "")
          .replace(/\^XZ/i, "^PQ1,0,0,N^XZ");

        const result = await sendToPrinter(zpl, target.printer);
        const auditPersisted = await appendAuditLog({
          category: "print",
          action: result.status
            ? "TEST_LABEL_DATA_SENT"
            : "TEST_LABEL_DATA_FAILED",
          status: result.status ? "success" : "failure",
          details: {
            labelFormat: formatName,
            printMode: "test",
            printerMessage: result.message,
          },
        });
        return auditPersisted
          ? result
          : { ...result, rawError: "backend.audit.storage_unavailable" };
      } catch (error) {
        return {
          status: false,
          message: "backend.printer.send_error",
          rawError: error instanceof Error ? error.message : String(error),
        };
      } finally {
        finish?.();
      }
    },
  );

  ipcMain.handle(
    "get-label-zpl",
    async (event: IpcMainInvokeEvent, formatName: string) => {
      if (event?.sender && !isPreviewAuthorized(event)) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
        };
      }
      const templateResult = await getZplTemplate(formatName);
      if (!templateResult.status || templateResult.data == null) {
        return templateResult;
      }
      return {
        status: true,
        message: "backend.labels.TEMPLATE_LOADED",
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

          if (Buffer.byteLength(rawZpl, "utf8") > MAX_ZPL_SIZE) {
            return {
              status: false,
              message: "backend.labeledit.template_too_large",
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

        if (Buffer.byteLength(formatName, "utf8") > MAX_ZPL_SIZE) {
          return {
            status: false,
            message: "backend.labeledit.template_too_large",
            data: null,
          };
        }

        let Label_ZPL: string;
        if (/^\^XA/i.test(formatName.trim())) {
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

      const filename = normalizeTemplateFileName(formatName);
      if (!filename)
        return {
          status: false,
          message: "backend.labels.INVALID_TEMPLATE_NAME",
        };
      return queueTemplateWrite(async () => {
        const auditStorage = await checkAuditLogWritable();
        if (!auditStorage.status) return auditStorage;
        const previous = await getZplTemplate(formatName);
        if (!previous.status && !previous.templateMissing) return previous;
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

        const previousZpl = previous?.status ? previous.data : undefined;
        const previousLines = previousZpl?.split(/\r?\n/) ?? [];
        const nextLines = data.split(/\r?\n/);
        let start = 0;
        while (
          start < previousLines.length &&
          start < nextLines.length &&
          previousLines[start] === nextLines[start]
        )
          start++;
        let oldEnd = previousLines.length;
        let newEnd = nextLines.length;
        while (
          oldEnd > start &&
          newEnd > start &&
          previousLines[oldEnd - 1] === nextLines[newEnd - 1]
        ) {
          oldEnd--;
          newEnd--;
        }
        const snapshot = (
          zpl: string,
          lines: string[],
        ): { sizeBytes: number; checksum: string; zplExcerpt: string } => {
          const excerpt = lines.join("\n");
          return {
            sizeBytes: Buffer.byteLength(zpl, "utf8"),
            checksum: createHash("sha256").update(zpl).digest("hex"),
            zplExcerpt:
              excerpt.length > 1800 ? `${excerpt.slice(0, 1800)}\n…` : excerpt,
          };
        };
        const auditPersisted = await appendAuditLog({
          category: "template",
          action: "TEMPLATE_SAVED",
          status: "success",
          details: {
            name: formatName,
            sizeBytes: Buffer.byteLength(data, "utf8"),
            before:
              previousZpl === undefined
                ? null
                : snapshot(previousZpl, previousLines.slice(start, oldEnd)),
            after: snapshot(data, nextLines.slice(start, newEnd)),
          },
        });
        if (!auditPersisted) {
          try {
            if (previousZpl === undefined)
              await unlink(path.join(getTemplatesPath(), filename));
            else {
              const rollback = await SaveZplTemplate(formatName, previousZpl);
              if (!rollback.status)
                throw new Error(rollback.rawError ?? rollback.message);
            }
          } catch (error) {
            notifyTemplatesChanged();
            return {
              status: false,
              message: "backend.audit.storage_unavailable",
              rawError: `Template rollback failed: ${String(error)}`,
            };
          }
          return {
            status: false,
            message: "backend.audit.storage_unavailable",
          };
        }

        notifyTemplatesChanged();
        return {
          status: true,
          message: "backend.labeledit.saved",
        };
      });
    },
  );
}
