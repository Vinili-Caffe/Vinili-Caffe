#!/bin/bash
set -e
cp -f /tmp/vc-sw.js /var/www/viniliecaffe/sw.js
cp -f /tmp/vc-sw.js /opt/bot/WebSite/sw.js
cp -f /tmp/vc-landing.js /var/www/viniliecaffe/js/vc-landing.js
cp -f /tmp/vc-landing.js /opt/bot/WebSite/js/vc-landing.js
python3 - <<'PY'
from pathlib import Path
import re
root = Path("/var/www/viniliecaffe")
ver = "20260816pushbg1"
pat = re.compile(r"(vc-landing\.js)(?:\?v=[^\"']*)?")
n = 0
for p in root.rglob("*.html"):
    html = p.read_text(encoding="utf-8", errors="ignore")
    if "vc-landing.js" not in html:
        continue
    new = pat.sub(lambda m: f"{m.group(1)}?v={ver}", html)
    if new != html:
        p.write_text(new, encoding="utf-8")
        n += 1
print(f"cache-bust {n} -> {ver}")
PY
cd /opt/bot && node Vinyls/Scripts/_diagPushBg.js || true
echo DONE
