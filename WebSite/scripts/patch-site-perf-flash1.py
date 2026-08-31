#!/usr/bin/env python3
"""Patch HTML for sitePerfFlash1: sync vc-landing.css, desktop boot hide, version bust."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VER = "20260831sitePerfFlash1"
ASYNC = re.compile(
    r'\s+media="print"\s+onload="this\.media=\'all\'"\s+data-vc-async-css="1"',
    re.I,
)
OLD_BOOT = (
    ",body.vc-body>main,body.vc-body>footer,body.vc-body>header,"
    "#vc-page-content,.vc-page-cine-body"
    "{opacity:1!important;visibility:visible!important;pointer-events:auto!important}"
)
NEW_BOOT = (
    "@media(hover:hover) and (pointer:fine){"
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,"
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer"
    "{opacity:0!important;visibility:hidden!important;pointer-events:none!important}}"
    "@media(hover:none),(pointer:coarse){"
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,"
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,"
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header"
    "{opacity:1!important;visibility:visible!important;pointer-events:auto!important}}"
)

async_n = boot_n = ver_n = 0
for p in ROOT.rglob("*.html"):
    t = p.read_text(encoding="utf-8", errors="replace")
    orig = t
    t, c1 = ASYNC.subn("", t)
    async_n += c1
    if OLD_BOOT in t:
        t = t.replace(OLD_BOOT, NEW_BOOT)
        boot_n += 1
    t = re.sub(r"vc-landing\.css\?v=[^\"']+", f"vc-landing.css?v={VER}", t)
    t = re.sub(r"vc-page-cine-boot\.js\?v=[^\"']+", f"vc-page-cine-boot.js?v={VER}", t)
    t = re.sub(r"vc-home-cine\.js\?v=[^\"']+", f"vc-home-cine.js?v={VER}", t)
    t = re.sub(r"vc-site-polish\.js\?v=[^\"']+", f"vc-site-polish.js?v={VER}", t)
    t = re.sub(r"vc-perf\.js\?v=[^\"']+", f"vc-perf.js?v={VER}", t)
    if t != orig:
        p.write_text(t, encoding="utf-8")
        ver_n += 1

print("async_removed", async_n, "boot_patched", boot_n, "files", ver_n, "VER", VER)
