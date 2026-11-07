#!/usr/bin/env bash
# Pubblica sulla VPS (/opt/bot/bots-ts/src). I .ts si caricano e si compilano SULLA VPS (esbuild lì):
# in locale non serve Bots/node_modules. Sulla VPS il .js prende il posto del .ts (niente tsx a runtime).
# Gli altri file (json, immagini…) si caricano così come sono.
# Uso (da Git Bash, root repo o qualsiasi cwd):
#   bash Deploy/pubblica.sh "Vinili/Utils/noDmPanel.ts Vinili/Triggers/buttons.ts" "bots-vinyls"
#   bash Deploy/pubblica.sh "Vinili/Utils/Web/siteStaffCompitiApi.ts" "site-api bot-workers"
#   PROVA=1 bash Deploy/pubblica.sh "…" "…"   → compile remota + check, niente install/restart
# Oppure da Bots: npm run pubblica -- "Vinili/…" "bots-vinyls"
# Percorsi relativi a Bots/src/. Backup in /root/vc_bot_bak_<data>.
set -euo pipefail
FILES="${1:?file da pubblicare (relativi a src/, es. Vinili/Utils/x.ts)}"
PROCS="${2:?processi da riavviare (es. bots-vinyls, bots-coffee, site-api, bot-workers)}"

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
BOTS_DIR="$REPO_ROOT/Bots"
cd "$BOTS_DIR"

BOTS_TS_REMOTE="/opt/bot/bots-ts"
tmp_name() { echo "$1" | tr '/' '_'; }

TS_LIST=""
OTHER_LIST=""
for f in $FILES; do
  f="${f#./}"
  f="${f#src/}"
  [ -f "src/$f" ] || { echo "manca Bots/src/$f" >&2; exit 1; }
  if [[ "$f" == *.ts && "$f" != *.d.ts ]]; then
    [[ "$f" == "Vinili/Config/idsCatalog.ts" ]] && { echo "idsCatalog.js lo rigenera il bot sulla VPS: non si sovrascrive" >&2; exit 1; }
    TS_LIST="$TS_LIST $f"
  else
    OTHER_LIST="$OTHER_LIST $f"
  fi
done

ssh vinili "[ ! -f $BOTS_TS_REMOTE/src/wait-for-lavalink.ts ]" || {
  echo "la VPS gira ancora con tsx sui .ts: migrazione .ts→.js incompleta" >&2
  exit 1
}

# Tooling compile sulla VPS (idempotente)
ssh vinili "mkdir -p $BOTS_TS_REMOTE/tools"
scp -q "$DEPLOY_DIR/compila.mjs" "vinili:$BOTS_TS_REMOTE/tools/compila.mjs"
scp -q "$BOTS_DIR/tsconfig.json" "vinili:$BOTS_TS_REMOTE/tsconfig.json"
scp -q "$BOTS_DIR/package.json" "vinili:$BOTS_TS_REMOTE/package.json"

for f in $TS_LIST; do
  scp -q "src/$f" "vinili:/tmp/vcbot_$(tmp_name "$f")"
done
for f in $OTHER_LIST; do
  scp -q "src/$f" "vinili:/tmp/vcbot_$(tmp_name "$f")"
done

if [ -n "${PROVA:-}" ]; then
  ssh vinili "TS_LIST='$TS_LIST' OTHER_LIST='$OTHER_LIST' BOTS_TS='$BOTS_TS_REMOTE' bash -s" <<'REMOTE'
set -euo pipefail
tmp_name() { echo "$1" | tr '/' '_'; }
STAGE=$(mktemp -d /tmp/vc_pubblica_prova.XXXXXX)
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
mkdir -p "$STAGE/src"
cp -a "$BOTS_TS/tsconfig.json" "$STAGE/tsconfig.json" 2>/dev/null || true
for f in $TS_LIST; do
  mkdir -p "$STAGE/src/$(dirname "$f")"
  cp -a "/tmp/vcbot_$(tmp_name "$f")" "$STAGE/src/$f"
done
if [ -n "${TS_LIST// /}" ]; then
  # shellcheck disable=SC2086
  COMPILA_ROOT="$STAGE" node "$BOTS_TS/tools/compila.mjs" $TS_LIST
  for f in $TS_LIST; do
    js="${f%.ts}.js"
    node --check "$STAGE/build/js/$js"
    echo "ok (prova): $js"
  done
fi
for f in $OTHER_LIST; do
  echo "ok (prova): $f"
done
echo "prova finita: niente installato sulla VPS"
for f in $TS_LIST $OTHER_LIST; do
  rm -f "/tmp/vcbot_$(tmp_name "$f")"
done
REMOTE
  exit 0
fi

echo "carico su $BOTS_TS_REMOTE/src e riavvio: $PROCS"
ssh vinili "TS_LIST='$TS_LIST' OTHER_LIST='$OTHER_LIST' PROCS='$PROCS' BOTS_TS='$BOTS_TS_REMOTE' bash -s" <<'REMOTE'
set -euo pipefail
tmp_name() { echo "$1" | tr '/' '_'; }
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"

if [ -n "${TS_LIST// /}" ]; then
  STAGE=$(mktemp -d /tmp/vc_pubblica_stage.XXXXXX)
  mkdir -p "$STAGE/src"
  cp -a "$BOTS_TS/tsconfig.json" "$STAGE/tsconfig.json" 2>/dev/null || true
  for f in $TS_LIST; do
    mkdir -p "$STAGE/src/$(dirname "$f")"
    cp -a "/tmp/vcbot_$(tmp_name "$f")" "$STAGE/src/$f"
  done
  # shellcheck disable=SC2086
  COMPILA_ROOT="$STAGE" node "$BOTS_TS/tools/compila.mjs" $TS_LIST
  for f in $TS_LIST; do
    js="${f%.ts}.js"
    node --check "$STAGE/build/js/$js"
    dest="$BOTS_TS/src/$js"
    mkdir -p "$B/$(dirname "$js")" "$(dirname "$dest")"
    [ -f "$dest" ] && cp -a "$dest" "$B/$js"
    ts="$BOTS_TS/src/$f"
    if [ -f "$ts" ]; then cp -a "$ts" "$B/$f"; rm -f "$ts"; fi
    install -m 644 "$STAGE/build/js/$js" "$dest"
    rm -f "/tmp/vcbot_$(tmp_name "$f")"
    echo "pubblicato: $js"
  done
  rm -rf "$STAGE"
fi

for f in $OTHER_LIST; do
  tmp="/tmp/vcbot_$(tmp_name "$f")"
  dest="$BOTS_TS/src/$f"
  mkdir -p "$B/$(dirname "$f")" "$(dirname "$dest")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$f"
  install -m 644 "$tmp" "$dest"
  rm -f "$tmp"
  echo "pubblicato: $f"
done

for p in $PROCS; do pm2 restart "$p" >/dev/null 2>&1 || echo "ATTENZIONE: pm2 non trova $p (non riavviato)"; done
sleep 12
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) " || pm2 ls
echo "backup in $B"
REMOTE
