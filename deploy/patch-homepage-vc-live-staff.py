#!/usr/bin/env python3
"""Sync staff fields in homepage window.__VC_LIVE from live-stats-extra.json."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

html_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/var/www/viniliecaffe/index.html")
json_path = Path(sys.argv[2] if len(sys.argv) > 2 else "/var/www/viniliecaffe/live-stats-extra.json")

extra = json.loads(json_path.read_text(encoding="utf-8"))
html = html_path.read_text(encoding="utf-8")
m = re.search(r"<script>window\.__VC_LIVE=(\{.*?\});</script>", html)
if not m:
    raise SystemExit("__VC_LIVE script not found")

cfg = json.loads(m.group(1))
cfg["staffNoPm"] = extra.get("staffNoPm", cfg.get("staffNoPm"))
if isinstance(extra.get("staffHoverGroups"), list) and extra["staffHoverGroups"]:
    cfg["staffHoverGroups"] = extra["staffHoverGroups"]
if extra.get("guildMemberCount") is not None:
    cfg["guildMemberCount"] = extra["guildMemberCount"]
if extra.get("guildBoostCount") is not None:
    cfg["guildBoostCount"] = extra["guildBoostCount"]

new_json = json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))
new_script = f"<script>window.__VC_LIVE={new_json};</script>"
html2 = html[: m.start()] + new_script + html[m.end() :]
ver = str(int(time.time()))
html2 = re.sub(r"live-stats\.js\?v=[^\"'&\s]+", f"live-stats.js?v={ver}", html2)
html_path.write_text(html2, encoding="utf-8")
print("[vc-live-staff] patched", html_path, "staffNoPm=", cfg.get("staffNoPm"), "v=", ver)
