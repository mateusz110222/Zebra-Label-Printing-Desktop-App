#!/bin/sh
set -eu
mkdir -p /var/lib/grafana/bootstrap
chmod 777 /var/lib/grafana/bootstrap
rm -f /var/lib/grafana/bootstrap/done
/run.sh &
grafana_pid=$!
trap 'kill "$grafana_pid" 2>/dev/null || true' EXIT INT TERM
attempt=0
until [ -f /var/lib/grafana/bootstrap/done ]; do
  kill -0 "$grafana_pid" 2>/dev/null || exit 1
  attempt=$((attempt + 1))
  [ "$attempt" -lt 300 ] || exit 1
  sleep 1
done
kill "$grafana_pid"
wait "$grafana_pid" || true
trap - EXIT INT TERM
