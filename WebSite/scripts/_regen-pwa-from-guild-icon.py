#!/usr/bin/env python3
"""Regenerate PWA/favicon icons from the Discord guild icon (server logo)."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path("/var/www/viniliecaffe")
GID = "1329080093599076474"
BUST = "iosfix3"
BG = (12, 10, 16)


def load_token() -> str:
    tokens: dict[str, str] = {}
    for p in ("/opt/bot/.env", "/opt/bot/Vinyls/.env", "/opt/bot/Coffee/.env"):
        path = Path(p)
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k in (
                "DISCORD_WEBSITE_BUILD_BOT_TOKEN",
                "DISCORD_TOKEN_OFFICIAL",
                "DISCORD_TOKEN",
                "BOT_TOKEN",
                "VINYLS_TOKEN",
                "TOKEN",
                "DISCORD_TOKEN_TEST",
            ) and v:
                tokens[k] = v
    for k in (
        "DISCORD_WEBSITE_BUILD_BOT_TOKEN",
        "DISCORD_TOKEN_OFFICIAL",
        "DISCORD_TOKEN",
        "BOT_TOKEN",
        "VINYLS_TOKEN",
        "TOKEN",
        "DISCORD_TOKEN_TEST",
    ):
        if tokens.get(k):
            return tokens[k]
    return ""


def fetch_guild(token: str) -> dict:
    req = urllib.request.Request(
        f"https://discord.com/api/v10/guilds/{GID}",
        headers={"Authorization": f"Bot {token}", "User-Agent": "ViniliPWA/1.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "ViniliPWA/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        dest.write_bytes(r.read())


def to_opaque_rgb(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BG + (255,))
    fitted = im.copy()
    max_inner = int(size * 0.92)
    fitted.thumbnail((max_inner, max_inner), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas.convert("RGB")


def patch_html(html: str) -> str:
    html = re.sub(
        r'<link[^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
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
    icon = f"/favicon.ico?v={BUST}"
    block = "\n".join(
        [
            f'    <link rel="apple-touch-icon" sizes="180x180" href="{icon}" />',
            f'    <link rel="apple-touch-icon" href="{icon}" />',
            f'    <link rel="apple-touch-icon-precomposed" sizes="180x180" href="{icon}" />',
            f'    <link rel="icon" type="image/png" sizes="180x180" href="{icon}" />',
            f'    <link rel="shortcut icon" href="{icon}" />',
            f'    <link rel="manifest" href="/site.webmanifest?v={BUST}" />',
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
    token = load_token()
    if not token:
        raise SystemExit("no bot token")
    g = fetch_guild(token)
    print("guild", g.get("name"), "icon", g.get("icon"))
    icon_hash = g.get("icon")
    if not icon_hash:
        raise SystemExit("guild has no icon")
    url = f"https://cdn.discordapp.com/icons/{GID}/{icon_hash}.png?size=1024"
    src = Path("/tmp/vc-guild-icon-src.png")
    download(url, src)
    print("downloaded", src.stat().st_size, "from", url)

    # Keep a durable copy for future regenerations (avoid VINYLMUSICS asset).
    durable = ROOT / "images" / "vc-server-icon.png"
    durable.parent.mkdir(parents=True, exist_ok=True)
    durable.write_bytes(src.read_bytes())

    src_im = Image.open(src)
    outs = {
        ROOT / "favicon.ico": 180,
        ROOT / "apple-touch-icon.png": 180,
        ROOT / "apple-touch-icon-v5.png": 180,
        ROOT / "apple-touch-icon-180x180.png": 180,
        ROOT / "apple-touch-icon-precomposed.png": 180,
        ROOT / "images" / "apple-touch-icon-v5.png": 180,
        ROOT / "images" / "pwa-icon-192-v5.png": 192,
        ROOT / "images" / "pwa-icon-512-v5.png": 512,
    }
    for path, size in outs.items():
        rgb = to_opaque_rgb(src_im, size)
        path.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(path, format="PNG", optimize=True)
        print("wrote", path.name, size, path.stat().st_size)

    brand = "Vinili & Caffè"
    icon = f"/favicon.ico?v={BUST}"
    manifest = {
        "name": brand,
        "short_name": brand,
        "description": f"Community Discord {brand}",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#0c0a10",
        "theme_color": "#2a1f18",
        "icons": [
            {"src": icon, "sizes": "180x180", "type": "image/png", "purpose": "any"},
            {"src": icon, "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": icon, "sizes": "512x512", "type": "image/png", "purpose": "any"},
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
    print("DONE", BUST)


if __name__ == "__main__":
    main()
