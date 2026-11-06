#!/bin/bash
set -e
node -e 'console.log(require("/opt/bot/node_modules/discord.js/package.json").version)'
echo "--- MessagePayload poll ---"
grep -n poll /opt/bot/node_modules/discord.js/src/structures/MessagePayload.js 2>/dev/null | head -20 || true
echo "--- built movieNightVotes poll ---"
grep -n "poll" /opt/bot/bots-ts/build/js/Vinili/Community/services/movieNightVotes.js 2>/dev/null | head -20 || true
echo "--- pm2 err recent ---"
pm2 logs bot-work --err --lines 200 --nostream 2>/dev/null | grep -iE 'movie|tie|poll|serata|50035|Invalid Form' | tail -40 || true
pm2 logs bot-work --out --lines 200 --nostream 2>/dev/null | grep -iE 'movie|tie|poll|serata' | tail -40 || true
