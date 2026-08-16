#!/usr/bin/env python3
from pathlib import Path
import re
import time

ver = str(int(time.time() * 1000))
p = Path("/var/www/viniliecaffe/tickets/index.html")
t = p.read_text(encoding="utf-8")
t = re.sub(r"(web-tickets-page\.js)(?:\?v=\d+)?", rf"\1?v={ver}", t)
if "\\g<1>" in t:
    raise SystemExit("broken marker")
if "vc-landing.css" not in t:
    raise SystemExit("missing css")
p.write_text(t, encoding="utf-8")
print("ver", ver)
