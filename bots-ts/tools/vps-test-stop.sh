#!/usr/bin/env bash
# Fine prova: ferma il bot di test TypeScript e rimette in moto quello originale (bots-coffee).
# /opt/bot-ts-test resta lì (si può cancellare con: rm -rf /opt/bot-ts-test), /opt/bot non è mai stato modificato.
set -euo pipefail
pm2 delete bots-coffee-ts >/dev/null 2>&1 || true
sleep 2
pm2 start bots-coffee >/dev/null
sleep 20
pm2 ls | grep -E "bots-coffee|bots-vinyls"
echo "bot di test originale di nuovo attivo"
