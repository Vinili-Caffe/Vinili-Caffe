#!/bin/bash
set -euo pipefail
cd /opt/bot/WebSite
set -a
# shellcheck disable=SC1091
. /opt/bot/.env
set +a
export VC_LIVE_STATS_JSON_OUT=/var/www/viniliecaffe/live-stats-extra.json
node scripts/build-site.mjs --only-live-stats-extra
if [ -f /opt/bot/deploy/patch-homepage-vc-live-staff.py ]; then
  python3 /opt/bot/deploy/patch-homepage-vc-live-staff.py \
    /var/www/viniliecaffe/index.html \
    /var/www/viniliecaffe/live-stats-extra.json
fi
