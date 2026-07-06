#!/usr/bin/env bash
# Deploy backend (Vinyls/Coffee/shared/Lavalink) su VPS via SSH.
# Su Linux usa questo al posto di deploy-all.ps1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_TARGET="${DEPLOY_SSH:-vinili}"
BOT_REMOTE_PATH="${BOT_REMOTE_PATH:-/opt/bot}"
PM2_APP="${PM2_APP_NAME:-bots}"
SKIP_RESTART=0

usage() {
  echo "Uso: $0 [--skip-restart] [--ssh TARGET]"
  echo "  TARGET default: vinili (alias in ~/.ssh/config)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-restart) SKIP_RESTART=1; shift ;;
    --ssh) SSH_TARGET="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Opzione sconosciuta: $1"; usage ;;
  esac
done

if [[ -z "$SSH_TARGET" ]]; then
  echo "TARGET SSH mancante."
  exit 1
fi

for cmd in ssh scp tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Comando richiesto non trovato: $cmd"
    exit 1
  fi
done

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)

phase() {
  printf '==> %s\n' "$*"
}

if command -v node >/dev/null 2>&1; then
  phase "Validazione config JSON..."
  node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    for (const f of ["Vinyls/config.json", "Coffee/config.json"]) {
      JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
    }
    console.log("Config JSON OK.");
  ' "$ROOT"
fi

LOCAL_TGZ="$(mktemp /tmp/vc-bot-src-XXXXXX.tar.gz)"
REMOTE_TGZ="/tmp/vc-bot-src-$(date +%s)-$$.tar.gz"
trap 'rm -f "$LOCAL_TGZ"' EXIT

cd "$ROOT"

EXCLUDES=(
  --exclude=.git
  --exclude=node_modules
  --exclude=.cursor
  --exclude=WebSite/dist
  --exclude=Lavalink/plugins
  --exclude=Lavalink/Lavalink.jar
  --exclude=Lavalink/.env.lavalink
  --exclude=WebSite/images/evento-hogwarts/harry-potter-pietra-filosofale.mp4
  --exclude=WebSite/images/evento-hogwarts/inizio.mp4
  --exclude=WebSite/images/evento-hogwarts/smistamento.mp4
)

while IFS= read -r -d '' file; do
  rel="${file#"$ROOT"/}"
  EXCLUDES+=(--exclude="$rel")
done < <(
  find Vinyls WebSite/images/evento-hogwarts shared Coffee scripts Lavalink \
    -type f -size +40M -print0 2>/dev/null || true
)

phase "Creo archivio backend..."
tar -czf "$LOCAL_TGZ" "${EXCLUDES[@]}" \
  Vinyls WebSite/images/evento-hogwarts shared Coffee scripts \
  package.json package-lock.json wait-for-lavalink.js loader.js \
  ecosystem.config.cjs Lavalink

MB="$(du -m "$LOCAL_TGZ" | awk '{print $1}')"
phase "Archivio backend: ${MB} MB"
if [[ "${MB:-0}" -gt 200 ]]; then
  echo "ATTENZIONE: archivio >200 MB — verifica che i video non siano inclusi."
fi

phase "Upload su ${SSH_TARGET}..."
scp "${SSH_OPTS[@]}" "$LOCAL_TGZ" "${SSH_TARGET}:${REMOTE_TGZ}"

LAVALINK_ENV="$ROOT/Lavalink/.env.lavalink"
if [[ -f "$LAVALINK_ENV" ]]; then
  phase "Upload Lavalink/.env.lavalink..."
  scp "${SSH_OPTS[@]}" "$LAVALINK_ENV" "${SSH_TARGET}:/tmp/vc-deploy-lavalink.env"
else
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "rm -f /tmp/vc-deploy-lavalink.env" || true
fi

phase "Esecuzione deploy remoto..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" <<REMOTE
set -eu
BOT_REMOTE_PATH='$BOT_REMOTE_PATH'
PM2_APP='$PM2_APP'
REMOTE_TGZ='$REMOTE_TGZ'
SKIP_RESTART='$SKIP_RESTART'

mkdir -p "\$BOT_REMOTE_PATH"
OLD_LAVALINK_CONFIG_HASH=\$(if [ -d "\$BOT_REMOTE_PATH/Lavalink" ]; then find "\$BOT_REMOTE_PATH/Lavalink" -maxdepth 1 -type f \\( -name 'application.yml' -o -name 'start-lavalink.sh' -o -name '.env.lavalink' \\) -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print \$1}'; fi)
tar -xzf "\$REMOTE_TGZ" -C "\$BOT_REMOTE_PATH"
rm -f "\$REMOTE_TGZ"

LAVALINK_DIR="\$BOT_REMOTE_PATH/Lavalink"
LAVALINK_JAR_URL='https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar'
mkdir -p "\$LAVALINK_DIR/plugins"
if [ -f /tmp/vc-deploy-lavalink.env ]; then
  mkdir -p "\$LAVALINK_DIR"
  cp /tmp/vc-deploy-lavalink.env "\$LAVALINK_DIR/.env.lavalink"
  chmod 600 "\$LAVALINK_DIR/.env.lavalink"
  rm -f /tmp/vc-deploy-lavalink.env
  echo "[deploy] Lavalink/.env.lavalink da upload locale"
fi
if [ ! -f "\$LAVALINK_DIR/Lavalink.jar" ]; then
  echo "[deploy] Scarico Lavalink.jar (4.2.2)..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "\$LAVALINK_DIR/Lavalink.jar.part" "\$LAVALINK_JAR_URL" && mv -f "\$LAVALINK_DIR/Lavalink.jar.part" "\$LAVALINK_DIR/Lavalink.jar"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "\$LAVALINK_DIR/Lavalink.jar.part" "\$LAVALINK_JAR_URL" && mv -f "\$LAVALINK_DIR/Lavalink.jar.part" "\$LAVALINK_DIR/Lavalink.jar"
  else
    echo "[deploy] ERRORE: serve curl o wget per scaricare Lavalink.jar" >&2
    exit 1
  fi
fi
if [ -f "\$LAVALINK_DIR/start-lavalink.sh" ]; then chmod +x "\$LAVALINK_DIR/start-lavalink.sh"; fi
NEW_LAVALINK_CONFIG_HASH=\$(find "\$BOT_REMOTE_PATH/Lavalink" -maxdepth 1 -type f \\( -name 'application.yml' -o -name 'start-lavalink.sh' -o -name '.env.lavalink' \\) -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print \$1}')
if [ "\$OLD_LAVALINK_CONFIG_HASH" != "\$NEW_LAVALINK_CONFIG_HASH" ]; then
  LAVALINK_CONFIG_CHANGED=1
  echo "[deploy] Lavalink config cambiata: reload lavalink richiesto."
else
  LAVALINK_CONFIG_CHANGED=0
  echo "[deploy] Lavalink config invariata: reload lavalink saltato."
fi
if [ "\$LAVALINK_CONFIG_CHANGED" = "1" ]; then
  rm -f "\$LAVALINK_DIR"/plugins/youtube-plugin-*.jar "\$LAVALINK_DIR"/plugins/lavasrc-plugin-*.jar
fi

NEW_LOCK_HASH=""
if [ -f "\$BOT_REMOTE_PATH/package-lock.json" ]; then
  NEW_LOCK_HASH=\$(sha256sum "\$BOT_REMOTE_PATH/package-lock.json" | awk '{print \$1}')
fi
APP_PID=\$(pm2 pid "\$PM2_APP" 2>/dev/null | head -n 1 | tr -d '[:space:]')
if [ -n "\$APP_PID" ] && [ "\$APP_PID" != "0" ] && [ -e "/proc/\$APP_PID/exe" ]; then
  NODE_BIN=\$(readlink -f "/proc/\$APP_PID/exe")
else
  NODE_BIN=\$(command -v node)
fi
if [ -z "\$NODE_BIN" ] || [ ! -x "\$NODE_BIN" ]; then
  echo "Node non trovato sul server" >&2
  exit 1
fi
NODE_DIR=\$(dirname "\$NODE_BIN")
NPM_CLI=\$(dirname "\$(dirname "\$NODE_BIN")")/lib/node_modules/npm/bin/npm-cli.js
if [ ! -f "\$NPM_CLI" ]; then
  echo "npm-cli.js non trovato per il runtime selezionato" >&2
  exit 1
fi
export PATH="\$NODE_DIR:\$PATH"
echo "Using Node: \$NODE_BIN"
"\$NODE_BIN" -v
cd "\$BOT_REMOTE_PATH"
"\$NODE_BIN" -e 'for (const f of ["Vinyls/config.json","Coffee/config.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("[deploy] Bot config JSON OK.")'
NODE_ABI=\$("\$NODE_BIN" -p "process.versions.modules")
NEED_INSTALL=0
if [ ! -d node_modules ]; then NEED_INSTALL=1
elif [ -z "\$NEW_LOCK_HASH" ]; then NEED_INSTALL=1
elif [ ! -f node_modules/.vc-installed-lock.sha256 ]; then NEED_INSTALL=1
elif [ "\$(cat node_modules/.vc-installed-lock.sha256)" != "\$NEW_LOCK_HASH" ]; then NEED_INSTALL=1
elif [ ! -f node_modules/.vc-installed-node-abi ]; then NEED_INSTALL=1
elif [ "\$(cat node_modules/.vc-installed-node-abi)" != "\$NODE_ABI" ]; then NEED_INSTALL=1
fi
if [ "\$NEED_INSTALL" = "1" ]; then
  echo "Dependency install required."
  rm -rf node_modules/canvas Vinyls/node_modules/canvas Coffee/node_modules/canvas
  "\$NODE_BIN" "\$NPM_CLI" ci --omit=dev --no-audit --no-fund --loglevel=error || "\$NODE_BIN" "\$NPM_CLI" install --omit=dev --no-audit --no-fund --loglevel=error
  printf %s "\$NEW_LOCK_HASH" > node_modules/.vc-installed-lock.sha256
  printf %s "\$NODE_ABI" > node_modules/.vc-installed-node-abi
else
  echo "Dependencies unchanged, skipping npm install."
fi
cd "\$BOT_REMOTE_PATH/Vinyls"
if "\$NODE_BIN" -e 'require("canvas")' >/dev/null 2>&1; then
  echo "Canvas already OK."
else
  echo "Canvas rebuild required."
  rm -rf ../node_modules/canvas node_modules/canvas
  "\$NODE_BIN" "\$NPM_CLI" install canvas@2.11.2 --omit=dev --foreground-scripts --no-audit --no-fund --loglevel=error
fi
"\$NODE_BIN" -e 'require("canvas"); console.log("canvas-ok")'

if [ "\$SKIP_RESTART" = "1" ]; then
  echo "Restart PM2 saltato (--skip-restart)"
else
  if [ -f "\$BOT_REMOTE_PATH/ecosystem.config.cjs" ]; then
    if ! pm2 describe lavalink >/dev/null 2>&1 || ! pm2 describe "\$PM2_APP" >/dev/null 2>&1; then
      pm2 start "\$BOT_REMOTE_PATH/ecosystem.config.cjs" --update-env
    elif [ "\$LAVALINK_CONFIG_CHANGED" = "1" ]; then
      pm2 reload "\$BOT_REMOTE_PATH/ecosystem.config.cjs" --update-env
    else
      pm2 reload "\$PM2_APP" --update-env
    fi
  else
    pm2 restart "\$PM2_APP" --update-env || true
  fi
  for pm2_name in lavalink "\$PM2_APP"; do
    pm2_pid=\$(pm2 pid "\$pm2_name" 2>/dev/null | head -n 1 | tr -d '[:space:]')
    if [ -n "\$pm2_pid" ] && [ "\$pm2_pid" != "0" ]; then
      echo "  \$pm2_name: online pid=\$pm2_pid"
    else
      echo "  \$pm2_name: offline"
    fi
  done
fi
REMOTE

phase "Deploy backend completato su ${SSH_TARGET}:${BOT_REMOTE_PATH}"
