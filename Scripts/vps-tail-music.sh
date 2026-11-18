#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "uptime vinyls:"
pm2 describe bots-vinyls | grep -E 'status|uptime|restarts' | head -10
echo "=== out last 80 ==="
tail -n 80 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
echo "=== err last 40 ==="
tail -n 40 /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
echo "=== music grep last 50 ==="
grep -iE 'MUSIC|alwaysOn|Shoukaku|DEBUG lavalink|Lavalink non' /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log | tail -50
