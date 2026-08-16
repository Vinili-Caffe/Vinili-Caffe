#!/usr/bin/env python3
import re, sys, time
from pathlib import Path
bust = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()))
p = Path("/var/www/viniliecaffe/tickets/index.html")
t = p.read_text(encoding="utf-8")
t2 = re.sub(r"(web-tickets-page\.js\?v=)[^\"'&]+", r"\g<1>" + bust, t)
t2 = re.sub(r"(vc-landing\.css\?v=)[^\"'&]+", r"\g<1>" + bust, t2)
p.write_text(t2, encoding="utf-8")
print("bumped", bust)
