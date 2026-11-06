import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsBackup, {
  parseSettingsBackup,
  type SettingsBackupData,
} from "../config/SettingsBackup";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown>>(),
  get: vi.fn(),
  set: vi.fn(),
  state: {} as Record<string, unknown>,
  saveDialog: vi.fn(),
  openDialog: vi.fn(),
  open: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  authorized: vi.fn(),
  admin: vi.fn(),
  audit: vi.fn(),
  writable: vi.fn(),
  readMonitoring: vi.fn(),
  writeMonitoring: vi.fn(),
  closeDatabase: vi.fn(),
  busy: vi.fn(),
  resume: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: never) =>
      mocks.handlers.set(channel, handler),
  },
  dialog: {
    showSaveDialog: mocks.saveDialog,
    showOpenDialog: mocks.openDialog,
  },
}));
vi.mock("node:fs/promises", () => ({
  open: mocks.open,
  writeFile: mocks.writeFile,
  rename: mocks.rename,
  unlink: mocks.unlink,
}));
vi.mock("../utils/store", () => ({
  store: {
    get: mocks.get,
    set: mocks.set,
    get store() {
      return mocks.state;
    },
    set store(value) {
      mocks.state = value;
    },
  },
}));
vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized: mocks.authorized,
}));
vi.mock("../audit/AuditLog", () => ({
  canViewAuditLogs: mocks.admin,
  canConfigurePrinter: mocks.admin,
  appendAuditLog: mocks.audit,
  checkAuditLogWritable: mocks.writable,
}));
vi.mock("../config/DatabaseConfig", () => ({
  closeDatabase: mocks.closeDatabase,
  decryptDatabasePassword: (value: string) => value.replace("encrypted:", ""),
  encryptDatabasePassword: (value: string) =>
    value ? "encrypted:" + value : "",
}));
vi.mock("../system/Monitoring", () => ({
  parseConfig: (value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("invalid");
    return value;
  },
  readConfig: mocks.readMonitoring,
  writeMonitoringConfig: mocks.writeMonitoring,
}));
vi.mock("../printer/PrinterActivity", () => ({
  isPrintQueueBusy: mocks.busy,
  pausePrintsForUpdate: () => mocks.resume,
}));

const backup = (): SettingsBackupData & {
  application: string;
  version: number;
} => ({
  application: "zebra-label-printing",
  version: 1,
  settings: {
    printer: { type: "IP", ip: "192.168.1.5", port: 9100 },
    printers: [{ name: "USB", type: "USB", usbPrinterName: "Zebra" }],
    printerRouting: { mode: "multiple", formatAssignments: { label: "USB" } },
    database: {
      host: "localhost",
      user: "test",
      password: "secret",
      database: "labels",
    },
    parts: {
      source: "local",
      operation: "",
      server: "",
      configPath: "",
      localParts: [],
    },
    autoUpdate: false,
  },
  monitoring: null,
});
const run = (action: string): Promise<unknown> =>
  mocks.handlers.get(`${action}-settings-backup`)!({});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { original: "settings" };
  mocks.authorized.mockReturnValue(true);
  mocks.admin.mockReturnValue(true);
  mocks.audit.mockResolvedValue(true);
  mocks.writable.mockResolvedValue({ status: true });
  mocks.readMonitoring.mockResolvedValue(null);
  mocks.writeMonitoring.mockResolvedValue(undefined);
  mocks.unlink.mockResolvedValue(undefined);
  mocks.get.mockImplementation((key: string) => backup().settings[key]);
  mocks.saveDialog.mockResolvedValue({ filePath: "backup.json" });
  mocks.openDialog.mockResolvedValue({ filePaths: ["backup.json"] });
  mocks.open.mockResolvedValue({
    stat: async () => ({ size: 1024 }),
    readFile: async () => JSON.stringify(backup()),
    close: vi.fn(),
  });
  SettingsBackup();
});

describe("settings backup validation", () => {
  it("round trips configured and empty settings without importing extra keys", () => {
    expect(parseSettingsBackup(backup()).settings).toMatchObject(
      backup().settings,
    );
    const empty = backup();
    empty.settings.printer.ip = "";
    Object.assign(empty.settings.database, {
      host: "",
      user: "",
      password: "",
      database: "",
    });
    Object.assign(empty.settings, { unexpected: "ignored" });
    expect(parseSettingsBackup(empty).settings).not.toHaveProperty(
      "unexpected",
    );
  });
  it.each([
    (value) => {
      value.version = 99;
    },
    (value) => {
      value.settings.printer.port = 70000;
    },
    (value) => {
      value.settings.printer.ip = "999.1.1.1";
    },
    (value) => {
      value.settings.database.password = "enc:v1:foreign";
    },
    (value) => {
      value.settings.autoUpdate = "true";
    },
    (value) => {
      value.settings.printerRouting.mode = "invalid";
    },
    (value) => {
      value.settings.parts.localParts = [null];
    },
  ])("rejects malformed configuration", (mutate) => {
    const value = backup();
    mutate(value);
    expect(() => parseSettingsBackup(value)).toThrow();
  });
});

it("exports portable credentials with a version and writes atomically", async () => {
  mocks.get.mockImplementation((key: string) =>
    key === "database"
      ? { ...backup().settings.database, password: "encrypted:secret" }
      : backup().settings[key],
  );
  expect(await run("export")).toMatchObject({ status: true });
  const contents = JSON.parse(mocks.writeFile.mock.calls[0][1]);
  expect(contents.settings.database.password).toBe("secret");
  expect(() => parseSettingsBackup(contents)).not.toThrow();
  expect(mocks.rename).toHaveBeenCalledOnce();
});

it("encrypts imported credentials locally and audits without secrets", async () => {
  expect(await run("import")).toMatchObject({ status: true });
  expect(mocks.set.mock.calls[0][0].database.password).toBe("encrypted:secret");
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "SETTINGS_IMPORTED",
      details: { version: 1 },
    }),
  );
  expect(mocks.resume).toHaveBeenCalledOnce();
});

it("rolls back settings and monitoring if the audit cannot be saved", async () => {
  mocks.audit.mockResolvedValue(false);
  expect(await run("import")).toMatchObject({ status: false });
  expect(mocks.state).toEqual({ original: "settings" });
  expect(mocks.writeMonitoring).toHaveBeenCalledTimes(2);
  expect(mocks.resume).toHaveBeenCalledOnce();
});

it("does not change settings on cancellation, invalid JSON, or oversized files", async () => {
  mocks.openDialog.mockResolvedValueOnce({ canceled: true });
  expect(await run("import")).toMatchObject({ canceled: true });
  mocks.open.mockResolvedValueOnce({
    stat: async () => ({ size: 1024 }),
    readFile: async () => "{broken",
    close: vi.fn(),
  });
  expect(await run("import")).toMatchObject({ status: false });
  mocks.open.mockResolvedValueOnce({
    stat: async () => ({ size: 11 * 1024 * 1024 }),
    close: vi.fn(),
  });
  expect(await run("import")).toMatchObject({ status: false });
  expect(mocks.set).not.toHaveBeenCalled();
});

it("rejects unauthorized users, expired sessions and active printing", async () => {
  mocks.admin.mockReturnValueOnce(false);
  expect(await run("export")).toMatchObject({ status: false });
  expect(mocks.saveDialog).not.toHaveBeenCalled();
  mocks.authorized.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect(await run("import")).toMatchObject({ status: false });
  mocks.authorized.mockReturnValue(true);
  mocks.busy.mockReturnValue(true);
  expect(await run("import")).toMatchObject({
    status: false,
    message: "settings_backup.busy",
  });
  expect(mocks.set).not.toHaveBeenCalled();
});
