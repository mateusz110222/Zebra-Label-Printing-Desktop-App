CREATE TABLE IF NOT EXISTS station_credentials (
  station_id text PRIMARY KEY,
  name text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  enabled boolean NOT NULL DEFAULT true,
  synthetic boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS station_management_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  station_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
  station_id text PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL,
  last_seen timestamptz NOT NULL,
  checked_at timestamptz,
  printer jsonb,
  sync_state text NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  station_id text NOT NULL,
  event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  category text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (station_id, event_id)
);
CREATE INDEX IF NOT EXISTS events_time ON events (occurred_at);
CREATE INDEX IF NOT EXISTS events_station_time ON events (station_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS event_serials (
  station_id text NOT NULL,
  event_id text NOT NULL,
  serial text NOT NULL,
  sent boolean NOT NULL,
  PRIMARY KEY (station_id, event_id, serial),
  FOREIGN KEY (station_id, event_id) REFERENCES events ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS event_serial_lookup ON event_serials (serial);

CREATE OR REPLACE VIEW print_results AS
SELECT station_id, event_id, occurred_at, action, status,
  payload #>> '{details,printMode}' AS mode,
  COALESCE((payload #>> '{details,sentCount}')::int,
    CASE WHEN payload #>> '{details,deliveryState}' = 'sent' OR action = 'TEST_LABEL_DATA_SENT' THEN 1 ELSE 0 END) AS sent,
  CASE WHEN jsonb_typeof(payload #> '{details,printerAcknowledgements,confirmed}') = 'array'
    THEN jsonb_array_length(payload #> '{details,printerAcknowledgements,confirmed}') END AS confirmed,
  CASE WHEN jsonb_typeof(payload #> '{details,printerAcknowledgements,missing}') = 'array'
    THEN jsonb_array_length(payload #> '{details,printerAcknowledgements,missing}') END AS missing,
  CASE WHEN jsonb_typeof(payload #> '{details,printerAcknowledgements,repeated}') = 'array'
    THEN jsonb_array_length(payload #> '{details,printerAcknowledgements,repeated}') END AS repeated,
  (payload #>> '{details,printerDiagnostics,delta}')::bigint AS counter_delta,
  (payload #>> '{details,printerDiagnostics,differenceFromSent}')::bigint AS counter_difference,
  payload #>> '{details,printerType}' AS printer_type,
  payload #>> '{details,printerTarget}' AS printer_target,
  payload #>> '{details,partNumber}' AS part_number,
  payload #>> '{details,labelFormat}' AS label_format,
  CASE WHEN jsonb_typeof(payload #> '{details,requestedQuantity}') = 'number'
    THEN (payload #>> '{details,requestedQuantity}')::numeric END AS requested,
  NULLIF(payload #>> '{details,printerAcknowledgements,error}', '') AS acknowledgement_error,
  payload #>> '{details,printerDiagnostics,before}' AS counter_before,
  payload #>> '{details,printerDiagnostics,after}' AS counter_after
FROM events WHERE category = 'print'
  AND action NOT IN ('TEST_LABEL_DATA_PREPARED', 'LABEL_DATA_PREPARED', 'LABEL_BATCH_REQUESTED');

CREATE OR REPLACE VIEW production_hourly AS
SELECT date_trunc('hour', occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,
  station_id, count(*) FILTER (WHERE status = 'failure') AS failures,
  sum(sent) AS sent, sum(confirmed) AS confirmed, sum(counter_delta) AS counter_delta
FROM print_results WHERE mode IN ('print', 'reprint')
GROUP BY 1, 2;

CREATE OR REPLACE VIEW production_stations AS
SELECT station_id, name, version, last_seen,
  CASE WHEN last_seen < now() - interval '2 minutes' THEN 'Brak kontaktu'
       WHEN checked_at IS NULL OR checked_at < now() - interval '2 minutes' THEN 'Brak aktualnego pomiaru'
       WHEN NOT COALESCE((printer ->> 'reachable')::boolean, false)
         OR NOT COALESCE((printer ->> 'ready')::boolean, false)
         OR (printer ->> 'total')::numeric > 2147483647
         OR (printer ->> 'readyCount')::numeric < (printer ->> 'total')::numeric THEN 'Sprawdź drukarkę'
       ELSE 'Gotowa' END AS printer_status,
  (SELECT max(occurred_at) FROM print_results p WHERE p.station_id = s.station_id
    AND p.mode IN ('print', 'reprint') AND p.sent > 0) AS last_print
FROM stations s;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor_ingest') THEN CREATE ROLE monitor_ingest LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor_it') THEN CREATE ROLE monitor_it LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor_production') THEN CREATE ROLE monitor_production LOGIN; END IF;
END $$;
\getenv ingest_password INGEST_DB_PASSWORD
\getenv it_password IT_DB_PASSWORD
\getenv production_password PRODUCTION_DB_PASSWORD
ALTER ROLE monitor_ingest PASSWORD :'ingest_password';
ALTER ROLE monitor_it PASSWORD :'it_password';
ALTER ROLE monitor_production PASSWORD :'production_password';
GRANT SELECT, INSERT, UPDATE ON stations TO monitor_ingest;
GRANT SELECT, INSERT, UPDATE ON station_credentials TO monitor_ingest;
GRANT INSERT ON station_management_events TO monitor_ingest;
GRANT USAGE ON SEQUENCE station_management_events_id_seq TO monitor_ingest;
GRANT SELECT, INSERT, DELETE ON events TO monitor_ingest;
GRANT SELECT, INSERT ON event_serials TO monitor_ingest;
GRANT SELECT ON stations, events, event_serials, print_results, production_stations, production_hourly TO monitor_it;
GRANT SELECT (station_id, name, enabled, synthetic) ON station_credentials TO monitor_it;
GRANT SELECT ON station_management_events TO monitor_it;
GRANT SELECT ON production_stations, production_hourly TO monitor_production;
