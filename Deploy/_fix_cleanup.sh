#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash Deploy/pubblica.sh "Vinili/site/workers/botSchedulerWorkerApp.ts Vinili/core/events/ready.ts" "bot-workers bots-vinyls" </dev/null
ssh vinili bash -s </dev/null <<'EOF'
sleep 8
# confirm cleanup no longer in worker app source
grep -n "runFullCleanupUsersNotInServer\|cleanup users-not-in-server" /opt/bot/bots-ts/src/Vinili/site/workers/botSchedulerWorkerApp.js | head -5 || echo "worker_cleanup_gone"
# watch workers for spam for a few seconds
WO=$(pm2 jlist | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{console.log(JSON.parse(d).find(x=>x.name==="bot-workers").pm2_env.pm_out_log_path)})')
BEFORE=$(wc -c < "$WO")
sleep 20
AFTER=$(wc -c < "$WO")
NEW=$(tail -c $((AFTER-BEFORE+1)) "$WO" 2>/dev/null || true)
echo "$NEW" | grep -c "CLEANUP USERS NOT IN SERVER" || echo "spam_count=0"
echo "$NEW" | grep -E "BOT-SCHEDULER\] online|CLEANUP" | head -10 || true
EOF
