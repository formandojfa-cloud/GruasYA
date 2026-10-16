#!/usr/bin/env bash
# Reinicia el servidor de desarrollo (útil tras cambiar prisma/schema.prisma o next.config.ts).
#   bash scripts/dev-restart.sh [puerto] [archivo de log]
set -u
PORT="${1:-3000}"
LOG="${2:-/tmp/claude-0/-home-user-777/3c7061eb-66bc-51f7-b9fb-911ed3e92787/scratchpad/dev.log}"
cd "$(dirname "$0")/.."
for pid in $(pgrep -f "next dev" || true) $(pgrep -f "next-server" || true); do kill "$pid" 2>/dev/null || true; done
sleep 2
rm -rf .next/dev
PORT="$PORT" nohup npm run dev >"$LOG" 2>&1 &
for _ in $(seq 1 60); do
  sleep 2
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo "dev server listo en http://localhost:$PORT"
    exit 0
  fi
done
echo "el servidor no respondió; revisa $LOG" >&2
exit 1
