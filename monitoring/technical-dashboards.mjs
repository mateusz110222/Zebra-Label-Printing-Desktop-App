import {
  attention,
  badge,
  bars,
  field,
  period,
  stationFilter,
  stats,
  statusField,
  table,
  timestamp,
  variables,
} from "./dashboard-panels.mjs";

export const technicalVariables = [
  {
    ...variables[0],
    query:
      "SELECT station_id FROM station_credentials UNION SELECT station_id FROM stations ORDER BY 1",
  },
];

const range = "from=${__from}&to=${__to}&${station:queryparam}";
const audit = field("ID zdarzenia", {
  links: [
    {
      title: "Otwórz zdarzenie w audycie",
      url: "/d/label-it?" + range + "&var-eventId=${__value.raw:percentencode}",
    },
  ],
});
const station = field("Stanowisko", {
  links: [
    {
      title: "Pokaż to stanowisko w telemetrii",
      url: "/d/label-fleet?from=${__from}&to=${__to}&var-station=${__value.raw:percentencode}",
    },
  ],
});
const clock = (name) => field(name, timestamp);
const percent = (name) =>
  field(name, { unit: "percent", decimals: 1, noValue: "—" });

const inventory = `WITH inventory AS (
  SELECT station_id, coalesce(s.name, c.name) AS name, s.version, s.last_seen, s.checked_at,
    s.printer, s.sync_state, c.enabled, coalesce(c.synthetic, false) AS synthetic,
    p.printer_status
  FROM station_credentials c FULL JOIN stations s USING (station_id)
  LEFT JOIN production_stations p USING (station_id)
  WHERE ${stationFilter})`;

const fleet = [
  stats(
    1,
    "Łączność z monitoringiem",
    0,
    inventory +
      `
    SELECT count(*) FILTER (WHERE enabled AND NOT synthetic) AS "Aktywne w rejestrze",
      count(*) FILTER (WHERE enabled AND NOT synthetic
        AND (last_seen IS NULL OR last_seen < now() - interval '2 minutes')) AS "Bez kontaktu"
    FROM inventory`,
    "Stan teraz. Bez kontaktu oznacza brak pierwszego zgłoszenia lub ponad 2 minuty od ostatniego.",
    [attention("Bez kontaktu")],
  ),
  stats(
    2,
    "Pomiar i synchronizacja",
    12,
    inventory +
      `
    SELECT count(*) FILTER (WHERE last_seen >= now() - interval '2 minutes'
      AND (checked_at IS NULL OR checked_at < now() - interval '2 minutes')) AS "Nieaktualny pomiar",
      count(*) FILTER (WHERE last_seen >= now() - interval '2 minutes' AND sync_state = 'error') AS "Błąd synchronizacji"
    FROM inventory WHERE enabled IS DISTINCT FROM false AND NOT synthetic`,
    "Stan teraz, tylko stanowiska z kontaktem w ostatnich 2 minutach.",
    [attention("Nieaktualny pomiar"), attention("Błąd synchronizacji")],
  ),
  table(
    3,
    "Stanowiska i świeżość pomiaru",
    3,
    8,
    inventory +
      `
    SELECT station_id AS "Stanowisko", coalesce(printer_status, 'Brak zgłoszenia') AS "Stan drukarki",
      CASE WHEN synthetic THEN 'Testowe' WHEN enabled THEN 'Aktywne'
        WHEN enabled = false THEN 'Zablokowane' ELSE 'Poza rejestrem' END AS "Rejestr",
      CASE sync_state WHEN 'current' THEN 'Aktualna' WHEN 'pending' THEN 'Oczekuje'
        WHEN 'error' THEN 'Błąd' END AS "Synchronizacja",
      extract(epoch FROM now() - last_seen)::bigint AS "Wiek kontaktu",
      extract(epoch FROM now() - checked_at)::bigint AS "Wiek pomiaru",
      (printer->>'readyCount') || ' / ' || (printer->>'total') AS "Gotowe / wszystkie"
    FROM inventory ORDER BY (enabled IS TRUE AND NOT synthetic) DESC,
      (printer_status = 'Gotowa') ASC NULLS FIRST, last_seen ASC NULLS FIRST, station_id`,
    {
      description:
        "Niezależnie od zakresu czasu. Brak zgłoszenia oznacza, że serwer nie zapisał heartbeat. Ujemny wiek pomiaru wskazuje na zegar stanowiska wyprzedzający serwer.",
      minWidth: 120,
      overrides: [
        statusField,
        field(
          "Rejestr",
          badge({
            Aktywne: "text",
            Testowe: "text",
            Zablokowane: "red",
            "Poza rejestrem": "orange",
          }),
        ),
        field(
          "Synchronizacja",
          badge({ Aktualna: "green", Oczekuje: "orange", Błąd: "red" }),
        ),
        field("Wiek kontaktu", { unit: "dtdurations", decimals: 0 }),
        field("Wiek pomiaru", { unit: "dtdurations", decimals: 0 }),
      ],
    },
  ),
  table(
    4,
    "Wersje aplikacji i ostatnia aktywność",
    11,
    6,
    inventory +
      `
    SELECT i.station_id AS "Stanowisko", i.name AS "Komputer", i.version AS "Wersja", i.last_seen AS "Ostatni heartbeat",
      i.checked_at AS "Ostatni pomiar", (SELECT max(e.occurred_at) FROM events e
        WHERE e.station_id = i.station_id) AS "Ostatnie zdarzenie"
    FROM inventory i WHERE i.last_seen IS NOT NULL ORDER BY i.version, i.station_id`,
    {
      description:
        "Czas zdarzenia pochodzi ze stanowiska. Pokazuje aktywność w historii, bez pomiaru opóźnienia przesyłu.",
      overrides: [
        clock("Ostatni heartbeat"),
        clock("Ostatni pomiar"),
        clock("Ostatnie zdarzenie"),
      ],
    },
  ),
  table(
    5,
    "Operacje na rejestrze stanowisk",
    17,
    7,
    `
    SELECT occurred_at AS "Czas", station_id AS "Stanowisko", actor AS "Konto IT",
      CASE action WHEN 'create' THEN 'Dodano stanowisko' WHEN 'rotate' THEN 'Wymieniono token'
        WHEN 'block' THEN 'Zablokowano stanowisko' ELSE action END AS "Operacja"
    FROM station_management_events WHERE ${period} AND ${stationFilter}
    ORDER BY occurred_at DESC, id DESC LIMIT 200`,
    {
      description:
        "Ostatnie operacje z wybranego zakresu, np. zmiana tokenu lub blokada.",
      overrides: [clock("Czas")],
    },
  ),
];

const jobs = `FROM print_results WHERE ${period} AND ${stationFilter} AND mode IN ('print', 'reprint')`;
const timeBucket = "$__timeGroupAlias(occurred_at,$__interval)";
const counterMismatch = "counter_difference <> 0";
const ackProblem =
  "(missing > 0 OR repeated > 0 OR acknowledgement_error IS NOT NULL)";
const coverage = (condition) =>
  `100.0 * count(*) FILTER (WHERE ${condition}) / nullif(count(*), 0)`;

const quality = [
  stats(
    1,
    "Potwierdzenia etykiet",
    0,
    `
    SELECT ${coverage("confirmed IS NOT NULL")} AS "Zlecenia z pomiarem",
      count(*) FILTER (WHERE ${ackProblem}) AS "Zlecenia z problemem" ${jobs}`,
    "Pomiar oznacza zapisane dane potwierdzeń. Problem obejmuje brakujące i powtórzone potwierdzenia oraz błąd odczytu.",
    [percent("Zlecenia z pomiarem"), attention("Zlecenia z problemem")],
  ),
  stats(
    2,
    "Licznik fizyczny drukarki",
    12,
    `
    SELECT ${coverage("counter_delta IS NOT NULL")} AS "Zlecenia z pomiarem",
      count(*) FILTER (WHERE ${counterMismatch}) AS "Niezgodne z wysyłką" ${jobs}`,
    "Pokrycie to odsetek wszystkich zleceń. Aplikacja mierzy licznik tylko w obsługiwanych przypadkach, m.in. przy wydrukach seryjnych.",
    [percent("Zlecenia z pomiarem"), attention("Niezgodne z wysyłką")],
  ),
  bars(
    3,
    "Braki i duplikaty potwierdzeń",
    0,
    15,
    `
    SELECT ${timeBucket}, sum(missing) AS "Brakujące", sum(repeated) AS "Powtórzone"
    ${jobs} AND (missing IS NOT NULL OR repeated IS NOT NULL) GROUP BY 1 ORDER BY 1`,
    [
      ["Brakujące", "red"],
      ["Powtórzone", "orange", "line"],
    ],
    "Zlicza etykiety wyłącznie z raportowanym pomiarem. Puste odcinki oznaczają brak pomiaru.",
    3,
  ),
  bars(
    4,
    "Zlecenia z różnicą licznika",
    15,
    9,
    `
    SELECT ${timeBucket}, count(*) FILTER (WHERE ${counterMismatch}) AS "Rozbieżności"
    ${jobs} AND counter_difference IS NOT NULL GROUP BY 1 ORDER BY 1`,
    [["Rozbieżności", "red"]],
    "Licznik przyrósł o inną liczbę niż liczba wysłanych etykiet.",
    3,
  ),
  table(
    5,
    "Potwierdzenia i licznik według stanowiska",
    10,
    6,
    `
    SELECT station_id AS "Stanowisko", count(*) AS "Zlecenia",
      count(confirmed) AS "Pomiar ACK", sum(missing) AS "Brakujące",
      sum(repeated) AS "Powtórzone", count(counter_delta) AS "Pomiar licznika",
      count(*) FILTER (WHERE ${counterMismatch}) AS "Rozbieżności"
    ${jobs} GROUP BY station_id ORDER BY "Rozbieżności" DESC, sum(missing) DESC NULLS LAST, station_id`,
    {
      description:
        "Pomiar ACK i pomiar licznika to liczby zleceń z danym pomiarem. Kreska oznacza brak danych, a zero przy brakach lub powtórzeniach oznacza pomiar bez problemów.",
      minWidth: 110,
      overrides: [station],
    },
  ),
  table(
    6,
    "Wyjątki do analizy",
    16,
    8,
    `
    SELECT occurred_at AS "Czas", station_id AS "Stanowisko",
      concat_ws(' · ', CASE WHEN missing > 0 THEN 'Brak potwierdzeń' END,
        CASE WHEN repeated > 0 THEN 'Powtórzone potwierdzenia' END,
        CASE WHEN acknowledgement_error IS NOT NULL THEN 'Błąd potwierdzeń' END,
        CASE WHEN ${counterMismatch} THEN 'Różnica licznika' END) AS "Powód",
      event_id AS "ID zdarzenia", sent AS "Wysłane", confirmed AS "Potwierdzone",
      counter_before AS "Licznik przed", counter_after AS "Licznik po", counter_difference AS "Różnica",
      printer_type AS "Interfejs", printer_target AS "Drukarka", acknowledgement_error AS "Błąd odczytu"
    ${jobs} AND (${ackProblem} OR ${counterMismatch}) ORDER BY occurred_at DESC LIMIT 200`,
    {
      description:
        "Kliknij ID zdarzenia, aby przejść do pełnego wpisu w audycie.",
      minWidth: 105,
      overrides: [
        clock("Czas"),
        audit,
        station,
        field("Powód", { "custom.width": 240 }),
      ],
    },
  ),
];

const failed = "count(*) FILTER (WHERE status = 'failure')";
const failureRate = `100.0 * ${failed} / nullif(count(*), 0)`;
const reprints = "coalesce(sum(sent) FILTER (WHERE mode = 'reprint'), 0)";
const throughput = [
  stats(
    1,
    "Wolumen etykiet",
    0,
    `
    SELECT coalesce(sum(sent) FILTER (WHERE mode = 'print'), 0) AS "Zwykły druk",
      ${reprints} AS "Dodruki" ${jobs}`,
    "Liczba wysłanych etykiet w wybranym czasie, według trybu wydruku.",
  ),
  stats(
    2,
    "Niezakończone zlecenia",
    12,
    `
    SELECT ${failed} AS "Z błędem", ${failureRate} AS "Udział z błędem" ${jobs}`,
    "Zlecenia ze statusem błędu, w tym częściowo zrealizowane. Odsetek liczony względem wszystkich zleceń.",
    [attention("Z błędem"), percent("Udział z błędem")],
  ),
  bars(
    3,
    "Wysłane etykiety według trybu",
    0,
    15,
    `
    SELECT ${timeBucket}, coalesce(sum(sent) FILTER (WHERE mode = 'print'), 0) AS "Zwykły druk",
      ${reprints} AS "Dodruki" ${jobs} GROUP BY 1 ORDER BY 1`,
    [
      ["Zwykły druk", "blue"],
      ["Dodruki", "orange", "line"],
    ],
    "Wielkość przedziału zależy od zakresu czasu.",
    3,
  ),
  bars(
    4,
    "Błędy zleceń w czasie",
    15,
    9,
    `
    SELECT ${timeBucket}, ${failed} AS "Błędy" ${jobs} GROUP BY 1 ORDER BY 1`,
    [["Błędy", "red"]],
    "Zlecenia ze statusem błędu, w tym częściowo zrealizowane.",
    3,
  ),
  table(
    5,
    "Obciążenie stanowisk",
    10,
    6,
    `
    SELECT station_id AS "Stanowisko", count(*) AS "Zlecenia", sum(sent) AS "Wysłane",
      ${reprints} AS "W tym dodruki", ${failed} AS "Z błędem",
      ${failureRate} AS "Udział z błędem", max(occurred_at) FILTER (WHERE sent > 0) AS "Ostatni wydruk"
    ${jobs} GROUP BY station_id ORDER BY sum(sent) DESC, station_id`,
    {
      minWidth: 110,
      overrides: [station, percent("Udział z błędem"), clock("Ostatni wydruk")],
    },
  ),
  table(
    6,
    "Części i formaty według liczby błędów",
    16,
    7,
    `
    SELECT part_number AS "Numer części", label_format AS "Format", count(*) AS "Zlecenia",
      sum(requested) AS "Zamówione", sum(sent) AS "Wysłane", ${failed} AS "Z błędem",
      ${failureRate} AS "Udział z błędem"
    ${jobs} GROUP BY part_number, label_format ORDER BY ${failed} DESC, sum(sent) DESC,
      part_number, label_format LIMIT 50`,
    {
      description:
        "Do 50 kombinacji części i formatu, najpierw z największą liczbą nieudanych zleceń. Liczba zamówionych etykiet obejmuje wpisy, które zapisały żądaną ilość.",
      minWidth: 110,
      overrides: [percent("Udział z błędem")],
    },
  ),
];

export const technicalDashboards = [
  { uid: "label-fleet", title: "Telemetria stanowisk", panels: fleet },
  { uid: "label-quality", title: "Potwierdzenia i liczniki", panels: quality },
  {
    uid: "label-throughput",
    title: "Obciążenie i błędy druku",
    panels: throughput,
  },
];
