#!/bin/bash
set -e
echo "==== vapid http ===="
curl -sS --resolve www.viniliecaffe.it:443:127.0.0.1 https://www.viniliecaffe.it/webhooks/site-notifications/push/vapid-public-key
echo
echo "==== dotenv refs ===="
grep -n dotenv /opt/bot/Vinyls/Services/Web/durableSiteApiApp.js /opt/bot/Vinyls/index.js 2>/dev/null | head -20
echo "==== bots environ VAPID ===="
BOTS_PID=$(pm2 pid bots)
API_PID=$(pm2 pid site-api)
tr '\0' '\n' < /proc/$BOTS_PID/environ 2>/dev/null | grep -E '^VAPID_|^WEBSITE_PUBLIC_ORIGIN' | sed 's/=.*/=***/' || true
echo "==== site-api environ VAPID ===="
tr '\0' '\n' < /proc/$API_PID/environ 2>/dev/null | grep -E '^VAPID_|^WEBSITE_PUBLIC_ORIGIN' | sed 's/=.*/=***/' || true
echo "==== runtime check via require in site cwd ===="
cd /opt/bot && node -e 'require("dotenv").config({path:"/opt/bot/.env"}); const s=require("./Vinyls/Utils/Web/siteWebPushService"); console.log({enabled:s.isPushEnabled(), pubLen:(s.getPublicVapidKey()||"").length});'
