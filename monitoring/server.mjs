import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import pg from "pg";
import { serials, validEvent, validHeartbeat } from "./protocol.mjs";
import {
  importLegacyStations,
  stationHandler,
  stationIdentity,
} from "./stations.mjs";

const pool = new pg.Pool({
  host: "postgres",
  database: "monitoring",
  user: "monitor_ingest",
  password: process.env.INGEST_DB_PASSWORD,
  max: 10,
  statement_timeout: 15000,
});
pool.on("error", (error) =>
  console.error("PostgreSQL pool error:", error.code),
);

try {
  await importLegacyStations(
    pool,
    JSON.parse(readFileSync("/config/stations.json", "utf8")),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const manageStations = stationHandler({
  pool,
  publicUrl: process.env.PUBLIC_URL,
});

const server = createServer(async (request, response) => {
  const path = request.url;
  if (path.startsWith("/stations/") || path.startsWith("/monitoring/admin/")) {
    await manageStations(request, response);
    return;
  }
  if (
    request.method !== "POST" ||
    !["/monitoring/v1/heartbeat", "/monitoring/v1/events"].includes(path)
  ) {
    response.writeHead(404).end();
    return;
  }
  const station = request.headers["x-station-id"];
  let identity;
  try {
    identity = await stationIdentity(
      pool,
      station,
      request.headers.authorization,
    );
  } catch {
    response.writeHead(503).end();
    return;
  }
  if (!identity) {
    response.writeHead(401).end();
    return;
  }
  const heartbeat = path.endsWith("/heartbeat");
  if (!heartbeat && identity.synthetic === true) {
    response.writeHead(403).end();
    return;
  }
  let body;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > (heartbeat ? 8192 : 16 * 1024 * 1024)) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response.writeHead(400).end();
    return;
  }
  try {
    if (heartbeat) {
      if (
        !validHeartbeat(body) ||
        (identity.synthetic === true) !== (body.syncState === "synthetic")
      ) {
        response.writeHead(422).end();
        return;
      }
      if (identity.synthetic !== true) {
        await pool.query(
          "INSERT INTO stations VALUES ($1,$2,$3,now(),$4,$5,$6) ON CONFLICT (station_id) DO UPDATE SET " +
            "name=excluded.name, version=excluded.version, last_seen=excluded.last_seen, " +
            "checked_at=excluded.checked_at, printer=excluded.printer, sync_state=excluded.sync_state",
          [
            station,
            body.name,
            body.version,
            body.checkedAt,
            body.printer,
            body.syncState,
          ],
        );
      }
    } else {
      if (
        !Array.isArray(body?.events) ||
        body.events.length < 1 ||
        body.events.length > 100 ||
        !body.events.every(validEvent)
      ) {
        response.writeHead(422).end();
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const event of body.events) {
          const result = await client.query(
            "INSERT INTO events SELECT $1,$2,$3,$4,$5,$6,$7 WHERE $3::timestamptz >= now() - interval '12 months' " +
              "ON CONFLICT DO NOTHING",
            [
              station,
              event.id,
              event.timestamp,
              event.category,
              event.action,
              event.status,
              event,
            ],
          );
          if (result.rowCount && event.category === "print") {
            const values = serials(event);
            if (values.length)
              await client.query(
                "INSERT INTO event_serials SELECT $1,$2,serial,sent FROM unnest($3::text[],$4::boolean[]) AS labels(serial,sent)",
                [
                  station,
                  event.id,
                  values.map(([serial]) => serial),
                  values.map(([, sent]) => sent),
                ],
              );
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    response.writeHead(204).end();
  } catch (error) {
    console.error("Monitoring database error:", error.code);
    response.writeHead(503).end();
  }
});

function expire() {
  void pool
    .query(
      "DELETE FROM events WHERE occurred_at < now() - interval '12 months'",
    )
    .catch((error) => console.error("Retention failed:", error.code));
}
expire();
setInterval(expire, 24 * 60 * 60 * 1000).unref();
server.listen(8080, "0.0.0.0");
