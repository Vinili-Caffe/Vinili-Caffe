#!/usr/bin/env python3
"""
Force iOS Home Screen icon to the brand logo.
- Opaque RGB 180/192/512
- Well-known root paths Apple probes automatically
- Remove Discord GIF as primary favicon (breaks iOS icon pick)
- Unique v5 filenames to bust Apple's icon cache
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path("/var/www/viniliecaffe")
VER = "v5"
BG = (18, 14, 11)  # #120e0b


def find_logo() -> Path:
    candidates = [
        ROOT / "seratafilm" / "vinylmusics_logo_hd.png",
        ROOT / "images" / "vc-header-logo.png",
        ROOT / "images" / "apple-touch-icon-v4.png",
        ROOT / "apple-touch-icon.png",
    ]
    for p in candidates:
        if p.exists() and p.stat().st_size > 1000:
            return p
    raise SystemExit("logo source missing")


def make_square_rgb(src: Path, size: int, dest: Path, pad_ratio: float = 0.08) -> None:
    im = Image.open(src).convert("RGBA")
    # Solid background — iOS hates weird alpha for home icons.
    canvas = Image.new("RGB", (size, size), BG)
    # Fit with padding so Apple mask doesn't crop edges badly.
    max_inner = int(size * (1.0 - 2 * pad_ratio))
    fitted = im.copy()
    fitted.thumbnail((max_inner, max_inner), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (size, size), (*BG, 255))
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    layer.paste(fitted, (x, y), fitted)
    out = layer.convert("RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, format="PNG", optimize=True)
    print("wrote", dest.name, out.mode, out.size, dest.stat().st_size)


def patch_html(html: str) -> str:
    # Strip old apple/manifest/icon png links we manage; keep page structure.
    html = re.sub(
        r'<link[^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<meta[^>]+name=["\']apple-mobile-web-app-(?:capable|title)["\'][^>]*>\s*',
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
    # Remove Discord GIF / any external favicon that steals iOS icon selection.
    html = re.sub(
        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<link[^>]+rel=["\']manifest["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )

    block = "\n".join(
        [
            f'    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-{VER}.png" />',
            f'    <link rel="apple-touch-icon" href="/apple-touch-icon-{VER}.png" />',
            f'    <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/apple-touch-icon-precomposed-{VER}.png" />',
            f'    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-{VER}.png" />',
            f'    <link rel="icon" type="image/png" sizes="192x192" href="/images/pwa-icon-192-{VER}.png" />',
            f'    <link rel="manifest" href="/site.webmanifest?v={VER}" />',
            '    <meta name="apple-mobile-web-app-capable" content="yes" />',
            '    <meta name="mobile-web-app-capable" content="yes" />',
            '    <meta name="apple-mobile-web-app-title" content="Vinili &amp; Caffè" />',
        ]
    )
    m = re.search(r"<head[^>]*>", html, flags=re.I)
    if not m:
        return html
    return html[: m.end()] + "\n" + block + "\n" + html[m.end() :]


def main() -> None:
    src = find_logo()
    print("SRC", src)

    img = ROOT / "images"
    # Root filenames Apple probes (and versioned copies).
    targets = {
        ROOT / f"apple-touch-icon-{VER}.png": 180,
        ROOT / f"apple-touch-icon-precomposed-{VER}.png": 180,
        ROOT / "apple-touch-icon.png": 180,
        ROOT / "apple-touch-icon-precomposed.png": 180,
        # Paths Apple probes automatically (even without <link>).
        ROOT / "apple-touch-icon-120x120.png": 120,
        ROOT / "apple-touch-icon-152x152.png": 152,
        ROOT / "apple-touch-icon-167x167.png": 167,
        ROOT / "apple-touch-icon-180x180.png": 180,
        ROOT / f"favicon-{VER}.png": 32,
        img / f"apple-touch-icon-{VER}.png": 180,
        img / f"pwa-icon-192-{VER}.png": 192,
        img / f"pwa-icon-512-{VER}.png": 512,
    }
    for dest, size in targets.items():
        make_square_rgb(src, size, dest)

    # Also write classic /favicon.ico as PNG renamed won't work; copy 32px as favicon.ico
    # Many servers serve PNG with .ico extension fine; better make a tiny PNG at favicon.ico path? 
    # Safari wants apple-touch; still place PNG bytes at favicon.ico for some clients.
    shutil.copyfile(ROOT / f"favicon-{VER}.png", ROOT / "favicon.ico")

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
                "src": f"/apple-touch-icon-{VER}.png",
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

    # Nginx: explicit locations for versioned root icons + favicon.ico
    conf_path = Path("/etc/nginx/sites-available/viniliecaffe")
    conf = conf_path.read_text(encoding="utf-8")
    marker = "    location = /apple-touch-icon.png {"
    extra = f"""    location = /apple-touch-icon-{VER}.png {{
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        add_header CDN-Cache-Control "max-age=0, must-revalidate" always;
        try_files $uri =404;
    }}
    location = /apple-touch-icon-precomposed-{VER}.png {{
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        add_header CDN-Cache-Control "max-age=0, must-revalidate" always;
        try_files $uri =404;
    }}
    location = /favicon-{VER}.png {{
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        try_files $uri =404;
    }}
    location = /favicon.ico {{
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        try_files $uri =404;
    }}

"""
    if f"apple-touch-icon-{VER}.png" not in conf and marker in conf:
        conf_path.write_text(conf.replace(marker, extra + marker, 1), encoding="utf-8")
        print("nginx_patched")
    else:
        print("nginx_ok_or_already")

    # Sanity: ensure index head starts with apple-touch
    head = (ROOT / "index.html").read_text(encoding="utf-8", errors="ignore")[:2500]
    assert f"apple-touch-icon-{VER}.png" in head, "missing v5 in index"
    assert "cdn.discordapp.com/icons" not in head.split("</head>")[0], "discord favicon still in head"
    print("OK")


if __name__ == "__main__":
    main()
