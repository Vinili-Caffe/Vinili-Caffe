#!/usr/bin/env python3
import json
from pathlib import Path

CFG = Path("/opt/bot/Vinyls/Config/site.config.json")
FILM = Path("/var/www/viniliecaffe/images/seratafilm/nightmare-before-christmas.mp4")
CDN = "https://cdn.viniliecaffe.it/images/seratafilm/nightmare-before-christmas.mp4"

d = json.loads(CFG.read_text(encoding="utf-8"))
e = d.setdefault("seratafilmEvent", {})
e["linkFilm"] = CDN
e["filmTitle"] = "Nightmare Before Christmas"
CFG.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("linkFilm=", e["linkFilm"])

if FILM.exists():
    size = FILM.stat().st_size
    FILM.unlink()
    print("deleted_vps_film_bytes=", size)
else:
    print("vps_film_already_absent")
