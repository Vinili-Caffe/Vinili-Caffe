#!/bin/bash
set -e
python3 /tmp/vc-force-ios-icon-v5.py
nginx -t
systemctl reload nginx

echo '=== verify http ==='
R=(--resolve www.viniliecaffe.it:443:127.0.0.1)
for u in \
  /apple-touch-icon.png \
  /apple-touch-icon-v5.png \
  /apple-touch-icon-180x180.png \
  /apple-touch-icon-precomposed.png \
  /favicon.ico \
  /images/pwa-icon-512-v5.png \
  /site.webmanifest
do
  curl -sS "${R[@]}" -o /tmp/i.bin -w "%{http_code} %{content_type} %{size_download} ${u}\n" "https://www.viniliecaffe.it${u}"
done

python3 /tmp/vc-inspect-icons-now.py

# sync to bot tree
mkdir -p /opt/bot/WebSite/images
cp -f /var/www/viniliecaffe/apple-touch-icon*.png /opt/bot/WebSite/ 2>/dev/null || true
cp -f /var/www/viniliecaffe/favicon.ico /var/www/viniliecaffe/favicon-v5.png /opt/bot/WebSite/ 2>/dev/null || true
cp -f /var/www/viniliecaffe/images/apple-touch-icon-v5.png \
      /var/www/viniliecaffe/images/pwa-icon-192-v5.png \
      /var/www/viniliecaffe/images/pwa-icon-512-v5.png \
      /opt/bot/WebSite/images/
cp -f /var/www/viniliecaffe/site.webmanifest /opt/bot/WebSite/site.webmanifest
echo DONE
