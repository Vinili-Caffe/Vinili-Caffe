#!/bin/bash
set -e
# Cron ha PATH minimo: assicuriamo che docker sia trovato
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_ROOT="$(cd "$DIR/.." && pwd)"
ENV="${BOT_ENV:-$BOT_ROOT/.env}"
if [[ ! -f "$ENV" ]]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: Manca $ENV (MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD)"
  exit 1
fi
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV"
set +a
if [[ -z "${MONGO_INITDB_ROOT_USERNAME:-}" || -z "${MONGO_INITDB_ROOT_PASSWORD:-}" ]]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: in $ENV mancano MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: docker non trovato nel PATH"
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx vc-mongodb; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: Container vc-mongodb non in esecuzione — avvia prima start-mongo.sh"
  exit 1
fi
STAMP=$(date +%Y%m%d-%H%M%S)
TMP="/tmp/mongo-dump-$STAMP"
OUT="$DIR/backups/mongo-$STAMP"
mkdir -p "$DIR/backups"
docker exec vc-mongodb mongodump \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  -o "$TMP"
docker cp "vc-mongodb:$TMP" "$OUT"
docker exec vc-mongodb rm -rf "$TMP"
echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Backup completato: $OUT"
bash "$DIR/prune-mongo-backups.sh"