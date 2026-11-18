#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/usr/local/bin:$PATH"

echo "=== pm2 list ==="
pm2 list

echo "=== lavalink describe ==="
pm2 describe lavalink 2>/dev/null | head -50 || echo "no lavalink process"

echo "=== lavalink logs ==="
pm2 logs lavalink --lines 80 --nostream 2>/dev/null | tail -80 || true

echo "=== port 2333 ==="
ss -lntp 2>/dev/null | grep -E '2333|2334' || netstat -lntp 2>/dev/null | grep -E '2333|2334' || true

echo "=== java ==="
java -version 2>&1 | head -3 || true

echo "=== lavalink dir ==="
ls -la /opt/bot/bots-ts/Lavalink 2>/dev/null | head -20 || ls -la /opt/bot/Lavalink 2>/dev/null | head -20 || true
