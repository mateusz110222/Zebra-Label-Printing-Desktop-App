export {};

declare global {
  interface PartPayload {
    Part_Number: string;
    Part_Description: string;
    Serial_Prefix: string;
    Label_Format: string;
  }

  type PrinterPayload =
    | {
    type: "IP";
    ip: string;
    port?: number;
  }
    | {
    type: "COM";
    comPort: string;
    baudRate?: number;
  }
    | {
    type: "USB";
    usbPrinterName: string;
  };

  interface Window {
    api: {
      // Parts and ZPL
      GetParts: (Label_Format?: string) => Promise<{
        status: boolean;
        data?: PartPayload[];
        message?: string;
        rawError?: string;
      }>;
      GetPartsConfig: () => Promise<{
        source: "server" | "local";
        operation: string;
        localParts: Array<{
          Operation: string;
          Part_Number: string;
          Part_Description: string;
          Serial_Prefix: string;
          Label_Format: string;
        }>;
      }>;
      SavePartsConfig: (config: {
        source: "server" | "local";
        operation: string;
        localParts: Array<{
          Operation: string;
          Part_Number: string;
          Part_Description: string;
          Serial_Prefix: string;
          Label_Format: string;
        }>;
      }) => Promise<{ status: boolean; message?: string }>;
      GetPrintPreview: (payload: {
        part: PartPayload;
        date: string;
        serialNumber: string;
        zpl?: string;
      }) => Promise<{
        status: boolean;
        data?: string;
        message?: string;
        rawError?: string;
      }>;
      GetLabelsFormats: () => Promise<{
        status: boolean;
        data?: { name: string; data: string }[];
        message?: string;
      }>;
      GetLabelZPL: (
        name: string
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      GetLabelPreview: (
        nameOrZpl: string
      ) => Promise<{ status: boolean; data?: string; message?: string }>;
      SaveLabelFormat: (
        name: string,
        data: string
      ) => Promise<{ status: boolean; message?: string }>;
      DeleteLabelFormat: (
        name: string
      ) => Promise<{ status: boolean; message?: string }>;
      GetTemplateEditAccess: () => Promise<{ status: boolean }>;

      // Printing
      PrintLabel: (payload: {
        part: PartPayload;
        quantity: number;
      }) => Promise<PrintLabelResult>;
      ReprintLabel: (payload: {
        part: PartPayload;
        quantity: number;
        serialNumber: string;
        date: string;
      }) => Promise<PrintLabelResult>;
      GetPrinterStatus: () => Promise<{
        status: boolean;
        reachable: boolean;
        ready: boolean;
        detailsAvailable: boolean;
        data?: PrinterStatusDetails;
        message?: string;
        rawError?: string;
      }>;
      GetSystemHealth: () => Promise<{
        status: boolean;
        data?: SystemHealthData;
        message?: string;
      }>;
      GetSerialPorts: () => Promise<{
        status: boolean;
        data?: string[];
        message?: string;
      }>;
      GetUsbPrinters: () => Promise<{
        status: boolean;
        data?: Array<{
          name: string;
          portName: string;
          driverName: string;
          workOffline: boolean;
          printerStatus: number;
        }>;
        message?: string;
        rawError?: string;
      }>;
      GetPrinterConfig: () => Promise<{
        status: boolean;
        message?: string;
        data?: PrinterPayload;
      }>;
      SavePrinterConfig: (
        payload: PrinterPayload
      ) => Promise<{ status: boolean; message?: string }>;
      TestPrinterConnection: (payload?: PrinterPayload) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
        auditPersisted?: boolean;
        auditStatusMessage?: string;
      }>;

      GetAppVersion: () => Promise<string>;
      GetGithubVersion: () => Promise<{
        status: boolean;
        message: string;
        rawError?: string;
        data?: string;
      }>;
      CheckForUpdates: () => Promise<{
        status?: boolean;
        updateAvailable?: boolean;
        version?: string;
        message?: string;
      }>;
      RestartApp: () => void;
      GetAutoUpdateSetting: () => Promise<boolean>;
      SetAutoUpdateSetting: (
        enabled: boolean
      ) => Promise<{ status: boolean; enabled?: boolean; message?: string }>;
      GetDatabaseConfig: () => Promise<{
        status: boolean;
        data?: DatabasePayload;
        message?: string;
      }>;
      SaveDatabaseConfig: (
        payload: DatabasePayload
      ) => Promise<{ status: boolean; message?: string; rawError?: string }>;

      // Auth
      Login: (payload: { login: string; password: string }) => Promise<{
        status: boolean;
        message?: string;
        data?: {
          FullName: string;
          department: string;
          title: string;
          canEdit: boolean;
        };
        rawError?: string;
      }>;
      Logout: () => Promise<void>;

      // Audit history
      GetAuditLogs: (query: AuditLogQuery) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
        data?: {
          entries: AuditLogEntry[];
          total: number;
          page: number;
          pageSize: number;
        };
      }>;
      ExportAuditLogs: (query: AuditLogQuery) => Promise<{
        status: boolean;
        canceled?: boolean;
        filePath?: string;
        message?: string;
        rawError?: string;
      }>;

      // Events
      OnUpdateAvailable: (callback: () => void) => () => void;
      OnDownloadProgress: (
        callback: (data: { percent: number }) => void
      ) => () => void;
      OnUpdateDownloaded: (callback: () => void) => () => void;
      RemoveAllListeners: (channel: string) => void;
    };
  }

  interface AuditLogQuery {
    scope?: "all" | "print" | "audit";
    category?: "all" | "print" | "auth" | "config" | "template" | "system";
    status?: "all" | "success" | "failure";
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }

  interface DatabasePayload {
    host: string;
    user: string;
    password: string;
    database: string;
  }

  interface PrintLabelResult {
    status: boolean;
    message?: string;
    rawError?: string;
    deliveryStatus?: "sent" | "failed";
    serialStart?: string;
    serialEnd?: string;
    julianDate?: string;
    bmsDate?: string;
    quantity?: number;
    printerReachable?: boolean;
    printerReady?: boolean;
    printerStatusMessage?: string;
    auditPersisted?: boolean;
    auditStatusMessage?: string;
  }

  interface PrinterStatusDetails {
    paperOut: boolean;
    paused: boolean;
    headOpen: boolean;
    ribbonOut: boolean;
    bufferFull: boolean;
    underTemperature: boolean;
    overTemperature: boolean;
    formatsInBuffer: number;
    labelsRemaining: number;
  }

  interface SystemHealthData {
    overallStatus: "healthy" | "warning" | "error";
    checkedAt: string;
    database: {
      status: boolean;
      reachable: boolean;
      configuredHost: string;
      configuredDatabase: string;
      serverHostname: string;
      databaseName: string;
      engine: string | null;
      engineOk: boolean;
      duplicateFamilies: Array<{ name: string; count: number }>;
      timeDriftMs: number | null;
      message: string[];
      rawError?: string;
    };
    printer: {
      status: boolean;
      reachable: boolean;
      ready: boolean;
      detailsAvailable: boolean;
      message: string;
      rawError?: string;
      data?: PrinterStatusDetails;
      type: "IP" | "COM" | "USB";
      target: string;
    };
    templates: {
      status: boolean;
      path: string;
      count: number;
      message: string;
      rawError?: string;
    };
    audit: {
      status: boolean;
      path: string;
      message: string;
      lastFailureAt: string | null;
      rawError?: string;
    };
  }

  interface AuditLogEntry {
    id: string;
    timestamp: string;
    category: "print" | "auth" | "config" | "template" | "system";
    action: string;
    status: "success" | "failure";
    actor: string;
    workstation: string;
    appVersion: string;
    details: Record<string, string | number | boolean | null>;
  }
}
