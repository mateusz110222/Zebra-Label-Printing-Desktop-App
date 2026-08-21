import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { AuditLogEntry, AuditLogQuery, canViewAuditLogs, readAuditLogs } from "./AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

const csvCell = (value: unknown): string =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const toCsv = (entries: AuditLogEntry[]): string => {
  const headers = [
    "timestamp",
    "category",
    "action",
    "status",
    "actor",
    "workstation",
    "appVersion",
    "partNumber",
    "description",
    "serialPrefix",
    "serialNumber",
    "fullSerialNumber",
    "labelFormat",
    "julianDate",
    "bmsDate",
    "selectedDate",
    "printerType",
    "printerTarget",
    "details",
  ];
  const rows = entries.map((entry) =>
    [
      entry.timestamp,
      entry.category,
      entry.action,
      entry.status,
      entry.actor,
      entry.workstation,
      entry.appVersion,
      entry.details.partNumber,
      entry.details.description,
      entry.details.serialPrefix,
      entry.details.serialNumber,
      entry.details.fullSerialNumber,
      entry.details.labelFormat,
      entry.details.julianDate,
      entry.details.bmsDate,
      entry.details.selectedDate,
      entry.details.printerType,
      entry.details.printerTarget,
      JSON.stringify(entry.details),
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${headers.join(",")}\n${rows.join("\n")}`;
};

export default function AuditLogHandlers(): void {
  ipcMain.handle(
    "get-audit-logs",
    async (event, query: AuditLogQuery = {}) => {
      if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
        return { status: false, message: "backend.audit.unauthorized" };
      }
      try {
        return { status: true, data: await readAuditLogs(query) };
      } catch (error) {
        return {
          status: false,
          message: "backend.audit.read_error",
          rawError: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "export-audit-logs",
    async (event, query: AuditLogQuery = {}) => {
      if (!isMainRendererAuthorized(event) || !canViewAuditLogs()) {
        return { status: false, message: "backend.audit.unauthorized" };
      }
      try {
        const result = await readAuditLogs({
          ...query,
          page: 1,
          pageSize: 50000,
        });
        const owner = BrowserWindow.fromWebContents(event.sender) || undefined;
        const exportName =
          query.scope === "print" ? "print-history" : "audit-logs";
        const saveResult = owner
          ? await dialog.showSaveDialog(owner, {
              title: "Export audit logs",
              defaultPath: `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`,
              filters: [{ name: "CSV", extensions: ["csv"] }],
            })
          : await dialog.showSaveDialog({
              title: "Export audit logs",
              defaultPath: `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`,
              filters: [{ name: "CSV", extensions: ["csv"] }],
            });
        if (saveResult.canceled || !saveResult.filePath)
          return { status: true, canceled: true };
        await writeFile(saveResult.filePath, toCsv(result.entries), "utf8");
        return { status: true, filePath: saveResult.filePath };
      } catch (error) {
        return {
          status: false,
          message: "backend.audit.export_error",
          rawError: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
