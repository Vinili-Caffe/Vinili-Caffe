#!/bin/bash
# Tiene gli N backup Mongo più recenti (cartelle mongo-YYYYMMDD-HHMMSS) e rimuove il resto.
# Uso: bash deploy/prune-mongo-backups.sh [keep_count]
# Env: MONGO_BACKUP_KEEP_COUNT (default 7)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUPS_DIR="$DIR/backups"
KEEP="${1:-${MONGO_BACKUP_KEEP_COUNT:-7}}"

if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [ "$KEEP" -lt 1 ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: keep_count non valido: $KEEP" >&2
  exit 1
fi

if [ ! -d "$BACKUPS_DIR" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Nessuna cartella backup ($BACKUPS_DIR), skip prune."
  exit 0
fi

mapfile -t DIRS < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -name 'mongo-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | cut -d' ' -f2-)
if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Nessun backup mongo-* da gestire."
  exit 0
fi

removed=0
for i in "${!DIRS[@]}"; do
  path="${DIRS[$i]}"
  name="$(basename "$path")"
  if [ "$i" -lt "$KEEP" ]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Tengo ($((i + 1))/$KEEP): $name"
    continue
  fi
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Rimuovo: $name"
  rm -rf "$path"
  removed=$((removed + 1))
done

echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Prune completato: tenuti ${KEEP}, rimossi ${removed}, totale prima ${#DIRS[@]}."
