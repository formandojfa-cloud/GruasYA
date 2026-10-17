#!/usr/bin/env bash
# Instalación en un VPS Ubuntu/Debian recién creado (Hostinger, etc.). Ejecutar como root:
#   curl -fsSL https://raw.githubusercontent.com/formandojfa-cloud/GruasYA/claude/roadside-assistance-app-ch0lrd/deploy/instalar.sh | bash
# Instala Docker, clona el repositorio en /opt/gruaya y deja listo el .env para que lo rellenes.
set -euo pipefail
RAMA=${RAMA:-claude/roadside-assistance-app-ch0lrd}
DESTINO=${DESTINO:-/opt/gruaya}

if ! command -v docker >/dev/null 2>&1; then
  echo "[gruaya] instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || { apt-get update && apt-get install -y git; }

if [ ! -d "$DESTINO/.git" ]; then
  git clone --branch "$RAMA" https://github.com/formandojfa-cloud/GruasYA.git "$DESTINO"
else
  git -C "$DESTINO" fetch origin "$RAMA" && git -C "$DESTINO" checkout "$RAMA" && git -C "$DESTINO" pull --ff-only origin "$RAMA"
fi
cd "$DESTINO"
if [ ! -f .env ]; then
  cp deploy/.env.example .env
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" .env
  echo
  echo "[gruaya] Listo. Ahora edita $DESTINO/.env (nano .env): DOMINIO, DATABASE_URL (Supabase) y PBX_PASSWORD."
  echo "[gruaya] Luego: cd $DESTINO && bash deploy/actualizar.sh"
else
  echo "[gruaya] .env ya existe; no se tocó."
fi
