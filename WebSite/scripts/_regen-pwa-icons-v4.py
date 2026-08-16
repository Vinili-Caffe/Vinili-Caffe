#!/usr/bin/env python3
"""Regenerate opaque PWA / apple-touch icons and patch live HTML/manifest."""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path("/var/www/viniliecaffe")
SRC_CANDIDATES = [
    ROOT / "seratafilm" / "vinylmusics_logo_hd.png",
    ROOT / "images" / "apple-touch-icon-v3.png",
    ROOT / "apple-touch-icon.png",
]
BG = (18, 14, 11)  # #120e0b brand dark
VER = "v4"


def find_src() -> Path:
    for p in SRC_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("no source logo")


def make_icon(src: Path, size: int, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    # Fit into square canvas with solid brand background (no alpha — iOS-friendly).
    canvas = Image.new("RGB", (size, size), BG)
    # Keep aspect, pad
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    # Composite RGBA onto RGB
    layer = Image.new("RGBA", (size, size), (*BG, 255))
    x = (size - im.width) // 2
    y = (size - im.height) // 2
    layer.paste(im, (x, y), im)
    canvas = layer.convert("RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, format="PNG", optimize=True)
    print("wrote", dest, canvas.size, dest.stat().st_size)


def patch_html(html: str) -> str:
    # Remove existing apple-touch / apple title / manifest duplicates we'll reinsert.
    html = re.sub(r'<link[^>]+rel=["\']apple-touch-icon[^"\']*["\'][^>]*>\s*', "", html, flags=re.I)
    html = re.sub(
        r'<meta[^>]+name=["\']apple-mobile-web-app-title["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    # Prefer PNG favicon for Apple; keep Discord gif as secondary icon if present.
    block = "\n".join(
        [
            f'    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v={VER}" />',
            f'    <link rel="apple-touch-icon" href="/images/apple-touch-icon-{VER}.png" />',
            f'    <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon-precomposed.png?v={VER}" />',
            f'    <link rel="icon" type="image/png" sizes="32x32" href="/images/pwa-icon-192-{VER}.png" />',
            f'    <link rel="icon" type="image/png" sizes="192x192" href="/images/pwa-icon-192-{VER}.png" />',
            '    <meta name="apple-mobile-web-app-capable" content="yes" />',
            '    <meta name="mobile-web-app-capable" content="yes" />',
            '    <meta name="apple-mobile-web-app-title" content="Vinili &amp; Caffè" />',
        ]
    )
    # Insert RIGHT AFTER <head...> so apple-touch wins over Discord GIF favicon.
    m = re.search(r"<head[^>]*>", html, flags=re.I)
    if not m:
        return html
    insert_at = m.end()
    # Avoid duplicating capable metas if already later — remove old capable then insert block.
    html = re.sub(
        r'<meta[^>]+name=["\']apple-mobile-web-app-capable["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<meta[^>]+name=["\']mobile-web-app-capable["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    # Ensure manifest exists
    if not re.search(r'rel=["\']manifest["\']', html, flags=re.I):
        block += '\n    <link rel="manifest" href="/site.webmanifest" />'
    else:
        # Bust manifest cache via query if plain
        html = re.sub(
            r'(href=["\'])/site\.webmanifest(?:\?[^"\']*)?(["\'])',
            rf'\1/site.webmanifest?v={VER}\2',
            html,
            flags=re.I,
        )
    return html[:insert_at] + "\n" + block + "\n" + html[insert_at:]


def main() -> None:
    src = find_src()
    print("src", src)
    img = ROOT / "images"
    make_icon(src, 180, img / f"apple-touch-icon-{VER}.png")
    make_icon(src, 180, ROOT / "apple-touch-icon.png")
    make_icon(src, 180, ROOT / "apple-touch-icon-precomposed.png")
    make_icon(src, 192, img / f"pwa-icon-192-{VER}.png")
    make_icon(src, 512, img / f"pwa-icon-512-{VER}.png")

    # Verify opaque RGB
    for p in [
        ROOT / "apple-touch-icon.png",
        img / f"apple-touch-icon-{VER}.png",
    ]:
        im = Image.open(p)
        print("verify", p.name, im.mode, im.size)

    brand = "Vinili & Caffè"
    manifest = {
        "name": brand,
        "short_name": brand,
        "description": f"Community Discord {brand}",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#120e0b",
        "theme_color": "#2a1f18",
        "icons": [
            {
                "src": f"/images/pwa-icon-192-{VER}.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": f"/images/pwa-icon-512-{VER}.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": f"/images/apple-touch-icon-{VER}.png",
                "sizes": "180x180",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/apple-touch-icon.png",
                "sizes": "180x180",
                "type": "image/png",
                "purpose": "any",
            },
        ],
    }
    (ROOT / "site.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    n = 0
    for p in ROOT.rglob("*.html"):
        raw = p.read_text(encoding="utf-8", errors="surrogateescape")
        out = patch_html(raw)
        if out != raw:
            p.write_text(out, encoding="utf-8")
            n += 1
    print("html_patched", n)

    # nginx already has location = /apple-touch-icon.png; add precomposed if missing
    conf = Path("/etc/nginx/sites-available/viniliecaffe")
    text = conf.read_text(encoding="utf-8")
    if "apple-touch-icon-precomposed.png" not in text:
        needle = "    location = /apple-touch-icon.png {"
        extra = """    location = /apple-touch-icon-precomposed.png {
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        add_header CDN-Cache-Control "max-age=0, must-revalidate" always;
        try_files $uri =404;
    }

"""
        if needle in text:
            conf.write_text(text.replace(needle, extra + needle, 1), encoding="utf-8")
            print("nginx_patched")
        else:
            print("nginx_skip_no_needle")
    else:
        print("nginx_already")


if __name__ == "__main__":
    main()
