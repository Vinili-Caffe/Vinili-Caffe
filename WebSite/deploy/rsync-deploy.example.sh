#!/usr/bin/env bash
set -euo pipefail
# Esempio: dopo "npm run build" in WebSite/, sincronizza dist/ sulla VPS.
# Copia questo file, rendilo eseguibile (chmod +x), imposta HOST e REMOTE_PATH.

HOST="user@IP_O_HOSTNAME"
REMOTE_PATH="/var/www/viniliecaffe"

cd "$(dirname "$0")/.."
npm run build
rsync -avz --delete ./dist/ "${HOST}:${REMOTE_PATH}/"
