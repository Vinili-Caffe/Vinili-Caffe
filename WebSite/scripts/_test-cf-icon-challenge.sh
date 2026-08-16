#!/bin/bash
set -e
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
for u in \
  /apple-touch-icon-v5.png \
  /images/pwa-icon-512-v5.png \
  /images/vc-header-logo.png \
  /css/vc-landing.css \
  /site.webmanifest \
  /favicon.ico \
  /seratafilm/vinylmusics_logo_hd.png
do
  /usr/bin/curl -sS -A "$UA" -o /tmp/cf.bin -w "%{http_code} %{content_type} %{size_download}" --max-time 20 "https://www.viniliecaffe.it${u}"
  kind=$(file -b /tmp/cf.bin | cut -c1-50)
  echo " | ${kind} | ${u}"
done
echo '--- secrets scan ---'
grep -rIlE 'CLOUDFLARE|CF_API_TOKEN|CF_ZONE' /opt/bot --include='*.env' --include='*.json' 2>/dev/null | head -20 || true
