#!/bin/bash
set -e
python3 - <<'PY'
from pathlib import Path
import re
root = Path("/var/www/viniliecaffe")
ver = "20260816tktpres1"
pat = re.compile(r"(web-tickets-page\.js)(?:\?v=[^\"']*)?")
n = 0
for p in root.rglob("*.html"):
    t = p.read_text(encoding="utf-8", errors="ignore")
    if "web-tickets-page.js" not in t:
        continue
    nt = pat.sub(lambda m: f"{m.group(1)}?v={ver}", t)
    if nt != t:
        p.write_text(nt, encoding="utf-8")
        n += 1
print("bust", n, ver)
PY
pm2 restart site-api --update-env
sleep 2
grep -n "stopTicketPresence(true)" /var/www/viniliecaffe/js/web-tickets-page.js | head -5
grep -n "tid && openId" /opt/bot/Vinyls/Utils/Web/webTicketPagePresence.js
pm2 describe site-api | sed -n '1,12p'
echo DONE
