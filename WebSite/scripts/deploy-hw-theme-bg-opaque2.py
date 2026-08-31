#!/usr/bin/env python3
"""Deploy hwThemeBgOpaque2: fix video bg trasparente su evento Hogwarts."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

VER = "20260831hwThemeBgOpaque2"
SRC = Path("/tmp/vc_hw_theme_bg_opaque2")
WWW = Path("/var/www/viniliecaffe")
BOT = Path("/opt/bot")

assert "hwThemeBgOpaque2" in (SRC / "css/vc-landing.css").read_text(encoding="utf-8")
js = (SRC / "js/hogwarts-theme-bg.js").read_text(encoding="utf-8")
assert "autoplay = true" in js

for rel in ("css/vc-landing.css", "js/hogwarts-theme-bg.js"):
    for base in (WWW, BOT / "WebSite"):
        dst = base / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SRC / rel, dst)
        print("copied", dst)

SITE_ASSET = re.compile(
    r'((?:src|href)=["\'])([^"\']+?\.(?:js|css))\?v=[^"\']+(["\'])',
    re.I,
)
SITE_ASSET_NOVER = re.compile(
    r'((?:src|href)=["\'])([^"\']+?\.(?:js|css))(?!\?v=)(["\'])',
    re.I,
)
SW_REG = re.compile(r'(/sw\.js)(?:\?v=[^"\']+)?', re.I)
THEME_BG = re.compile(r"hogwarts-theme-bg\.js\?v=[^\"'\s>]+", re.I)

html_n = 0
asset_hits = 0
for p in WWW.rglob("*.html"):
    t = p.read_text(encoding="utf-8", errors="replace")
    nt, c1 = SITE_ASSET.subn(rf"\1\2?v={VER}\3", t)
    nt, c1b = SITE_ASSET_NOVER.subn(rf"\1\2?v={VER}\3", nt)
    nt, c2 = SW_REG.subn(rf"\1?v={VER}", nt)
    nt2, c3 = THEME_BG.subn(f"hogwarts-theme-bg.js?v={VER}", nt)
    if c1 or c1b or c2 or c3:
        p.write_text(nt2, encoding="utf-8")
        html_n += 1
        asset_hits += c1 + c1b + c2 + c3

print("html_bust", html_n, "asset_refs", asset_hits, VER)
live_css = (WWW / "css/vc-landing.css").read_text(encoding="utf-8")
assert "hwThemeBgOpaque2" in live_css
ev = (WWW / "evento/index.html").read_text(encoding="utf-8")
assert f"vc-landing.css?v={VER}" in ev
assert f"hogwarts-theme-bg.js?v={VER}" in ev
assert "transparent !important" not in live_css.split("hwThemeBgOpaque2")[1].split("vc-hw-cinema-active")[0]
print("ASSERT_OK", VER)
