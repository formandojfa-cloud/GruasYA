#!/usr/bin/env bash
# Trae la última versión de la rama y reconstruye la app sin perder datos (están en Supabase).
#   cd /opt/gruaya && bash deploy/actualizar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAMA=$(git rev-parse --abbrev-ref HEAD)
git pull --ff-only origin "$RAMA"
docker compose build --pull app
docker compose up -d --remove-orphans
docker compose ps
echo "[gruaya] desplegado $(git rev-parse --short HEAD). Logs: docker compose logs -f app"
