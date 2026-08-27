#!/usr/bin/env python3
"""Sync PWA/favicon/apple icons from current Discord guild icon + fix manifest short_name."""
import json
import hashlib
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path("/var/www/viniliecaffe")
LOCAL_REPO_IMAGES = Path("/opt/bot")  # unused; we write under www

UA = {"User-Agent": "Mozilla/5.0 (compatible; VC-IconSync/1.0)"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def guild_icon_bytes():
    data = json.loads(
        fetch("https://discord.com/api/v10/invites/viniliecaffe?with_counts=false").decode("utf-8")
    )
    guild = data.get("guild") or {}
    icon = guild.get("icon")
    gid = guild.get("id")
    if not icon or not gid:
        raise SystemExit("no guild icon")
    ext = "gif" if str(icon).startswith("a_") else "png"
    # static png frame for apple/pwa (browsers hate animated for home screen sometimes)
    urls = [
        f"https://cdn.discordapp.com/icons/{gid}/{icon}.{ext}?size=512",
        f"https://cdn.discordapp.com/icons/{gid}/{icon}.png?size=512",
    ]
    last_err = None
    for u in urls:
        try:
            b = fetch(u)
            print("fetched", u, "bytes", len(b), "sha", hashlib.sha256(b).hexdigest()[:16])
            return b, gid, icon, u
        except Exception as e:
            last_err = e
            print("fail", u, e)
    raise SystemExit(f"could not fetch icon: {last_err}")


def save_png_sizes(src_path: Path, outs):
    if Image is None:
        raise SystemExit("Pillow missing")
    im = Image.open(src_path)
    im = im.convert("RGBA")
    for path, size in outs:
        resized = im.resize((size, size), Image.Resampling.LANCZOS)
        path.parent.mkdir(parents=True, exist_ok=True)
        resized.save(path, format="PNG", optimize=True)
        print("wrote", path, path.stat().st_size)


def main():
    raw, gid, icon, src_url = guild_icon_bytes()
    tmp = ROOT / "images" / "_discord-guild-icon-src.bin"
    tmp.write_bytes(raw)

    # Prefer a still PNG for PWA/apple; if gif, Pillow takes first frame.
    src_img = ROOT / "images" / "_discord-guild-icon-src.png"
    if Image is None:
        raise SystemExit("Pillow missing on server")
    im = Image.open(tmp)
    im.convert("RGBA").save(src_img, format="PNG")
    print("src_png", src_img, src_img.stat().st_size)

    ver = "v6"
    outs = [
        (ROOT / "images" / f"pwa-icon-192-{ver}.png", 192),
        (ROOT / "images" / f"pwa-icon-512-{ver}.png", 512),
        (ROOT / f"apple-touch-icon-{ver}.png", 180),
        (ROOT / "apple-touch-icon.png", 180),
        (ROOT / "apple-touch-icon-precomposed.png", 180),
        (ROOT / "images" / "apple-touch-icon-v5.png", 180),  # keep alias updated
    ]
    save_png_sizes(src_img, outs)

    # Also copy 512 as favicon-sized png fallback used by some pages
    fav = ROOT / "images" / "vc-header-logo.png"
    save_png_sizes(src_img, [(fav, 256)])

    # Update webmanifest
    man_path = ROOT / "site.webmanifest"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["name"] = "Vinili & Caffè"
    man["short_name"] = "Vinili & Caffè"
    man["icons"] = [
        {
            "src": f"/images/pwa-icon-192-{ver}.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any",
        },
        {
            "src": f"/images/pwa-icon-512-{ver}.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any",
        },
        {
            "src": f"/apple-touch-icon-{ver}.png",
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
    ]
    man_path.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("manifest_ok", man["short_name"], man["icons"][0]["src"])

    # Bust cache in HTML heads: webmanifest + apple-touch + favicon refs that point to static files
    bust = "20260825pwaIcon6"
    discord_icon_url = f"https://cdn.discordapp.com/icons/{gid}/{icon}.gif?size=256"
    if not str(icon).startswith("a_"):
        discord_icon_url = f"https://cdn.discordapp.com/icons/{gid}/{icon}.png?size=256"

    changed = 0
    for html in ROOT.rglob("index.html"):
        t = html.read_text(encoding="utf-8", errors="ignore")
        orig = t
        t = re_sub_manifest(t, bust)
        t = bump_apple(t, bust, ver)
        # Ensure navbar uses current Discord CDN icon (not stale static/local)
        t = replace_guild_icons(t, discord_icon_url)
        if t != orig:
            html.write_text(t, encoding="utf-8")
            changed += 1
    print("html_updated", changed, "discord_icon_url", discord_icon_url)


def re_sub_manifest(t, bust):
    import re

    return re.sub(
        r'site\.webmanifest(\?v=[^\"\s]*)?',
        f"site.webmanifest?v={bust}",
        t,
    )


def bump_apple(t, bust, ver):
    import re

    t = re.sub(
        r'href="(/apple-touch-icon(?:-precomposed)?(?:-v\d+)?\.png)(\?v=[^"]*)?"',
        lambda m: f'href="{normalize_apple(m.group(1), ver)}?v={bust}"',
        t,
    )
    t = re.sub(
        r'href="(/favicon\.ico)(\?v=[^"]*)?"',
        fr'href="\1?v={bust}"',
        t,
    )
    return t


def normalize_apple(path, ver):
    if "precomposed" in path:
        return "/apple-touch-icon-precomposed.png"
    if path.endswith("apple-touch-icon.png"):
        return "/apple-touch-icon.png"
    return f"/apple-touch-icon-{ver}.png"


def replace_guild_icons(t, discord_icon_url):
    import re

    # Replace any discord guild icon URL for this guild with current
    t = re.sub(
        r"https://cdn\.discordapp\.com/icons/1329080093599076474/[A-Za-z0-9_]+\.(?:gif|png|webp|jpg)(?:\?[^\"\s]*)?",
        discord_icon_url,
        t,
    )
    # Replace leftover static header logos used as navbar src
    t = re.sub(
        r'(class="vc-header-logo-img"[^>]*src=")(/images/vc-header-logo\.png|/favicon\.ico|/apple-touch-icon[^"]*)("[^>]*>)',
        rf'\1{discord_icon_url}\3',
        t,
    )
    t = re.sub(
        r'(src=")(/images/vc-header-logo\.png|/favicon\.ico)("([^>]*class="vc-header-logo-img"|[^>]*vc-header-logo-img))',
        rf'\1{discord_icon_url}\3',
        t,
    )
    return t


if __name__ == "__main__":
    main()
