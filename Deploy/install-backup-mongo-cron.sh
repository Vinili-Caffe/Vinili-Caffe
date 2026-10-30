#!/bin/bash
set -euo pipefail

# Installa un cron giornaliero alle 00:00 (Europe/Rome) per eseguire deploy/backup-mongo.sh
# Uso: bash deploy/install-backup-mongo-cron.sh
# I log vanno in deploy/backups/cron-backup.log (controlla lì se il backup non parte).

DIR="$(cd "$(dirname "$0")" && pwd)"
LOGFILE="$DIR/backups/cron-backup.log"
mkdir -p "$DIR/backups"
# Redirect su file così vedi eventuali errori (docker non trovato, container spento, ecc.)
JOB="0 0 * * * TZ=Europe/Rome bash $DIR/backup-mongo.sh >> \"$LOGFILE\" 2>&1 # vc-local-mongo-backup"

if [[ ! -x "$DIR/backup-mongo.sh" ]]; then
  echo "Manca o non è eseguibile: $DIR/backup-mongo.sh"
  echo "Fai: chmod +x \"$DIR/backup-mongo.sh\""
  exit 1
fi

CURRENT="$(crontab -l 2>/dev/null || true)"
if echo "$CURRENT" | grep -Fq "vc-local-mongo-backup"; then
  echo "OK: cron già presente. Per aggiornare il job (es. log file) rimuovilo e reinstalla."
  echo "  crontab -e  → elimina la riga con vc-local-mongo-backup"
  echo "  Poi riesegui: bash \"$DIR/install-backup-mongo-cron.sh\""
  exit 0
fi

(echo "$CURRENT"; echo "$JOB") | crontab -
echo "OK: cron installato (backup MongoDB ogni giorno alle 00:00 Europe/Rome)."
echo "    Script: $DIR/backup-mongo.sh"
echo "    Log:    $LOGFILE"
echo ""
echo "Per provare subito: $DIR/backup-mongo.sh"
