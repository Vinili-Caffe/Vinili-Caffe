#!/usr/bin/env python3
"""Unify ?v= cache bust on every css/js reference across all site HTML + sw.js."""
from __future__ import annotations

import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "/var/www/viniliecaffe")
VERSION = sys.argv[2] if len(sys.argv) > 2 else datetime.now().strftime("%Y%m%d%H%M%S")

# Any relative or absolute css/js asset (with or without existing ?v=)
ASSET_REF = re.compile(
    r'((?:\.\./|\./|/)?(?:css|js)/[a-z0-9._-]+\.(?:css|js))(?:\?v=[^"\'\s>]*)?',
    re.IGNORECASE,
)

VC_FONTS_REF = re.compile(
    r'(/css/vc-fonts\.css)(?:\?v=[^"\'\s>]*)?',
    re.IGNORECASE,
)


def bump_text(text: str) -> str:
    text = ASSET_REF.sub(r"\1?v=" + VERSION, text)
    text = VC_FONTS_REF.sub(r"\1?v=" + VERSION, text)
    return text


def main() -> None:
    changed = 0
    scanned = 0
    for html in ROOT.rglob("*.html"):
        scanned += 1
        try:
            original = html.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        updated = bump_text(original)
        if updated != original:
            html.write_text(updated, encoding="utf-8")
            changed += 1

    sw = ROOT / "sw.js"
    if sw.exists():
        text = sw.read_text(encoding="utf-8", errors="replace")
        if re.search(r"/\* v=.* \*/", text):
            text = re.sub(r"/\* v=.* \*/", f"/* v={VERSION}-global-cache-bust */", text, count=1)
        else:
            text = f"/* v={VERSION}-global-cache-bust */\n" + text
        sw.write_text(text, encoding="utf-8")

    print(f"scanned={scanned} updated={changed} version={VERSION} root={ROOT}")


if __name__ == "__main__":
    main()
