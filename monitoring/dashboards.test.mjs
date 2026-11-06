import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as ui from "./dashboard-panels.mjs";
import {
  technicalDashboards,
  technicalVariables,
} from "./technical-dashboards.mjs";

const source = readFileSync(
  new URL("./dashboards.mjs", import.meta.url),
  "utf8",
).replace(/^import [^;]+;\r?$/gm, "");
const AsyncFunction = Object.getPrototypeOf(async function () {
  return undefined;
}).constructor;
const provision = new AsyncFunction(
  "fetch",
  "writeFile",
  "process",
  "ui",
  "technicalDashboards",
  "technicalVariables",
  source,
);

async function run(sessions, failRevocation = false, dashboards = {}) {
  const calls = [];
  const files = [];
  const fetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, ...options });
    let body = {};
    let status = 200;
    if (path === "/api/orgs/name/Produkcja") body = { id: 2 };
    if (path === "/api/orgs/2/users") body = [{ login: "admin" }];
    if (path === "/api/user") body = { id: 1 };
    if (path.endsWith("/auth-tokens")) body = sessions;
    if (path.endsWith("/logout")) status = 400;
    if (path.endsWith("/revoke-auth-token") && failRevocation) status = 500;
    if (path === "/api/folders/label-technical") status = 404;
    if (path.startsWith("/api/dashboards/uid/")) {
      body = dashboards[path.split("/").at(-1)];
      if (!body) status = 404;
    }
    return { ok: status === 200, status, json: async () => body };
  };
  const operation = provision(
    fetch,
    async (...args) => files.push(args),
    { env: { GRAFANA_ADMIN_PASSWORD: "test-only" } },
    ui,
    technicalDashboards,
    technicalVariables,
  );
  return { operation, calls, files };
}

test("finishes provisioning a fresh instance with no admin sessions", async () => {
  const { operation, calls, files } = await run([]);
  await operation;
  assert.ok(!calls.some((call) => call.path.endsWith("/logout")));
  assert.equal(files.length, 1);
  assert.equal(files[0][0], "/var/lib/grafana/bootstrap/done");
  const published = calls.filter((call) => call.path === "/api/dashboards/db");
  assert.deepEqual(
    published.map((call) => call.headers["X-Grafana-Org-Id"]),
    ["2", "1", "1", "1", "1", "1"],
  );
  const [production, overview, diagnostics] = published.map(
    (call) => JSON.parse(call.body).dashboard,
  );
  assert.ok(production.editable && overview.editable && diagnostics.editable);
  assert.deepEqual(production.links, []);
  assert.equal(
    production.panels.filter((panel) => panel.type === "stat").length,
    2,
  );
  assert.ok(
    diagnostics.panels.some((panel) => panel.title === "Dziennik audytu"),
  );
  const folder = calls.find((call) => call.path === "/api/folders");
  assert.equal(folder.headers["X-Grafana-Org-Id"], "1");
  assert.equal(JSON.parse(folder.body).uid, "label-technical");
  for (const call of published.slice(3)) {
    const { folderUid, dashboard } = JSON.parse(call.body);
    assert.equal(folderUid, "label-technical");
    assert.equal(dashboard.editable, true);
    assert.equal(dashboard.links.length, 4);
    assert.equal(
      new Set(dashboard.panels.map(({ id }) => id)).size,
      dashboard.panels.length,
    );
  }
});

test("updates the previous layout in place and preserves edits to the current layout", async () => {
  const { operation, calls } = await run([], false, {
    "label-overview": {
      dashboard: { id: 2, version: 3 },
      meta: { folderUid: "custom" },
    },
    "label-it": {
      dashboard: { id: 3, version: 5, tags: ["label-monitoring-layout-2"] },
      meta: {},
    },
    "label-fleet": { dashboard: { id: 4, version: 7 }, meta: {} },
  });
  await operation;
  const dashboards = calls
    .filter((call) => call.path === "/api/dashboards/db")
    .map((call) => JSON.parse(call.body));
  assert.deepEqual(
    dashboards.map(({ dashboard }) => dashboard.uid),
    ["label-production", "label-overview", "label-quality", "label-throughput"],
  );
  assert.equal(dashboards[1].folderUid, "custom");
  assert.equal(dashboards[1].dashboard.version, 3);
  assert.equal(dashboards[1].dashboard.id, 2);
});

test("revokes every existing admin session without calling self-logout", async () => {
  const { operation, calls, files } = await run([{ id: 12 }, { id: 34 }]);
  await operation;
  const revocations = calls.filter((call) =>
    call.path.endsWith("/revoke-auth-token"),
  );
  assert.deepEqual(
    revocations.map((call) => JSON.parse(call.body)),
    [{ authTokenId: 12 }, { authTokenId: 34 }],
  );
  assert.ok(
    revocations.every(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/admin/users/1/revoke-auth-token",
    ),
  );
  assert.ok(!calls.some((call) => call.path.endsWith("/logout")));
  assert.equal(files.length, 1);
});

test("does not mark provisioning complete if revocation fails", async () => {
  const { operation, files } = await run([{ id: 12 }], true);
  await assert.rejects(operation, /revoke-auth-token: HTTP 500/);
  assert.equal(files.length, 0);
});
