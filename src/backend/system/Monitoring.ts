import { app, ipcMain, net } from "electron";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import {
  acknowledgeMonitoringBatch,
  canViewAuditLogs,
  readMonitoringBatch,
} from "../audit/AuditLog";
import { isMainRendererAuthorized } from "../auth/IsAutorized";
import { getLatestFleetStatus } from "../printer/PrinterStatusService";

export interface MonitoringConfig {
  url: string;
  stationId: string;
  token: string;
  synthetic: boolean;
}

const configPath = (): string =>
  path.join(app.getPath("userData"), "monitoring.json");

export function parseConfig(input: unknown): MonitoringConfig {
  if (typeof input !== "object" || input === null)
    throw new Error("Invalid monitoring configuration");
  const { url, stationId, token, synthetic } =
    input as Partial<MonitoringConfig>;
  const origin =
    typeof url === "string" && url.length <= 2048 ? new URL(url.trim()) : null;
  if (
    !origin ||
    (origin.protocol !== "https:" && origin.protocol !== "http:") ||
    origin.href !== origin.origin + "/" ||
    typeof stationId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(stationId.trim()) ||
    typeof token !== "string" ||
    !/^[a-zA-Z0-9_-]{32,256}$/.test(token)
  )
    throw new Error("Invalid monitoring configuration");
  return {
    url: origin.origin,
    stationId: stationId.trim(),
    token,
    synthetic: synthetic === true,
  };
}

export async function readConfig(): Promise<MonitoringConfig | null> {
  try {
    return parseConfig(JSON.parse(await readFile(configPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeMonitoringConfig(
  config: MonitoringConfig | null,
): Promise<void> {
  const destination = configPath();
  if (config === null) {
    await unlink(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  const temporary = destination + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export function setupMonitoringConfig(): void {
  const unauthorized = { status: false, message: "backend.audit.unauthorized" };
  let saving = false;
  ipcMain.handle("get-monitoring-config", async (event) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs())
      return unauthorized;
    try {
      const config = await readConfig();
      if (!config) return { status: true, data: null };
      const { url, stationId, synthetic } = config;
      return {
        status: true,
        data: { url, stationId, synthetic, hasToken: true },
      };
    } catch {
      return { status: false, message: "monitoring.read_error" };
    }
  });

  ipcMain.handle("save-monitoring-config", async (event, input: unknown) => {
    if (!isMainRendererAuthorized(event) || !canViewAuditLogs())
      return unauthorized;
    if (saving) return { status: false, message: "monitoring.save_error" };
    saving = true;
    try {
      let config: MonitoringConfig;
      try {
        const draft = input as Partial<MonitoringConfig> | null;
        if (draft?.token === "") {
          const previous = await readConfig();
          if (!previous)
            return { status: false, message: "monitoring.token_required" };
          config = parseConfig({ ...draft, token: previous.token });
          if (
            config.url !== previous.url ||
            config.stationId !== previous.stationId ||
            config.synthetic !== previous.synthetic
          ) {
            return { status: false, message: "monitoring.token_required" };
          }
        } else {
          config = parseConfig(input);
        }
      } catch {
        return { status: false, message: "monitoring.invalid" };
      }
      if (!canViewAuditLogs()) return unauthorized;
      await writeMonitoringConfig(config);
      return { status: true };
    } catch {
      return { status: false, message: "monitoring.save_error" };
    } finally {
      saving = false;
    }
  });
}

export function startMonitoring(): () => void {
  const controller = new AbortController();
  const timers: ReturnType<typeof setInterval>[] = [];

  async function start(): Promise<void> {
    const config = await readConfig();
    if (!config || controller.signal.aborted) return;
    const origin = new URL(config.url);
    const { synthetic, stationId, token } = config;

    const key =
      "monitoring:" +
      createHash("sha256")
        .update(origin.origin + "/" + stationId)
        .digest("hex");
    let syncing = false;
    let syncState = synthetic ? "synthetic" : "pending";

    async function post(
      route: "heartbeat" | "events",
      body: unknown,
    ): Promise<boolean> {
      const response = await net.fetch(
        new URL("/monitoring/v1/" + route, origin).href,
        {
          method: "POST",
          credentials: "omit",
          redirect: "error",
          headers: {
            authorization: "Bearer " + token,
            "content-type": "application/json",
            "x-station-id": stationId,
          },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
          body: JSON.stringify(body),
        },
      );
      if (response.status === 204) return true;
      if (route === "events" && [413, 422].includes(response.status))
        return false;
      throw new Error("Monitoring HTTP " + response.status);
    }

    async function sync(): Promise<void> {
      if (syncing || synthetic || controller.signal.aborted) return;
      syncing = true;
      try {
        const cutoff = new Date();
        const day = cutoff.getUTCDate();
        cutoff.setUTCDate(1);
        cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
        const lastDay = new Date(
          Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
        ).getUTCDate();
        cutoff.setUTCDate(Math.min(day, lastDay));
        for (let batch = 0; batch < 10 && !controller.signal.aborted; batch++) {
          const { through, events } = await readMonitoringBatch(
            key,
            cutoff.toISOString(),
          );
          if (!events.length) {
            syncState = "current";
            return;
          }
          syncState = "pending";
          if (!(await post("events", { events }))) {
            for (const event of events) {
              if (!(await post("events", { events: [event] }))) {
                console.warn(
                  "Monitoring rejected an event kept in local history",
                  event.id,
                );
              }
            }
          }
          await acknowledgeMonitoringBatch(key, through);
        }
      } catch {
        syncState = "error";
      } finally {
        syncing = false;
      }
    }

    async function heartbeat(): Promise<void> {
      const latest = synthetic ? undefined : getLatestFleetStatus();
      await post("heartbeat", {
        name: synthetic ? "Pilot test" : os.hostname(),
        version: synthetic ? "test" : app.getVersion(),
        checkedAt: latest?.checkedAt ?? null,
        printer: latest
          ? {
              reachable: latest.status.reachable,
              ready: latest.status.ready,
              total: latest.status.totalPrinters,
              readyCount: latest.status.readyPrinters,
            }
          : null,
        syncState,
      }).catch(() => undefined);
    }

    void heartbeat();
    void sync();
    timers.push(setInterval(() => void heartbeat(), 30000));
    timers.push(setInterval(() => void sync(), 15000));
  }

  void start().catch(() => {
    console.error("Unable to load monitoring.json");
  });
  return () => {
    controller.abort();
    for (const timer of timers) clearInterval(timer);
  };
}
