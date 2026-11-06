import { beforeEach, expect, it, vi } from "vitest";
import { setupMonitoringConfig, startMonitoring } from "../system/Monitoring";

const mocks = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: unknown, input?: unknown) => Promise<unknown>
  >(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  isIt: vi.fn(),
  isMain: vi.fn(),
  fetch: vi.fn(),
  readBatch: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath: () => "C:/station", getVersion: () => "1.4.7" },
  net: { fetch: mocks.fetch },
  ipcMain: {
    handle: (channel: string, handler: never) =>
      mocks.handlers.set(channel, handler),
  },
}));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  rename: mocks.rename,
  unlink: mocks.unlink,
}));
vi.mock("../auth/IsAutorized", () => ({
  isMainRendererAuthorized: mocks.isMain,
}));
vi.mock("../audit/AuditLog", () => ({
  canViewAuditLogs: mocks.isIt,
  readMonitoringBatch: mocks.readBatch,
  acknowledgeMonitoringBatch: mocks.acknowledge,
}));
vi.mock("../printer/PrinterStatusService", () => ({
  getLatestFleetStatus: vi.fn(),
}));

const config = {
  url: "https://monitor.example.internal",
  stationId: "station-1",
  token: "x".repeat(64),
  synthetic: false,
};
const load = (): Promise<unknown> =>
  mocks.handlers.get("get-monitoring-config")!({});
const save = (input: unknown): Promise<unknown> =>
  mocks.handlers.get("save-monitoring-config")!({}, input);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isIt.mockReturnValue(true);
  mocks.isMain.mockReturnValue(true);
  mocks.readFile.mockResolvedValue(JSON.stringify(config));
  mocks.unlink.mockResolvedValue(undefined);
  setupMonitoringConfig();
});

it("keeps a rejected legacy event locally and delivers the next valid event", async () => {
  const old = { id: "legacy-without-action" };
  const next = { id: "print", action: "LABEL_DATA_SENT" };
  mocks.readBatch
    .mockResolvedValueOnce({ through: 2, events: [old, next] })
    .mockResolvedValue({ through: 2, events: [] });
  mocks.fetch
    .mockResolvedValueOnce({ status: 204 })
    .mockResolvedValueOnce({ status: 422 })
    .mockResolvedValueOnce({ status: 422 })
    .mockResolvedValueOnce({ status: 204 });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const stop = startMonitoring();
  try {
    await vi.waitFor(() =>
      expect(mocks.acknowledge).toHaveBeenCalledWith(expect.any(String), 2),
    );
    const sent = mocks.fetch.mock.calls
      .filter(([url]) => String(url).endsWith("/events"))
      .map(([, request]) => JSON.parse(request.body).events);
    expect(sent).toEqual([[old, next], [old], [next]]);
    expect(warning).toHaveBeenCalledWith(expect.any(String), old.id);
  } finally {
    stop();
    warning.mockRestore();
  }
});

it("does not acknowledge events on a temporary server failure", async () => {
  mocks.readBatch.mockResolvedValue({ through: 1, events: [{ id: "retry" }] });
  mocks.fetch.mockResolvedValue({ status: 503 });
  const stop = startMonitoring();
  try {
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});

it("loads an existing configuration without exposing the token", async () => {
  expect(await load()).toEqual({
    status: true,
    data: {
      url: config.url,
      stationId: config.stationId,
      synthetic: false,
      hasToken: true,
    },
  });
});

it.each(["https://monitor.example.internal", "http://10.142.11.66:8083"])(
  "allows IT to save production monitoring at %s",
  async (url) => {
    expect(await save({ ...config, url })).toEqual({ status: true });
    expect(JSON.parse(mocks.writeFile.mock.calls[0][1])).toEqual({
      ...config,
      url,
    });
    expect(mocks.rename).toHaveBeenCalledOnce();
  },
);

it.each([
  "ftp://monitor.example.internal",
  "file:///tmp/monitor",
  "http://user:password@monitor.example.internal",
  "http://monitor.example.internal/path",
])("rejects unsupported URLs or embedded credentials: %s", async (url) => {
  expect(await save({ ...config, url })).toMatchObject({ status: false });
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it("requires a new token when switching to another server", async () => {
  expect(
    await save({ ...config, url: "https://other.example.internal", token: "" }),
  ).toEqual({
    status: false,
    message: "monitoring.token_required",
  });
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it("requires both an authorized window and an IT session", async () => {
  mocks.isIt.mockReturnValue(false);
  expect(await load()).toMatchObject({ status: false });
  expect(await save(config)).toMatchObject({ status: false });
  mocks.isIt.mockReturnValue(true);
  mocks.isMain.mockReturnValue(false);
  expect(await save(config)).toMatchObject({ status: false });
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
