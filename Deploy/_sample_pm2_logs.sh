#!/usr/bin/env bash
source "$HOME/.nvm/nvm.sh"
for p in bot-workers bots-vinyls bots-coffee site-api vote-intake spotify-token-cache; do
  echo "===== $p ====="
  pm2 logs "$p" --lines 40 --nostream 2>&1 | tail -28
done
