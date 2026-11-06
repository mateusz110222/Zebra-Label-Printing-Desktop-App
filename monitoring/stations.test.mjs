import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import {
  importLegacyStations,
  stationHandler,
  stationIdentity,
} from "./stations.mjs";

function setup({
  user = { orgId: 1, login: "it.user", isExternal: true, authLabels: ["LDAP"] },
  authStatus = 200,
  auditFails = false,
} = {}) {
  const records = new Map();
  const calls = [];
  const authCalls = [];
  let snapshot;
  const query = async (sql, args = []) => {
    calls.push({ sql, args });
    if (sql === "BEGIN")
      snapshot = new Map([...records].map(([id, row]) => [id, { ...row }]));
    if (sql === "ROLLBACK") {
      records.clear();
      for (const [id, row] of snapshot) records.set(id, row);
    }
    if (sql.startsWith("INSERT INTO station_management_events") && auditFails)
      throw new Error("audit unavailable");
    if (sql.startsWith("INSERT INTO station_credentials")) {
      const legacy = sql.includes("ON CONFLICT");
      const [id, name, hash] = legacy ? [args[0], args[0], args[1]] : args;
      if (records.has(id) && !legacy)
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      if (!records.has(id))
        records.set(id, {
          station_id: id,
          name,
          sha256: hash,
          enabled: true,
          synthetic: legacy ? args[2] : false,
        });
      return {
        rowCount: 1,
        rows: [{ station_id: id, synthetic: records.get(id).synthetic }],
      };
    }
    if (sql.startsWith("UPDATE station_credentials")) {
      const row = records.get(args[0]);
      if (!row) return { rowCount: 0, rows: [] };
      if (args[1]) {
        row.sha256 = args[1];
        row.enabled = true;
      } else row.enabled = false;
      return {
        rowCount: 1,
        rows: [{ station_id: args[0], synthetic: row.synthetic }],
      };
    }
    if (sql.startsWith("SELECT sha256")) {
      const row = records.get(args[0]);
      return {
        rows: row?.enabled
          ? [{ sha256: row.sha256, synthetic: row.synthetic }]
          : [],
      };
    }
    if (sql.startsWith("SELECT c.station_id"))
      return {
        rows: [...records.values()].map(
          ({ station_id, name, enabled, synthetic }) => ({
            station_id,
            name,
            enabled,
            synthetic,
          }),
        ),
      };
    return { rows: [], rowCount: 1 };
  };
  const pool = {
    query,
    connect: async () => ({
      query,
      release() {
        return undefined;
      },
    }),
  };
  const handler = stationHandler({
    pool,
    publicUrl: "http://monitor.test:8083/",
    fetchImpl: async (...args) => {
      authCalls.push(args);
      return {
        ok: authStatus === 200,
        status: authStatus,
        json: async () => user,
      };
    },
  });
  const request = async ({
    body,
    headers = {},
    method = body === undefined ? "GET" : "POST",
    raw,
    url = "/monitoring/admin/stations",
  } = {}) => {
    const req = Readable.from([
      Buffer.from(raw ?? (body === undefined ? "" : JSON.stringify(body))),
    ]);
    Object.assign(req, {
      url,
      method,
      headers: {
        cookie: "grafana_session=valid",
        origin: "http://monitor.test:8083",
        "content-type": "application/json",
        ...headers,
      },
    });
    const response = {
      status: 0,
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
      writeHead(status, values) {
        this.status = status;
        Object.assign(this.headers, values);
        return this;
      },
      end(body) {
        this.body = body;
      },
    };
    await handler(req, response);
    return {
      ...response,
      data:
        response.headers["Content-Type"] === "application/json"
          ? JSON.parse(response.body)
          : null,
    };
  };
  return { request, pool, calls, records, authCalls };
}
const create = { action: "create", stationId: "audi-01", name: "AUDI line 1" };

test("returns a token only once and stores its hash; list never exposes credentials", async () => {
  const { request, records, authCalls } = setup();
  const result = await request({ body: create });
  assert.equal(result.status, 200);
  const config = result.data.configuration;
  assert.match(config.token, /^[a-f0-9]{64}$/);
  assert.equal(config.url, "http://monitor.test:8083");
  assert.equal(
    records.get("audi-01").sha256,
    createHash("sha256").update(config.token).digest("hex"),
  );
  const list = await request();
  assert.equal(list.data.stations.length, 1);
  assert.ok(!JSON.stringify(list.data).includes(config.token));
  assert.ok(!JSON.stringify(list.data).includes("sha256"));
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(authCalls[0][1].headers.Cookie, "grafana_session=valid");
});

test("rotation and blocking immediately invalidate old station tokens", async () => {
  const { request, pool, records } = setup();
  const first = (await request({ body: create })).data.configuration.token;
  assert.ok(await stationIdentity(pool, create.stationId, "Bearer " + first));
  const rotated = (await request({ body: { ...create, action: "rotate" } }))
    .data.configuration.token;
  assert.notEqual(rotated, first);
  assert.equal(
    await stationIdentity(pool, create.stationId, "Bearer " + first),
    null,
  );
  assert.ok(await stationIdentity(pool, create.stationId, "Bearer " + rotated));
  const blocked = await request({ body: { ...create, action: "block" } });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.data.configuration, undefined);
  assert.equal(
    await stationIdentity(pool, create.stationId, "Bearer " + rotated),
    null,
  );
  assert.equal(records.get(create.stationId).name, create.name);
});

test("legacy import cannot undo a rotation or re-enable a blocked station", async () => {
  const { request, pool, records } = setup();
  const hash = "a".repeat(64);
  await importLegacyStations(pool, {
    "audi-01": { sha256: hash, synthetic: true },
  });
  const rotated = await request({ body: { ...create, action: "rotate" } });
  assert.equal(rotated.data.configuration.synthetic, true);
  const current = records.get("audi-01").sha256;
  await request({ body: { ...create, action: "block" } });
  await importLegacyStations(pool, {
    "audi-01": { sha256: hash, synthetic: true },
  });
  assert.equal(records.get("audi-01").sha256, current);
  assert.equal(records.get("audi-01").enabled, false);
});

test("production and local users cannot list or modify stations", async () => {
  for (const user of [
    { orgId: 2, isExternal: true, authLabels: ["LDAP"] },
    { orgId: 1, isExternal: false, authLabels: [] },
  ]) {
    const { request, calls } = setup({ user });
    assert.equal((await request()).status, 403);
    assert.equal((await request({ body: create })).status, 403);
    assert.equal(calls.length, 0);
  }
});

test("rejects absent or expired sessions and cross-origin mutations", async () => {
  const { request, calls, authCalls } = setup();
  assert.equal((await request({ headers: { cookie: "" } })).status, 401);
  assert.equal(
    (await request({ body: create, headers: { origin: "http://evil.test" } }))
      .status,
    403,
  );
  assert.equal(
    (await request({ body: create, headers: { "content-type": "text/plain" } }))
      .status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.equal(authCalls.length, 0);
  assert.equal((await setup({ authStatus: 401 }).request()).status, 401);
});

test("validates inputs, duplicates and request size before storing a token", async () => {
  const { request, calls } = setup();
  assert.equal(
    (await request({ body: { ...create, stationId: "bad/id" } })).status,
    400,
  );
  assert.equal((await request({ body: { ...create, name: " " } })).status, 400);
  assert.equal((await request({ body: create, raw: "{invalid" })).status, 400);
  assert.equal(
    (await request({ body: create, raw: "x".repeat(16385) })).status,
    413,
  );
  assert.equal(calls.length, 0);
  assert.equal((await request({ body: create })).status, 200);
  assert.equal((await request({ body: create })).status, 409);
});

test("a failed audit rolls back the new credential and returns no token", async () => {
  const { request, records, calls } = setup({ auditFails: true });
  const result = await request({ body: create });
  assert.equal(result.status, 503);
  assert.equal(result.data.configuration, undefined);
  assert.equal(records.size, 0);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
});

test("station IDs and bearer tokens are checked before querying PostgreSQL", async () => {
  const { pool, calls } = setup();
  assert.equal(
    await stationIdentity(pool, "bad/id", "Bearer " + "a".repeat(64)),
    null,
  );
  assert.equal(await stationIdentity(pool, "valid-id", "bad-token"), null);
  assert.equal(calls.length, 0);
});

test("an unavailable Grafana or malformed identity cannot grant access", async () => {
  assert.equal((await setup({ authStatus: 503 }).request()).status, 503);
  for (const user of [
    null,
    { orgId: 1, isExternal: true, authLabels: "LDAP" },
    { orgId: 1, login: "it", isExternal: true, authLabels: [null] },
  ]) {
    const { request, calls } = setup({ user });
    assert.equal((await request({ body: create })).status, 403);
    assert.equal(calls.length, 0);
  }
});

test("failed rotation preserves the existing token", async () => {
  const { request, pool, records } = setup({ auditFails: true });
  const hash = "a".repeat(64);
  await importLegacyStations(pool, { "audi-01": { sha256: hash } });
  assert.equal(
    (await request({ body: { ...create, action: "rotate" } })).status,
    503,
  );
  assert.equal(records.get("audi-01").sha256, hash);
});
