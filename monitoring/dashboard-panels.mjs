const datasource = { type: "grafana-postgresql-datasource", uid: "monitoring" };

const field = (name, properties) => ({
  matcher: { id: "byName", options: name },
  properties: Object.entries(properties).map(([id, value]) => ({ id, value })),
});
const fixed = (fixedColor) => ({ mode: "fixed", fixedColor });
const thresholds = (color, warning) => ({
  mode: "absolute",
  steps: [
    { color, value: null },
    ...(warning ? [{ color: warning, value: 1 }] : []),
  ],
});
const badge = (values) => ({
  "custom.cellOptions": {
    type: "color-text",
  },
  mappings: [
    {
      type: "value",
      options: Object.fromEntries(
        Object.entries(values).map(([value, color]) => [
          value,
          { text: value, color },
        ]),
      ),
    },
  ],
});
const timestamp = { unit: "time:DD.MM HH:mm:ss", "custom.width": 150 };
const statusField = field(
  "Stan drukarki",
  badge({
    Gotowa: "green",
    "Brak zgłoszenia": "orange",
    "Brak kontaktu": "red",
    "Brak aktualnego pomiaru": "orange",
    "Sprawdź drukarkę": "orange",
  }),
);

function panel(id, title, type, [x, y, w, h], rawSql, config = {}) {
  return {
    id,
    title,
    type,
    datasource,
    gridPos: { x, y, w, h },
    targets: [
      {
        refId: "A",
        datasource,
        rawSql,
        rawQuery: true,
        format: type === "timeseries" ? "time_series" : "table",
      },
    ],
    ...config,
  };
}

function stats(id, title, x, sql, description, overrides = []) {
  return panel(id, title, "stat", [x, 0, 12, 3], sql, {
    description,
    fieldConfig: {
      defaults: {
        decimals: 0,
        noValue: "—",
        color: { mode: "thresholds" },
        thresholds: thresholds("text"),
      },
      overrides,
    },
    options: {
      colorMode: "value",
      graphMode: "none",
      textMode: "value_and_name",
      orientation: "horizontal",
      text: { titleSize: 12, valueSize: 34 },
    },
  });
}
const attention = (name) =>
  field(name, { thresholds: thresholds("text", "red") });
function table(
  id,
  title,
  y,
  h,
  sql,
  { description, overrides = [], minWidth } = {},
) {
  return panel(id, title, "table", [0, y, 24, h], sql, {
    description,
    fieldConfig: {
      defaults: { noValue: "—", ...(minWidth && { custom: { minWidth } }) },
      overrides,
    },
    options: { showHeader: true, cellHeight: "sm", footer: { show: false } },
  });
}

function bars(id, title, x, w, sql, series, description, y = 9) {
  return panel(id, title, "timeseries", [x, y, w, 7], sql, {
    description,
    fieldConfig: {
      defaults: {
        min: 0,
        decimals: 0,
        custom: {
          drawStyle: "bars",
          barAlignment: 0,
          fillOpacity: 70,
          lineWidth: 1,
          showPoints: "never",
        },
      },
      overrides: series.map(([name, color, drawStyle]) =>
        field(name, {
          color: fixed(color),
          ...(drawStyle && {
            "custom.drawStyle": drawStyle,
            "custom.fillOpacity": 0,
            "custom.showPoints": "always",
            "custom.pointSize": 5,
          }),
        }),
      ),
    },
    options: {
      legend: { showLegend: series.length > 1 },
      tooltip: { mode: "multi", sort: "none" },
    },
  });
}

const stationFilter = "station_id IN (${station:sqlstring})";
const period = "$__timeFilter(occurred_at)";
const hourly = `FROM production_hourly WHERE $__timeFilter(hour) AND ${stationFilter}`;
const stationScope = `FROM production_stations WHERE ${stationFilter}`;
const variables = [
  {
    name: "station",
    label: "Stanowisko",
    type: "query",
    datasource,
    multi: true,
    includeAll: true,
    refresh: 1,
    query: "SELECT station_id FROM production_stations ORDER BY station_id",
    current: { text: "All", value: "$__all" },
  },
];

export {
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
};
