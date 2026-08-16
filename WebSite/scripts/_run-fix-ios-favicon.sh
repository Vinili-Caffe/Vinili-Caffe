#!/bin/bash
set -e
python3 /tmp/vc-fix-ios-favicon.py
nginx -t && systemctl reload nginx

UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
echo '=== CF fetch favicon (must be PNG 200) ==='
/usr/bin/curl -sS -A "$UA" -o /tmp/cf.bin -D- --max-time 20 "https://www.viniliecaffe.it/favicon.ico?v=iosfix2" | head -15
file /tmp/cf.bin
python3 - <<'PY'
from PIL import Image
im=Image.open('/tmp/cf.bin')
print('mode', im.mode, 'size', im.size)
PY
echo '=== html head ==='
python3 - <<'PY'
from pathlib import Path
import re
h=Path('/var/www/viniliecaffe/index.html').read_text(encoding='utf-8',errors='ignore')
for m in re.finditer(r'<link[^>]+>', h[:3500], flags=re.I):
  s=m.group(0)
  if 'icon' in s.lower() or 'manifest' in s.lower():
    print(s[:200])
PY
echo DONE
