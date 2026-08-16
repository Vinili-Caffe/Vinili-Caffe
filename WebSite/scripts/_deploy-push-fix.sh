#!/bin/bash
set -e
python3 /tmp/vc-bust-landing.py
cp -f /var/www/viniliecaffe/js/vc-landing.js /opt/bot/WebSite/js/vc-landing.js
pm2 restart site-api --update-env
sleep 2
pm2 restart bots --update-env
sleep 3
pm2 describe site-api | sed -n '1,12p'
grep -o 'vc-landing.js?v=[^"]*' /var/www/viniliecaffe/index.html | head -3
grep -c shouldShowPushPrompt /var/www/viniliecaffe/js/vc-landing.js
grep -c 'urgency: "high"' /opt/bot/Vinyls/Utils/Web/siteWebPushService.js
