#!/usr/bin/env bash
# Levanta un PostgreSQL 16 local en el puerto 5433 (sin contraseña) con las bases
# gruaya_dev, gruaya_test y gruaya_e2e. Pensado para entornos efímeros de desarrollo
# (Claude Code en la nube, contenedores). En tu máquina puedes usar Docker o Postgres.app.
#
#   bash scripts/pg-local.sh            # inicia (o reutiliza) el servidor
#   bash scripts/pg-local.sh stop       # lo detiene
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DATA=${PG_LOCAL_DIR:-/var/tmp/pg-gruaya}
PORT=${PG_LOCAL_PORT:-5433}

run_as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }

if [ "${1:-}" = "stop" ]; then
  run_as_pg "$PGBIN/pg_ctl -D $DATA stop" || true
  exit 0
fi

if [ "$(id -u)" = "0" ] && ! id postgres >/dev/null 2>&1; then useradd -m postgres; fi
if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres "$DATA"; chmod 700 "$DATA"
  run_as_pg "$PGBIN/initdb -D $DATA -A trust -U postgres >/dev/null"
fi
if ! "$PGBIN/pg_isready" -h localhost -p "$PORT" >/dev/null 2>&1; then
  run_as_pg "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $DATA' -l $DATA/log.txt start >/dev/null"
  for _ in 1 2 3 4 5 6 7 8 9 10; do "$PGBIN/pg_isready" -h localhost -p "$PORT" >/dev/null 2>&1 && break; sleep 1; done
fi
for db in gruaya_dev gruaya_test gruaya_e2e; do
  psql -h localhost -p "$PORT" -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
    || psql -h localhost -p "$PORT" -U postgres -qc "create database $db"
done
echo "PostgreSQL listo en postgresql://postgres@localhost:$PORT/{gruaya_dev,gruaya_test,gruaya_e2e}"
