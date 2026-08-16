#!/bin/bash
set -euo pipefail
CONF=/etc/nginx/sites-enabled/viniliecaffe
BACKUP=/etc/nginx/sites-enabled/viniliecaffe.bak-ios-pwa-$(date +%Y%m%d%H%M%S)
cp -a "$CONF" "$BACKUP"

python3 - <<'PY'
from pathlib import Path
p = Path("/etc/nginx/sites-enabled/viniliecaffe")
text = p.read_text(encoding="utf-8")
marker = "    location ^~ /images/ {"
block = """    location = /site.webmanifest {
        default_type application/manifest+json;
        charset utf-8;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header CDN-Cache-Control "no-store" always;
        try_files $uri =404;
    }

    location = /apple-touch-icon.png {
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        add_header CDN-Cache-Control "max-age=0, must-revalidate" always;
        try_files $uri =404;
    }

"""
if "location = /site.webmanifest" in text:
    print("already_patched")
else:
    if marker not in text:
        raise SystemExit("marker not found")
    text = text.replace(marker, block + marker, 1)
    p.write_text(text, encoding="utf-8")
    print("patched")
PY

nginx -t
systemctl reload nginx

curl -sS --resolve www.viniliecaffe.it:443:127.0.0.1 -D- -o /tmp/m.bin https://www.viniliecaffe.it/site.webmanifest | head -15
python3 - <<'PY'
b=open("/tmp/m.bin","rb").read()
print(b[:120].decode())
print("ok_utf8", b"\xc3\xa8" in b)
PY
