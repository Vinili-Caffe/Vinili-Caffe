#!/usr/bin/env bash
# Prepara il cutover: build + promote, poi istruzioni per togliere gli originali JS da git.
# Non cancella i file da disco (lo fai tu dopo aver verificato).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== build + promote =="
node tools/build.mjs
node tools/promote.mjs
echo
echo "OK. Runtime root allineato a bots-ts/dist."
echo
echo "Per versionare SOLO TypeScript:"
echo "  1) verifica che i bot partano (npm start / PM2)"
echo "  2) git rm -r --cached Vinyls Coffee shared loader.js wait-for-lavalink.js"
echo "  3) decommenta il blocco BOTS RUNTIME GENERATO in .gitignore"
echo "  4) commit"
echo "  5) opzionale: rm -rf Vinyls Coffee shared  (poi sempre npm run build:bots prima di start)"
echo "  6) VPS: continua a pubblicare con tools/pubblica.sh (scrive in /opt/bot/...)"
