#!/bin/bash
echo "=== find movieNightVotes ==="
find /opt/bot -name 'movieNightVotes.js' 2>/dev/null
echo "=== community-poll cwd ==="
pm2 describe bot-work 2>/dev/null | grep -E 'script path|exec cwd|status' | head -20
echo "=== maybePublish body (first match) ==="
f=$(find /opt/bot -name 'movieNightVotes.js' 2>/dev/null | head -1)
echo "file=$f"
if [ -n "$f" ]; then
  grep -n -A40 'maybePublishTieBreakerPoll' "$f" | head -60
fi
echo "=== mongo state movie night ==="
# try mongosh quick
mongosh --quiet --eval 'db.getSiblingDB("vinili").botstates.find({_id:/movie|serata|MOVIE/i}).limit(5).toArray()' 2>/dev/null | head -40 || true
mongosh --quiet --eval 'db.getSiblingDB("bot").botstates.find({}).limit(3).toArray()' 2>/dev/null | head -20 || true
