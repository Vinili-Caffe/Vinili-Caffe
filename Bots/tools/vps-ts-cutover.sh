#!/usr/bin/env bash
# Prima attivazione VPS solo-TypeScript:
#   - sync bots-ts/ (src + package) → /opt/bot/bots-ts
#   - npm i tsx in bots-ts; collega node_modules/Data dai bot JS legacy
#   - aggiorna ecosystem.config.cjs e ricarica PM2
# Uso (Git Bash, da bots-ts/):
#   bash tools/vps-ts-cutover.sh
#   PROVA=1 bash tools/vps-ts-cutover.sh   # solo pack locale, niente SSH
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(cd .. && pwd)"
ARCHIVE=/tmp/vc-bots-ts-src.tgz

echo "pack bots-ts (senza node_modules/dist)…"
rm -f "$ARCHIVE"
tar -czf "$ARCHIVE" \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.tsbuildinfo \
  -C . \
  package.json src tools/pubblica.sh

[ -n "${PROVA:-}" ] && { echo "prova: creato $ARCHIVE ($(wc -c <"$ARCHIVE") bytes)"; exit 0; }

echo "carico archive + ecosystem…"
scp -q "$ARCHIVE" vinili:/tmp/vc-bots-ts-src.tgz
scp -q "$REPO/ecosystem.config.cjs" vinili:/tmp/vc-ecosystem.config.cjs

echo "cutover remoto…"
ssh vinili 'bash -s' <<'REMOTE'
set -euo pipefail
N=/root/.nvm/versions/node/v22.22.2/bin/node
NPM=/root/.nvm/versions/node/v22.22.2/bin/npm
export PATH="$(dirname "$N"):$PATH"
B=/opt/bot
TS="$B/bots-ts"
BAK=/root/vc_bot_ts_cutover_$(date +%Y%m%d-%H%M%S)
mkdir -p "$BAK"

if [ -d "$TS" ]; then
  echo "backup bots-ts → $BAK"
  cp -a "$TS" "$BAK/bots-ts" 2>/dev/null || true
fi
mkdir -p "$TS"
tar -xzf /tmp/vc-bots-ts-src.tgz -C "$TS"
# rimuovi vecchi nomi cartella se presenti
rm -rf "$TS/src/Vinyls" "$TS/src/Vinil" "$TS/src/Coffee"
install -m 644 /tmp/vc-ecosystem.config.cjs "$B/ecosystem.config.cjs"

# deps runtime TS
cd "$TS"
$NPM install --omit=dev --no-fund --no-audit

# srcName = cartella in bots-ts/src (Vinili/Caffè); legacyName = /opt/bot/Vinyls|Coffee (Data/node_modules).
link_runtime() {
  local srcName="$1"
  local legacyName="${2:-$1}"
  local legacy="$B/$legacyName"
  local dest="$TS/src/$srcName"
  mkdir -p "$dest"
  # Sempre: Data/Photos/node_modules dal legacy (runtime vero). Se dest/Data è una
  # cartella syncata vuota/incompleta, sostituisci col link.
  for d in node_modules Data Photos UI; do
    [ -e "$legacy/$d" ] || continue
    if [ -L "$dest/$d" ]; then
      ln -sfn "$legacy/$d" "$dest/$d"
      echo "relink $srcName/$d → legacy $legacyName"
    elif [ -d "$dest/$d" ] && [ "$d" = "Data" -o "$d" = "Photos" -o "$d" = "UI" ]; then
      # cartella codice syncata: meglio il Data live della VPS
      rm -rf "$dest/$d"
      ln -sfn "$legacy/$d" "$dest/$d"
      echo "replace $srcName/$d → legacy $legacyName symlink"
    elif [ ! -e "$dest/$d" ]; then
      ln -sfn "$legacy/$d" "$dest/$d"
      echo "link $srcName/$d → legacy $legacyName"
    fi
  done
  if [ ! -e "$dest/node_modules" ] && [ -f "$dest/package.json" ]; then
    echo "npm install in src/$srcName…"
    (cd "$dest" && $NPM install --legacy-peer-deps --no-fund --no-audit) || true
  fi
}
link_runtime Vinili Vinyls
link_runtime Caffè Coffee

# tsx anche in root bot (site-api cwd=/opt/bot risolve --import tsx)
cd "$B"
if [ ! -d node_modules/tsx ]; then
  $NPM install tsx@^4 --no-save --no-fund --no-audit 2>/dev/null || \
    $NPM install tsx@^4 --omit=dev --no-fund --no-audit || true
fi

echo "pm2: delete+start (reload non aggiorna lo script path)…"
# processi che devono puntare a bots-ts/src
for p in bots-vinyls bots-coffee site-api discadia-votes topgg-votes vote-drain partnership-migration bot-scheduler community-poll auto-backup; do
  pm2 delete "$p" >/dev/null 2>&1 || true
done
pm2 start "$B/ecosystem.config.cjs" --update-env
sleep 20
pm2 ls
echo "---"
echo "Atteso: bots-vinyls script = …/bots-ts/src/wait-for-lavalink.ts"
pm2 show bots-vinyls 2>/dev/null | grep -E 'script path|exec cwd|interpreter|status' || true
echo "cutover TS ok. Legacy JS in $B/Vinyls resta per Data/node_modules/rollback."
REMOTE
