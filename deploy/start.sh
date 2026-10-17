#!/usr/bin/env bash
# Arranque dentro del contenedor: migraciones, datos de prueba (opcional) y servidor.
set -euo pipefail
cd /app
echo "[gruaya] aplicando migraciones…"
npx prisma migrate deploy
if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "[gruaya] cargando datos de prueba (SEED_DEMO=1)…"
  npx tsx prisma/seed.ts
fi
echo "[gruaya] iniciando en el puerto ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
