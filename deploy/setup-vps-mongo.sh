#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_ROOT="$(cd "$DIR/.." && pwd)"
ENV="${BOT_ENV:-$BOT_ROOT/.env}"
cd "$DIR"
chmod +x start-mongo.sh backup-mongo.sh restore-mongo.sh 2>/dev/null || true
if [[ ! -f "$ENV" ]]; then
  echo "Manca $ENV — aggiungi MONGO_INITDB_ROOT_USERNAME e MONGO_INITDB_ROOT_PASSWORD"
  exit 1
fi
chmod 600 "$ENV" 2>/dev/null || true
./start-mongo.sh
mkdir -p backups
echo ""
echo "Prossimi passi manuali:"
echo "1) Nel .env del bot: MONGO_URL=mongodb://USER:PASS@127.0.0.1:27017/NOMEDB?authSource=admin"
echo "2) pm2 restart all --update-env"
echo "3) (opzionale) Dump da Atlas → vedi MONGODB-VPS.md"
echo "4) Cron backup: bash deploy/install-backup-mongo-cron.sh"
