#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

CFG = Path("/opt/bot/Vinyls/Config/site.config.json")
FILM = Path("/var/www/viniliecaffe/images/seratafilm/nightmare-before-christmas.mp4")
TZ = ZoneInfo("Europe/Rome")

d = json.loads(CFG.read_text(encoding="utf-8"))
e = d.setdefault("seratafilmEvent", {})
# prova subito: inizio ~2 minuti fa (finestra live 4h sul frontend)
start = datetime.now(TZ) - timedelta(minutes=2)
e["filmTitle"] = "Nightmare Before Christmas"
e["nextFilmTitle"] = ""
e["linkFilm"] = "/images/seratafilm/nightmare-before-christmas.mp4"
e["overrideIso"] = start.isoformat(timespec="seconds")
CFG.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("updated overrideIso=", e["overrideIso"])
print("linkFilm=", e["linkFilm"])
print("film exists=", FILM.exists(), "size=", FILM.stat().st_size if FILM.exists() else 0)
