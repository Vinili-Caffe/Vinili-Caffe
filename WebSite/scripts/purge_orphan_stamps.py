#!/usr/bin/env python3
"""Purge stamped css/js not referenced by registry or live HTML.

Visual lock: does NOT change served look — only deletes unused stamp copies.
Keeps:
  - canonical stem.css / stem.js
  - every stamp ver in asset-versions.json (assets + runtime_inject*)
  - every stamp still referenced from any .html under www/opt
  - last KEEP_RECENT stamps per stem (mtime) as rollback cushion

Usage:
  python3 purge_orphan_stamps.py --www /var/www/viniliecaffe --dry-run
  python3 purge_orphan_stamps.py --www /var/www/viniliecaffe --opt /opt/bot/WebSite --apply
"""
from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from pathlib import Path

STAMP_RE = re.compile(r"^(.+)\.(\d{8}[a-z0-9]+)\.(css|js)(\.gz)?$", re.I)
HTML_REF_RE = re.compile(
    r"""/(?:css|js)/([A-Za-z0-9._-]+?)\.(\d{8}[A-Za-z0-9]+)\.(css|js)""",
    re.I,
)
KEEP_RECENT = 2


def load_registry(www: Path) -> dict:
    p = www / "asset-versions.json"
    return json.loads(p.read_text(encoding="utf-8"))


def protected_pairs(registry: dict) -> set[tuple[str, str]]:
    """Set of (stem.ext, ver)."""
    out: set[tuple[str, str]] = set()
    for bag_name in ("assets", "runtime_inject", "runtime_inject_discord_auth"):
        bag = registry.get(bag_name) or {}
        if not isinstance(bag, dict):
            continue
        for k, v in bag.items():
            if str(k).startswith("_"):
                continue
            ver = str(v or "").strip()
            if not ver or ver == "keep-page-ref":
                continue
            key = str(k)
            if key.endswith(".css") or key.endswith(".js"):
                out.add((key, ver))
            else:
                # VER keys like SHELL_VER — protect ver for any stem that uses it
                out.add(("*", ver))
    return out


def html_refs(roots: list[Path]) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    skip = {"node_modules", ".git", "images", "audio", "emoji", "fonts", "css", "js", "deploy", "scripts"}
    for root in roots:
        if not root.exists():
            continue
        for dirpath, dirnames, files in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in skip]
            for f in files:
                if not f.endswith(".html"):
                    continue
                text = Path(dirpath, f).read_text(encoding="utf-8", errors="replace")
                for m in HTML_REF_RE.finditer(text):
                    stem, ver, ext = m.group(1), m.group(2), m.group(3)
                    out.add((f"{stem}.{ext}", ver))
    return out


def list_stamps(folder: Path, ext: str) -> list[tuple[Path, str, str, int, float]]:
    """Return (path, stem.ext, ver, size, mtime)."""
    rows = []
    if not folder.is_dir():
        return rows
    for f in folder.iterdir():
        if not f.is_file():
            continue
        m = STAMP_RE.match(f.name)
        if not m:
            continue
        if m.group(3).lower() != ext:
            continue
        if m.group(4):  # .gz handled with parent
            continue
        stem, ver, e = m.group(1), m.group(2), m.group(3)
        rows.append((f, f"{stem}.{e}", ver, f.stat().st_size, f.stat().st_mtime))
    return rows


def is_protected(
    stem_ext: str,
    ver: str,
    pairs: set[tuple[str, str]],
    star_vers: set[str],
    html: set[tuple[str, str]],
) -> bool:
    if (stem_ext, ver) in pairs:
        return True
    if (stem_ext, ver) in html:
        return True
    if ver in star_vers:
        # only protect if this stem exists in assets at all (avoid keeping every file with that ver)
        return False
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--www", type=Path, required=True)
    ap.add_argument("--opt", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--keep-recent", type=int, default=KEEP_RECENT)
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        args.dry_run = True

    roots = [args.www]
    if args.opt:
        roots.append(args.opt)

    reg = load_registry(args.www)
    pairs = protected_pairs(reg)
    star_vers = {ver for stem, ver in pairs if stem == "*"}
    exact_pairs = {(s, v) for s, v in pairs if s != "*"}
    html = html_refs(roots)

    # Also protect registry asset exact matches via star only when stem's current ver
    for stem_ext, ver in list(exact_pairs):
        pass

    keep_recent = max(0, int(args.keep_recent))
    to_delete: list[Path] = []
    kept = 0
    bytes_free = 0

    for root in roots:
        for sub, ext in (("css", "css"), ("js", "js")):
            rows = list_stamps(root / sub, ext)
            by_stem: dict[str, list] = defaultdict(list)
            for row in rows:
                by_stem[row[1]].append(row)
            for stem_ext, items in by_stem.items():
                items.sort(key=lambda r: r[4], reverse=True)  # mtime desc
                recent = {items[i][2] for i in range(min(keep_recent, len(items)))}
                assets = reg.get("assets") or {}
                for path, se, ver, size, _mt in items:
                    # Protect: registry asset ver, HTML refs, last N mtimes,
                    # AND any runtime_inject version string (NAV_CHROME_FIX_VER etc.)
                    prot = (
                        (se, ver) in exact_pairs
                        or (se, ver) in html
                        or ver in recent
                        or ver in star_vers
                        or assets.get(se) == ver
                    )
                    if prot:
                        kept += 1
                        continue
                    to_delete.append(path)
                    bytes_free += size
                    gz = Path(str(path) + ".gz")
                    if gz.exists():
                        to_delete.append(gz)
                        bytes_free += gz.stat().st_size

    # dedupe paths
    uniq = []
    seen = set()
    for p in to_delete:
        sp = str(p)
        if sp in seen:
            continue
        seen.add(sp)
        uniq.append(p)

    print(f"roots={[str(r) for r in roots]}")
    print(f"protected_exact={len(exact_pairs)} html_refs={len(html)} keep_recent={keep_recent}")
    print(f"kept_stamps≈{kept} delete_files={len(uniq)} free_MB={bytes_free/1024/1024:.1f}")
    for p in uniq[:12]:
        print("  DEL", p)
    if len(uniq) > 12:
        print(f"  ... +{len(uniq)-12} more")

    if args.dry_run and not args.apply:
        print("DRY-RUN (pass --apply to delete)")
        return

    deleted = 0
    for p in uniq:
        try:
            p.unlink()
            deleted += 1
        except OSError as e:
            print("ERR", p, e)
    print(f"DELETED {deleted} files, ~{bytes_free/1024/1024:.1f} MB")
    print("PASS purge_orphan_stamps")


if __name__ == "__main__":
    main()
