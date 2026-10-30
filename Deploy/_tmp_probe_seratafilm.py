#!/usr/bin/env python3
import json
from pathlib import Path

cfg = Path("/opt/bot/Vinyls/Config/site.config.json")
d = json.loads(cfg.read_text(encoding="utf-8"))
e = d.get("seratafilmEvent") or {}
keys = [
    "linkFilm",
    "filmTitle",
    "nextFilmTitle",
    "enabled",
    "overrideIso",
    "timezone",
]
print(json.dumps({k: e.get(k) for k in keys}, indent=2, ensure_ascii=False))
www = Path("/var/www/viniliecaffe")
link = str(e.get("linkFilm") or "").strip()
if link.startswith("/"):
    full = www / link.lstrip("/")
    print("resolved:", full, "exists=", full.exists(), "size=", full.stat().st_size if full.exists() else 0)
for p in [
    www / "images/seratafilm",
    www / "images/evento-hogwarts",
    Path("/opt/bot/Data/seratafilm"),
]:
    print("dir", p, "exists=", p.exists())
    if p.exists():
        for f in sorted(p.iterdir())[:20]:
            print(" ", f.name, f.stat().st_size if f.is_file() else "DIR")
