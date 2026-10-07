#!/bin/sh
set -e

# Crea el directorio de datos si no existe (volumen o bind mount)
mkdir -p "$(dirname "${DATABASE_PATH:-/data/steam_hub.db}")"

echo "Aplicando migraciones de SQLite en ${DATABASE_PATH:-/data/steam_hub.db}…"
node /app/scripts/docker-migrate.js

echo "Arrancando Steam Local Library Hub en el puerto ${PORT:-3000}…"
exec npx next start -p "${PORT:-3000}"
