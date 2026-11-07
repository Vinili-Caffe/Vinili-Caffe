#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_ROOT="$(cd "$DIR/.." && pwd)"
F="${BOT_ENV:-$BOT_ROOT/.env}"
if [[ ! -f "$F" ]]; then
  echo "Manca $F"
  exit 1
fi
if grep -q $'\r' "$F" 2>/dev/null; then
  echo "Trovato CRLF in $F — converto (sudo dos2unix)."
  command -v dos2unix >/dev/null || { echo "Installa: sudo apt install dos2unix"; exit 1; }
  sudo dos2unix "$F"
  echo "Fatto. Se Mongo era stato creato con password sporca: docker compose down -v && ./start-mongo.sh (volume nuovo)."
else
  echo "Nessun CRLF in $F"
fi
