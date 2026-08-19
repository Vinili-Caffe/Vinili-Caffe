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
if isinstance(extra.get("boostHoverMembers"), list):
    cfg["boostHoverMembers"] = extra["boostHoverMembers"]
if extra.get("guildMemberCount") is not None:
    cfg["guildMemberCount"] = extra["guildMemberCount"]
if extra.get("guildBoostCount") is not None:
    cfg["guildBoostCount"] = extra["guildBoostCount"]
if isinstance(extra.get("memberPulse"), dict):
    cfg["memberPulse"] = extra["memberPulse"]
if isinstance(extra.get("communityHours"), dict):
    cfg["communityHours"] = extra["communityHours"]

new_json = json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))
new_script = f"<script>window.__VC_LIVE={new_json};</script>"
html2 = html[: m.start()] + new_script + html[m.end() :]
ver = str(int(time.time()))
html2 = re.sub(r"live-stats\.js(?:\?v=[^\"'&\s]+)?", f"live-stats.js?v={ver}", html2)
html2 = re.sub(r"vc-landing\.css(?:\?v=[^\"'&\s]+)?", f"vc-landing.css?v={ver}", html2)
html2 = re.sub(
    r"vc-header-name-marquee\.js(?:\?v=[^\"'&\s]+)?",
    f"vc-header-name-marquee.js?v={ver}",
    html2,
)
html2 = re.sub(r"vc-home-cine\.js(?:\?v=[^\"'&\s]+)?", f"vc-home-cine.js?v={ver}", html2)
html_path.write_text(html2, encoding="utf-8")
pulse = cfg.get("memberPulse") or {}
print(
    "[vc-live-staff] patched",
    html_path,
    "staffNoPm=",
    cfg.get("staffNoPm"),
    "msgs7d=",
    pulse.get("messages7d"),
    "active7d=",
    pulse.get("activeMembers7d"),
    "v=",
    ver,
)
