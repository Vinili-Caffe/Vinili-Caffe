#!/usr/bin/env python3
"""Single deploy entrypoint for site assets (assetIdentity1 / deployUnify1).

Canonical stems in git → stamped copies on WWW/OPT at deploy time.
Does NOT invent CSS/JS behavior. Visual lock: only ship bytes you already
verified as the intended look.

Examples (on VPS, after scp of canonical files + this script + registry):

  # Copy canonical → stem.{ver}.ext under /var/www and /opt/bot/WebSite
  python3 deploy_assets.py --www /var/www/viniliecaffe --opt /opt/bot/WebSite \\
      --registry /tmp/vc_stage/asset-versions.json --sync-stamps

  # Same + rewrite HTML refs for listed stems (only when ver matches live look)
  python3 deploy_assets.py --www /var/www/viniliecaffe --opt /opt/bot/WebSite \\
      --registry /tmp/vc_stage/asset-versions.json --sync-stamps \\
      --rewrite-stems vc-perf.js,discord-auth.js --purge

  # Dry-run
  python3 deploy_assets.py --www /var/www/viniliecaffe --sync-stamps --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path


SKIP_HTML_PARTS = ("node_modules", ".git", "backup", "partials", "dist", "scripts", "_archive")


def load_registry(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_registry(args_registry: Path | None, www: Path) -> Path:
    if args_registry and args_registry.exists():
        return args_registry
    for cand in (
        www / "asset-versions.json",
        Path(__file__).resolve().parents[1] / "asset-versions.json",
        Path("/tmp/vc_stage/asset-versions.json"),
    ):
        if cand.exists():
            return cand
    raise FileNotFoundError("asset-versions.json not found")


def baseline_map(registry: dict) -> dict[str, str]:
    # prefer explicit "assets" map; fall back to live_baseline_* keys
    if isinstance(registry.get("assets"), dict) and registry["assets"]:
        return {k: str(v) for k, v in registry["assets"].items()}
    for k, v in registry.items():
        if k.startswith("live_baseline_") and isinstance(v, dict):
            return {kk: str(vv) for kk, vv in v.items()}
    return {}


def stem_folder(stem_name: str) -> str:
    return "js" if stem_name.endswith(".js") else "css"


def stamped_name(stem_name: str, ver: str) -> str:
    p = Path(stem_name)
    return f"{p.stem}.{ver}{p.suffix}"


def copy_file(src: Path, dst: Path, dry_run: bool) -> None:
    if dry_run:
        print("DRY copy", src, "->", dst)
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    # chromeCss404Fix3: nginx gzip_static — aggiorna .gz altrimenti serve bytes stale
    if dst.suffix in (".js", ".css") and dst.exists():
        try:
            import gzip

            gz_path = Path(str(dst) + ".gz")
            data = dst.read_bytes()
            with gzip.open(gz_path, "wb", compresslevel=9) as gf:
                gf.write(data)
            import os

            os.utime(gz_path, (dst.stat().st_mtime, dst.stat().st_mtime))
            print("gzip", gz_path.name)
        except Exception as e:
            print("gzip_skip", dst.name, e)


def sync_stamps(
    roots: list[Path],
    registry: dict,
    stems: list[str] | None,
    dry_run: bool,
) -> int:
    baseline = baseline_map(registry)
    n = 0
    for stem_name, ver in baseline.items():
        if ver in ("keep-page-ref", None, ""):
            continue
        if stems and stem_name not in stems:
            continue
        folder = stem_folder(stem_name)
        for root in roots:
            canon = root / folder / stem_name
            if not canon.exists():
                print("MISSING_CANON", canon)
                continue
            stamped = root / folder / stamped_name(stem_name, ver)
            copy_file(canon, stamped, dry_run)
            print("stamp", stamped)
            n += 1
    return n


def install_canons(
    src_dir: Path,
    roots: list[Path],
    stems: list[str],
    dry_run: bool,
) -> int:
    """Copy staged canonical files into www/opt before stamping."""
    n = 0
    for stem_name in stems:
        folder = stem_folder(stem_name)
        src = src_dir / folder / stem_name
        if not src.exists():
            src = src_dir / stem_name
        if not src.exists():
            print("MISSING_STAGE", stem_name)
            continue
        for root in roots:
            dst = root / folder / stem_name
            copy_file(src, dst, dry_run)
            print("canon", dst)
            n += 1
    return n


def emit_asset_versions_js(registry: dict, dest: Path, dry_run: bool) -> None:
    """Write vc-asset-versions.js from registry.runtime_inject (bootGraph1)."""
    inj = registry.get("runtime_inject") or registry.get("runtime_inject_discord_auth") or {}
    ver = str(registry.get("ver") or "dev")
    lines = [
        "/**",
        f" * bootGraph1: generated from asset-versions.json ({ver})",
        " * Load BEFORE discord-auth.js. Versions only — no layout.",
        " */",
        "(function () {",
        f'  var VER = {json.dumps(ver)};',
        "  if (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.__vcVer === VER) return;",
        "  window.__VC_ASSET_VERS = {",
        f"    __vcVer: VER,",
    ]
    for k, v in inj.items():
        if str(k).startswith("_"):
            continue
        lines.append(f"    {k}: {json.dumps(str(v))},")
    lines.extend(["  };", "})();", ""])
    text = "\n".join(lines)
    if dry_run:
        print("DRY emit", dest, "bytes", len(text))
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    print("emit", dest)


def inject_before_discord_auth(www: Path, needle: str, tag: str, dry_run: bool) -> int:
    """Insert tag once before discord-auth script if needle not already present."""
    auth_re = re.compile(
        r'<script[^>]+src=["\'][^"\']*discord-auth[^"\']*["\'][^>]*>\s*</script>',
        re.I,
    )
    n = 0
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        if "discord-auth" not in raw.lower():
            continue
        if needle in raw:
            continue
        if not auth_re.search(raw):
            continue
        new = auth_re.sub(lambda m: tag + "\n  " + m.group(0), raw, count=1)
        if new != raw:
            print("inject", rel)
            if not dry_run:
                html.write_text(new, encoding="utf-8")
            n += 1
    return n


def inject_asset_versions_html(www: Path, registry: dict, dry_run: bool) -> int:
    ver = baseline_map(registry).get("vc-asset-versions.js") or str(registry.get("ver") or "dev")
    tag = f'<script src="/js/vc-asset-versions.{ver}.js?v={ver}" defer></script>'
    return inject_before_discord_auth(www, "vc-asset-versions", tag, dry_run)


def inject_auth_inject_html(www: Path, registry: dict, dry_run: bool) -> int:
    ver = baseline_map(registry).get("vc-auth-inject.js") or str(registry.get("ver") or "dev")
    tag = f'<script src="/js/vc-auth-inject.{ver}.js?v={ver}" defer></script>'
    return inject_before_discord_auth(www, "vc-auth-inject", tag, dry_run)


def rewrite_html(www: Path, registry: dict, stems: list[str], dry_run: bool) -> int:
    baseline = baseline_map(registry)
    n_files = 0
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        new = raw
        for stem_name in stems:
            ver = baseline.get(stem_name)
            if not ver or ver == "keep-page-ref":
                continue
            stem = Path(stem_name).stem
            ext = Path(stem_name).suffix.lstrip(".")
            folder = stem_folder(stem_name)
            # absolute /css|/js and relative ../../css refs (staff pages)
            new = re.sub(
                rf'((?:src|href)=["\'](?:/{folder}/|(?:\.\./)+{folder}/)){re.escape(stem)}(?:\.[^"\'?]+)?\.{ext}(?:\?v=[^"\']*)?(["\'])',
                rf"\1{stem}.{ver}.{ext}?v={ver}\2",
                new,
                flags=re.I,
            )
        if new != raw:
            print("html", rel)
            if not dry_run:
                html.write_text(new, encoding="utf-8")
            n_files += 1
    return n_files


def assert_markers(www: Path, markers: list[str]) -> None:
    chunks: list[str] = []
    reg = www / "asset-versions.json"
    if reg.exists():
        chunks.append(reg.read_text(encoding="utf-8", errors="ignore"))
    for p in list((www / "js").glob("*.js")) + list((www / "css").glob("*.css")):
        if p.stat().st_size > 500_000:
            continue
        try:
            chunks.append(p.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            pass
    text = "\n".join(chunks)
    for m in markers:
        if m not in text:
            raise AssertionError(f"marker missing: {m}")
        print("assert_ok", m)


def purge_cloudflare(files: list[str]) -> None:
    token_path = Path("/root/.cloudflare-waf-token")
    if not token_path.exists():
        print("purge_skip no token")
        return
    token_raw = token_path.read_text(encoding="utf-8").strip()
    api = token_raw
    zone = None
    if token_raw.startswith("{"):
        data = json.loads(token_raw)
        api = data.get("token") or data.get("api_token") or data.get("key")
        zone = data.get("zone") or data.get("zone_id")
    if not zone:
        req = urllib.request.Request(
            "https://api.cloudflare.com/client/v4/zones?name=viniliecaffe.it",
            headers={"Authorization": f"Bearer {api}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            zone = json.load(r)["result"][0]["id"]
    body = json.dumps({"files": files}).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
        data=body,
        headers={"Authorization": f"Bearer {api}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print("purge", json.load(r).get("success"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Vinili & Caffè unified asset deploy")
    ap.add_argument("--www", type=Path, required=True)
    ap.add_argument("--opt", type=Path, default=None, help="/opt/bot/WebSite mirror")
    ap.add_argument("--registry", type=Path, default=None)
    ap.add_argument("--stage", type=Path, default=None, help="dir with staged canonical js/css")
    ap.add_argument("--sync-stamps", action="store_true")
    ap.add_argument("--emit-versions", action="store_true", help="Write vc-asset-versions.js from registry")
    ap.add_argument("--inject-versions", action="store_true", help="Insert vc-asset-versions before discord-auth in HTML")
    ap.add_argument("--inject-auth-inject", action="store_true", help="Insert vc-auth-inject before discord-auth in HTML")
    ap.add_argument("--rewrite-stems", default="", help="Comma list e.g. vc-perf.js,discord-auth.js")
    ap.add_argument("--assert-marker", action="append", default=[])
    ap.add_argument("--purge", action="store_true")
    ap.add_argument("--purge-urls", default="", help="Extra URLs comma-separated")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    reg_path = resolve_registry(args.registry, args.www)
    registry = load_registry(reg_path)
    print("registry", reg_path, "ver", registry.get("ver"))

    roots = [args.www]
    if args.opt:
        roots.append(args.opt)

    stems = [s.strip() for s in args.rewrite_stems.split(",") if s.strip()]
    baseline = baseline_map(registry)
    sync_list = stems or [k for k, v in baseline.items() if v not in ("keep-page-ref", None, "")]

    if args.stage:
        print("installed_canons", install_canons(args.stage, roots, sync_list, args.dry_run))

    # always install registry onto www for runtime/docs
    for root in roots:
        copy_file(reg_path, root / "asset-versions.json", args.dry_run)

    if args.emit_versions:
        for root in roots:
            emit_asset_versions_js(registry, root / "js" / "vc-asset-versions.js", args.dry_run)

    if args.sync_stamps:
        print("synced", sync_stamps(roots, registry, stems or None, args.dry_run))

    if args.inject_versions:
        print("injected_versions_html", inject_asset_versions_html(args.www, registry, args.dry_run))

    if args.inject_auth_inject:
        print("injected_auth_inject_html", inject_auth_inject_html(args.www, registry, args.dry_run))

    if stems:
        print("rewrote_html_files", rewrite_html(args.www, registry, stems, args.dry_run))
        print("NOTE: rewrite only when stamp bytes == intended live look")

    for marker in args.assert_marker:
        if not args.dry_run:
            assert_markers(args.www, [marker])

    if args.purge and not args.dry_run:
        files = []
        for stem_name in sync_list:
            ver = baseline.get(stem_name)
            if not ver or ver == "keep-page-ref":
                continue
            folder = stem_folder(stem_name)
            files.append(f"https://www.viniliecaffe.it/{folder}/{stamped_name(stem_name, ver)}?v={ver}")
        for u in [x.strip() for x in args.purge_urls.split(",") if x.strip()]:
            files.append(u)
        if files:
            purge_cloudflare(files)

    print("PASS deploy_assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
