export {};

declare global {
  interface PartPayload {
    Part_Number: string;
    Part_Description: string;
    Serial_Prefix: string;
    Label_Format: string;
  }

  type PartsSource = "server" | "local";

  interface LocalPart {
    Operation: string;
    Part_Number: string;
    Part_Description: string;
    Serial_Prefix: string;
    Label_Format: string;
  }

  interface PartsConfig {
    source: PartsSource;
    operation: string;
    server: string;
    configPath: string;
    localParts: LocalPart[];
  }

  interface PartsConfigResponse {
    status: boolean;
    message: string;
    data?: PartsConfig;
    rawError?: string;
  }

  interface SavePartsConfigResponse {
    status: boolean;
    message: string;
    rawError?: string;
  }

  type PrinterMode = "single" | "multiple";

  interface PrinterRoutingConfig {
    mode: PrinterMode;
    formatAssignments: Record<string, string>;
  }

  type PrinterPayload =
    | {
        name?: string;
        type: "IP";
        ip: string;
        port?: number;
      }
    | {
        name?: string;
        type: "COM";
        comPort: string;
        baudRate?: number;
      }
    | {
        name?: string;
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

      GetPartsConfig: () => Promise<PartsConfigResponse>;

      SavePartsConfig: (
        config: PartsConfig,
      ) => Promise<SavePartsConfigResponse>;

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
        data?: {
          name: string;
          data: string;
        }[];
        message?: string;
      }>;

      GetLabelZPL: (name: string) => Promise<{
        status: boolean;
        data?: string;
        message?: string;
      }>;

      GetLabelPreview: (nameOrZpl: string) => Promise<{
        status: boolean;
        data?: string;
        message?: string;
      }>;

      SaveLabelFormat: (
        name: string,
        data: string,
      ) => Promise<{
        status: boolean;
        message?: string;
      }>;

      DeleteLabelFormat: (name: string) => Promise<{
        status: boolean;
        message?: string;
      }>;

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
        printerMode?: PrinterMode;
        totalPrinters?: number;
        readyPrinters?: number;
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
        data?: PrinterPayload & { printers?: PrinterPayload[] };
      }>;

      SavePrinterConfig: (payload: PrinterPayload) => Promise<{
        status: boolean;
        message?: string;
      }>;

      DeletePrinterConfig: (name: string) => Promise<{
        status: boolean;
        message?: string;
      }>;

      SetActivePrinter: (name: string) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
      }>;

      GetPrinterRoutingConfig: () => Promise<{
        status: boolean;
        message?: string;
        data?: PrinterRoutingConfig;
      }>;

      SavePrinterRoutingConfig: (payload: PrinterRoutingConfig) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
      }>;

      TestPrinterConnection: (payload?: PrinterPayload) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
        auditPersisted?: boolean;
        auditStatusMessage?: string;
      }>;

      // App / Settings
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

      SetAutoUpdateSetting: (enabled: boolean) => Promise<{
        status: boolean;
        enabled?: boolean;
        message?: string;
      }>;

      GetDatabaseConfig: () => Promise<{
        status: boolean;
        data?: DatabasePayload;
        message?: string;
      }>;

      SaveDatabaseConfig: (payload: DatabasePayload) => Promise<{
        status: boolean;
        message?: string;
        rawError?: string;
      }>;

      // Auth
      Login: (payload: { login: string; password: string }) => Promise<{
        status: boolean;
        message?: string;
        data?: {
          FullName: string;
          department: string;
          title: string;
          canEdit: boolean;
          canConfigurePrinter: boolean;
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

      LogRendererError: (errorInfo: {
        message: string;
        stack?: string;
        componentStack?: string;
      }) => Promise<void>;

      // Events
      OnPrinterStatusChanged: (
        callback: (status: {
          status: boolean;
          reachable: boolean;
          ready: boolean;
          detailsAvailable: boolean;
          data?: PrinterStatusDetails;
          message?: string;
          rawError?: string;
          printerMode?: PrinterMode;
          totalPrinters?: number;
          readyPrinters?: number;
        }) => void,
      ) => () => void;

      OnUpdateAvailable: (callback: () => void) => () => void;

      OnDownloadProgress: (
        callback: (data: { percent: number }) => void,
      ) => () => void;

      OnUpdateDownloaded: (callback: () => void) => () => void;
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
    password?: string;
    hasPassword?: boolean;
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

      duplicateFamilies: Array<{
        name: string;
        count: number;
      }>;

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
      name: string;
      active: boolean;
      type: "IP" | "COM" | "USB";
      target: string;
    };

    printerMode: "single" | "multiple";

    printers: Array<{
      status: boolean;
      reachable: boolean;
      ready: boolean;
      detailsAvailable: boolean;
      message: string;
      rawError?: string;
      data?: PrinterStatusDetails;
      name: string;
      active: boolean;
      type: "IP" | "COM" | "USB";
      target: string;
    }>;

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
