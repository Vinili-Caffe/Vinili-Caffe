#!/bin/bash
set -euo pipefail

# Installa un cron giornaliero alle 00:00 (Europe/Rome) per eseguire deploy/backup-mongo.sh
# Uso: bash deploy/install-backup-mongo-cron.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
JOB="CRON_TZ=Europe/Rome 0 0 * * * \"$DIR/backup-mongo.sh\" >/dev/null 2>&1 # vc-local-mongo-backup"

if [[ ! -x "$DIR/backup-mongo.sh" ]]; then
  echo "Manca o non è eseguibile: $DIR/backup-mongo.sh"
  echo "Fai: chmod +x \"$DIR/backup-mongo.sh\""
  exit 1
fi

CURRENT="$(crontab -l 2>/dev/null || true)"
if echo "$CURRENT" | grep -Fq "vc-local-mongo-backup"; then
  echo "OK: cron già presente."
  exit 0
fi

(echo "$CURRENT"; echo "$JOB") | crontab -
echo "OK: cron installato:"
echo "$JOB"
