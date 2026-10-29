#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_ROOT="$(cd "$DIR/.." && pwd)"
ENV="${BOT_ENV:-$BOT_ROOT/.env}"
if [[ ! -f "$ENV" ]]; then
  echo "Manca $ENV — serve MONGO_INITDB_ROOT_USERNAME e MONGO_INITDB_ROOT_PASSWORD"
  exit 1
fi
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV"
set +a
if [[ -z "${MONGO_INITDB_ROOT_USERNAME:-}" || -z "${MONGO_INITDB_ROOT_PASSWORD:-}" ]]; then
  echo "In $ENV mancano MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD"
  exit 1
fi
cd "$DIR"
mkdir -p "$DIR/backups"
# Compose prende i due MONGO_INITDB_* dall'ambiente (niente file .env.mongo separato).
docker compose -f docker-mongodb-compose.yml up -d
docker compose -f docker-mongodb-compose.yml ps
