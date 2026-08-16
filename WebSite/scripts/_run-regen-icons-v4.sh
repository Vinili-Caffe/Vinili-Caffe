#!/bin/bash
set -e
python3 /tmp/vc-regen-icons-v4.py
nginx -t
systemctl reload nginx

echo '=== icons http ==='
for u in /apple-touch-icon.png /apple-touch-icon-precomposed.png /images/apple-touch-icon-v4.png /images/pwa-icon-192-v4.png /site.webmanifest; do
  curl -sS --resolve www.viniliecaffe.it:443:127.0.0.1 -o /tmp/i.bin -w "%{http_code} %{content_type} %{size_download} ${u}\n" "https://www.viniliecaffe.it${u}"
done
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in [
    "/var/www/viniliecaffe/apple-touch-icon.png",
    "/var/www/viniliecaffe/apple-touch-icon-precomposed.png",
    "/var/www/viniliecaffe/images/apple-touch-icon-v4.png",
]:
    im = Image.open(p)
    print(p, im.mode, im.size)
PY

python3 - <<'PY'
from pathlib import Path
import re
html = Path("/var/www/viniliecaffe/index.html").read_text(encoding="utf-8", errors="ignore")
# show first 2500 chars of head-ish icon tags
for m in re.finditer(r"<(?:link|meta)[^>]+(?:apple-touch|webmanifest|rel=[\"']icon)[^>]*>", html, flags=re.I):
    print(m.group(0)[:220])
PY

cp -f /var/www/viniliecaffe/images/apple-touch-icon-v4.png \
      /var/www/viniliecaffe/images/pwa-icon-192-v4.png \
      /var/www/viniliecaffe/images/pwa-icon-512-v4.png \
      /opt/bot/WebSite/images/ 2>/dev/null || true
mkdir -p /opt/bot/WebSite/images
cp -f /var/www/viniliecaffe/apple-touch-icon.png /var/www/viniliecaffe/apple-touch-icon-precomposed.png /opt/bot/WebSite/
cp -f /var/www/viniliecaffe/site.webmanifest /opt/bot/WebSite/site.webmanifest
echo DONE
