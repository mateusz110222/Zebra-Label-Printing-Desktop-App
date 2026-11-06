import { writeFile } from "node:fs/promises";
import * as ui from "./dashboard-panels.mjs";
import {
  technicalDashboards,
  technicalVariables,
} from "./technical-dashboards.mjs";

const base = "http://grafana-bootstrap:3000";
const auth =
  "Basic " +
  Buffer.from("admin:" + process.env.GRAFANA_ADMIN_PASSWORD).toString("base64");

async function api(
  path,
  { method = "GET", body, org = 1, missing = false } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "X-Grafana-Org-Id": String(org),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (missing && response.status === 404) return null;
  if (!response.ok)
    throw new Error(method + " " + path + ": HTTP " + response.status);
  return response.json();
}

for (let attempt = 0; ; attempt++) {
  try {
    await api("/api/health");
    break;
  } catch (error) {
    if (attempt === 59) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

await api("/api/orgs/1", { method: "PUT", body: { name: "IT" } });
let production = await api("/api/orgs/name/Produkcja", { missing: true });
if (!production) {
  const { orgId } = await api("/api/orgs", {
    method: "POST",
    body: { name: "Produkcja" },
  });
  production = { id: orgId };
}
if (Number(production.id) !== 2)
  throw new Error("Produkcja must have organization ID 2 for LDAP mapping");
const orgUsers = await api("/api/orgs/2/users");
if (!orgUsers.some((user) => user.login === "admin")) {
  await api("/api/orgs/2/users", {
    method: "POST",
    body: { loginOrEmail: "admin", role: "Admin" },
  });
}

const {
  datasource,
  field,
  badge,
  timestamp,
  statusField,
  stats,
  attention,
  table,
  bars,
  stationFilter,
  period,
  hourly,
  stationScope,
  variables,
} = ui;
for (const [org, user, password] of [
  [1, "monitor_it", process.env.IT_DB_PASSWORD],
  [2, "monitor_production", process.env.PRODUCTION_DB_PASSWORD],
]) {
  const source = {
    ...datasource,
    name: "Monitoring",
    access: "proxy",
    url: "postgres:5432",
    user,
    isDefault: true,
    jsonData: {
      database: "monitoring",
      sslmode: "disable",
      postgresVersion: 1800,
    },
    secureJsonData: { password },
  };
  const existing = await api("/api/datasources/uid/monitoring", {
    org,
    missing: true,
  });
  await api(existing ? "/api/datasources/uid/monitoring" : "/api/datasources", {
    org,
    method: existing ? "PUT" : "POST",
    body: source,
  });
}

const hourlyDescription =
  "Sumy z godzinowych przedziałów dla wybranych stanowisk. Zakres czasu odnosi się do początku przedziału.";
const overview = [
  stats(
    7,
    "Stanowiska i błędy",
    0,
    `SELECT (SELECT count(*) ${stationScope} AND printer_status <> 'Gotowa') AS "Do sprawdzenia",
      coalesce(sum(failures), 0) AS "Zlecenia z błędem" ${hourly}`,
    "Stanowiska do sprawdzenia obejmują brak kontaktu, nieaktualny pomiar i problemy drukarek. " +
      hourlyDescription,
    [attention("Do sprawdzenia"), attention("Zlecenia z błędem")],
  ),
  stats(
    8,
    "Etykiety",
    12,
    `SELECT coalesce(sum(sent), 0) AS "Wysłane", sum(confirmed) AS "Potwierdzone" ${hourly}`,
    hourlyDescription +
      " Brak potwierdzeń oznacza, że aplikacja nie zgłosiła pomiaru w tym zakresie.",
    [field("Potwierdzone", { noValue: "Brak pomiaru" })],
  ),
  table(
    1,
    "Bieżący stan stanowisk",
    3,
    6,
    `SELECT station_id AS "Stanowisko", printer_status AS "Stan drukarki", last_seen AS "Ostatni kontakt",
      last_print AS "Ostatni wydruk", name AS "Komputer", version AS "Wersja"
      ${stationScope} ORDER BY (printer_status = 'Gotowa'), station_id`,
    {
      description:
        "Stan bieżący, niezależny od zakresu czasu. Problemy są na początku listy.",
      overrides: [
        statusField,
        field("Ostatni kontakt", timestamp),
        field("Ostatni wydruk", timestamp),
        field("Wersja", { "custom.width": 90 }),
      ],
    },
  ),
  bars(
    2,
    "Wysłane i potwierdzone w czasie",
    0,
    16,
    `SELECT hour AS time, sum(sent) AS "Wysłane", sum(confirmed) AS "Potwierdzone" ${hourly} GROUP BY hour ORDER BY hour`,
    [
      ["Wysłane", "blue"],
      ["Potwierdzone", "green", "line"],
    ],
    hourlyDescription,
  ),
  bars(
    5,
    "Zlecenia z błędem w czasie",
    16,
    8,
    `SELECT hour AS time, sum(failures) AS "Błędy" ${hourly} GROUP BY hour ORDER BY hour`,
    [["Błędy", "red"]],
    hourlyDescription,
  ),
  table(
    6,
    "Podsumowanie dzienne według stanowiska",
    16,
    7,
    `SELECT to_char(hour AT TIME ZONE 'Europe/Warsaw', 'YYYY-MM-DD') AS "Dzień",
      station_id AS "Stanowisko", sum(sent) AS "Wysłane", sum(confirmed) AS "Potwierdzone",
      sum(counter_delta) AS "Przyrost licznika", sum(failures) AS "Zlecenia z błędem"
      ${hourly} GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
    {
      description:
        hourlyDescription + " Brak przyrostu oznacza brak pomiaru licznika.",
    },
  ),
];

const eventScope = `WHERE ${period} AND ${stationFilter}`;
const issue =
  "(status = 'failure' OR missing > 0 OR repeated > 0 OR counter_difference <> 0)";
const prints = `FROM print_results ${eventScope}`;
const duplicates = `FROM event_serials s JOIN print_results p USING (station_id, event_id)
  WHERE $__timeFilter(p.occurred_at) AND p.${stationFilter} AND p.mode = 'print' AND s.sent
  GROUP BY s.serial HAVING count(*) > 1`;
const diagnosticUrl =
  "/d/label-it?from=${__from}&to=${__to}&${station:queryparam}";
const drilldown = (name, label, variable) =>
  field(name, {
    links: [
      {
        title: label,
        url:
          diagnosticUrl + "&var-" + variable + "=${__value.raw:percentencode}",
      },
    ],
  });
const eventId = drilldown("ID zdarzenia", "Pokaż zdarzenie audytu", "eventId");
const details = field("Szczegóły", {
  "custom.width": 90,
  "custom.inspect": true,
  mappings: [
    { type: "regex", options: { pattern: "^.+$", result: { text: "JSON" } } },
  ],
});
const result = `CASE status WHEN 'success' THEN 'Sukces' WHEN 'failure' THEN 'Błąd'
  WHEN 'warning' THEN 'Ostrzeżenie' ELSE status END AS "Wynik"`;
const resultField = field(
  "Wynik",
  badge({ Sukces: "green", Błąd: "red", Ostrzeżenie: "orange" }),
);
const auditFields = [field("Czas", timestamp), resultField, details];
const diagnostics = [
  stats(
    6,
    "Problemy operacyjne",
    0,
    `SELECT (SELECT count(*) FROM stations WHERE ${stationFilter} AND last_seen < now() - interval '2 minutes') AS "Brak kontaktu",
      (SELECT count(*) ${prints} AND ${issue}) AS "Wydruki do sprawdzenia"`,
    "Brak kontaktu dotyczy stanu bieżącego. Wydruki do sprawdzenia obejmują błędy, brakujące lub powtórzone potwierdzenia i rozbieżności licznika.",
    [attention("Brak kontaktu"), attention("Wydruki do sprawdzenia")],
  ),
  stats(
    8,
    "Dodruki i powtórzenia",
    12,
    `SELECT (SELECT count(*) ${prints} AND mode = 'reprint') AS "Dodruki",
      (SELECT count(*) FROM (SELECT s.serial ${duplicates}) AS repeated_serials) AS "Powtórzone numery"`,
    "Powtórzone numery zostały wysłane w więcej niż jednym zwykłym wydruku w wybranym zakresie.",
    [attention("Powtórzone numery")],
  ),
  table(
    1,
    "Łączność i synchronizacja stanowisk",
    3,
    6,
    `SELECT station_id AS "Stanowisko", p.printer_status AS "Stan drukarki",
      CASE s.sync_state WHEN 'current' THEN 'Aktualna' WHEN 'pending' THEN 'Oczekuje'
        WHEN 'error' THEN 'Błąd' WHEN 'synthetic' THEN 'Testowa' ELSE s.sync_state END AS "Synchronizacja",
      s.last_seen AS "Ostatni kontakt", s.checked_at AS "Pomiar drukarki", s.name AS "Komputer", s.version AS "Wersja"
      FROM stations s JOIN production_stations p USING (station_id) WHERE ${stationFilter}
      ORDER BY (p.printer_status = 'Gotowa'), station_id`,
    {
      overrides: [
        statusField,
        field(
          "Synchronizacja",
          badge({ Aktualna: "green", Oczekuje: "orange", Błąd: "red" }),
        ),
        field("Ostatni kontakt", timestamp),
        field("Pomiar drukarki", timestamp),
        field("Wersja", { "custom.width": 90 }),
      ],
    },
  ),
  table(
    5,
    "Dziennik audytu",
    9,
    8,
    `SELECT occurred_at AS "Czas", station_id AS "Stanowisko", payload->>'actor' AS "Użytkownik",
      action AS "Operacja", ${result}, payload::text AS "Szczegóły", category AS "Kategoria", event_id AS "ID zdarzenia"
      FROM events ${eventScope}
      AND ('' = \${eventId:sqlstring} OR event_id = \${eventId:sqlstring}) ORDER BY occurred_at DESC LIMIT 500`,
    {
      description:
        "Pole ID zdarzenia zawęża dziennik. Ikona w kolumnie Szczegóły otwiera pełne dane. Maksymalnie 500 wpisów.",
      overrides: auditFields,
    },
  ),
  table(
    2,
    "Wydruki do sprawdzenia i dodruki",
    18,
    7,
    `SELECT occurred_at AS "Czas", station_id AS "Stanowisko", action AS "Operacja",
      CASE mode WHEN 'print' THEN 'Wydruk' WHEN 'reprint' THEN 'Dodruk' ELSE mode END AS "Tryb",
      ${result}, event_id AS "ID zdarzenia", sent AS "Wysłano", confirmed AS "Potwierdzono", missing AS "Brakujące",
      repeated AS "Powtórzone", counter_delta AS "Przyrost licznika", counter_difference AS "Różnica licznika"
      ${prints} AND (${issue} OR mode = 'reprint') ORDER BY occurred_at DESC LIMIT 500`,
    {
      description:
        "ID zdarzenia prowadzi do wpisu w dzienniku audytu. Maksymalnie 500 wpisów.",
      overrides: [field("Czas", timestamp), resultField, eventId],
    },
  ),
  table(
    4,
    "Powtórzenia numerów w zwykłych wydrukach",
    25,
    5,
    `SELECT s.serial AS "Numer seryjny", count(*) AS "Wydruki",
      string_agg(DISTINCT s.station_id, ', ') AS "Stanowiska" ${duplicates} ORDER BY 2 DESC LIMIT 500`,
    {
      description:
        "Kliknij numer, aby wyświetlić historię etykiety dla wybranego zakresu. Maksymalnie 500 wyników.",
      overrides: [
        drilldown("Numer seryjny", "Pokaż historię etykiety", "serial"),
      ],
    },
  ),
  table(
    3,
    "Historia etykiety po numerze seryjnym",
    30,
    6,
    `SELECT e.occurred_at AS "Czas", e.station_id AS "Stanowisko", e.action AS "Operacja",
      ${result}, e.payload::text AS "Szczegóły", e.event_id AS "ID zdarzenia"
      FROM event_serials s JOIN events e USING (station_id, event_id)
      WHERE \${serial:sqlstring} <> '' AND s.serial = \${serial:sqlstring}
      AND $__timeFilter(e.occurred_at) AND e.${stationFilter} ORDER BY e.occurred_at DESC LIMIT 500`,
    {
      description:
        "Wpisz pełny numer seryjny w filtrze u góry. Maksymalnie 500 wpisów.",
      overrides: [...auditFields, eventId],
    },
  ),
];

const layoutTag = "label-monitoring-layout-2";
const link = (title, url) => ({ title, url, type: "link", targetBlank: false });
async function save(org, uid, title, panels, list, links = [], folderUid) {
  const existing = await api(`/api/dashboards/uid/${uid}`, {
    org,
    missing: true,
  });
  if (existing && (folderUid || existing.dashboard.tags?.includes(layoutTag)))
    return;
  await api("/api/dashboards/db", {
    org,
    method: "POST",
    body: {
      folderUid: existing?.meta.folderUid ?? folderUid,
      dashboard: {
        id: existing?.dashboard.id,
        version: existing?.dashboard.version,
        uid,
        title,
        links,
        panels,
        tags: [...(existing?.dashboard.tags || []), layoutTag],
        editable: true,
        schemaVersion: 39,
        refresh: "30s",
        timezone: "Europe/Warsaw",
        time: { from: "now-24h", to: "now" },
        templating: { list },
      },
    },
  });
}

await save(
  2,
  "label-production",
  "Druk etykiet · Produkcja",
  overview,
  variables,
);
await save(
  1,
  "label-overview",
  "Druk etykiet · Stan stanowisk",
  overview,
  variables,
  [
    link("Diagnostyka i audyt", diagnosticUrl),
    link("Zarządzaj stanowiskami", "/stations/"),
  ],
);
await save(
  1,
  "label-it",
  "Druk etykiet · Diagnostyka i audyt",
  diagnostics,
  [
    ...variables,
    {
      name: "serial",
      label: "Pełny numer seryjny",
      type: "textbox",
      current: { text: "", value: "" },
    },
    {
      name: "eventId",
      label: "ID zdarzenia audytu",
      type: "textbox",
      current: { text: "", value: "" },
    },
  ],
  [
    link(
      "Stan stanowisk",
      "/d/label-overview?from=${__from}&to=${__to}&${station:queryparam}",
    ),
    link("Zarządzaj stanowiskami", "/stations/"),
  ],
);

const technicalFolder = "label-technical";
if (!(await api(`/api/folders/${technicalFolder}`, { missing: true }))) {
  await api("/api/folders", {
    method: "POST",
    body: { uid: technicalFolder, title: "Diagnostyka techniczna" },
  });
}

for (const { uid, title, panels } of technicalDashboards) {
  const links = technicalDashboards
    .filter((dashboard) => dashboard.uid !== uid)
    .map((dashboard) =>
      link(
        dashboard.title,
        "/d/" +
          dashboard.uid +
          "?from=${__from}&to=${__to}&${station:queryparam}",
      ),
    );
  await save(
    1,
    uid,
    title,
    panels,
    technicalVariables,
    [
      ...links,
      link("Audyt", diagnosticUrl),
      link("Zarządzaj stanowiskami", "/stations/"),
    ],
    technicalFolder,
  );
}

const admin = await api("/api/user");
// Grafana rejects the bulk logout endpoint when targeting the caller itself.
const sessions = await api(`/api/admin/users/${admin.id}/auth-tokens`);
for (const session of sessions) {
  await api(`/api/admin/users/${admin.id}/revoke-auth-token`, {
    method: "POST",
    body: { authTokenId: session.id },
  });
}
await writeFile("/var/lib/grafana/bootstrap/done", "done\n");
