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
    try:
        if src.resolve() == dst.resolve():
            return
    except OSError:
        pass
    try:
        shutil.copy2(src, dst)
    except shutil.SameFileError:
        return
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
        # assetVersKeyFix1: quote keys with '-' / '.' (invalid bare JS identifiers)
        key = str(k)
        if re.match(r"^[A-Za-z_$][\w$]*$", key):
            key_js = key
        else:
            key_js = json.dumps(key)
        lines.append(f"    {key_js}: {json.dumps(str(v))},")
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
            # appendScript("/js/stem.OLD.js?v=OLD") / string literals in inline boot
            new = re.sub(
                rf'(["\'](?:/{folder}/|(?:\.\./)+{folder}/)){re.escape(stem)}(?:\.[^"\'?]+)?\.{ext}(?:\?v=[^"\']*)?(["\'])',
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


SCOPED_PAGE_CSS = (
    "vc-page-legal",
    "vc-page-cine-public",
    "vc-page-tickets",
    "vc-page-bacheca",
    "vc-page-staff",
    "vc-page-dashboard",
    "vc-page-misc",
    "vc-page-home",
    "seratafilm-page",
)


def _html_norm_path(rel: str) -> str:
    p = "/" + rel.replace("\\", "/").lstrip("/")
    p = re.sub(r"/index\.html$", "", p, flags=re.I)
    p = re.sub(r"/+$", "", p) or "/"
    p = re.sub(r"^/(en|it)(?=/|$)", "", p, flags=re.I) or "/"
    return p


def _path_re(path: str, pattern: str) -> bool:
    return bool(re.search(pattern, path, flags=re.I))


def scrub_html_route_assets(www: Path, dry_run: bool) -> int:
    """siteOptAll1/2: rimuove script/CSS off-path in HTML → zero GET (look invariato).

    siteOptAll2: DELETE del tag (non più type=text/plain) — parser non vede morti.
    post-curtain-lazy / inject ripristinano solo se serve.
    """
    # (?<![-\w]) evita match su data-vc-killed-src=
    script_re = re.compile(
        r'<script(?P<pre>[^>]*?)(?<![-\w])src=(?P<q>["\'])(?P<src>[^"\']+)(?P=q)(?P<post>[^>]*)>\s*</script>',
        re.I,
    )
    # siteOptAll2: ripulisci residui text/plain da siteOptAll1
    killed_plain_re = re.compile(
        r'<script\b[^>]*\bdata-vc-killed-src=(["\'])[^"\']*\1[^>]*>\s*</script>',
        re.I,
    )
    link_re = re.compile(
        r'<link(?P<pre>[^>]*?)\bhref=(?P<q>["\'])(?P<href>[^"\']+)(?P=q)(?P<post>[^>]*)/?>',
        re.I,
    )

    def should_kill_script(path: str, src: str) -> bool:
        s = src or ""
        if re.search(r"vc-landing-notif(\.|$|\?)", s, re.I):
            return True
        if re.search(r"vc-i18n-locales(\.|$|\?)", s, re.I):
            return True
        if re.search(r"vc-i18n-pages-extra(\.|$|\?)", s, re.I):
            return not _path_re(
                path,
                r"^/(perks|wiki|sponsor|status|seratafilm|bacheca|donazioni|recensioni)(/|$)",
            )
        if re.search(r"vc-dialog(\.|$|\?)", s, re.I):
            return not _path_re(
                path,
                r"^/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard|staff|user|classifiche|notifications)(/|$)",
            )
        if re.search(r"vc-form-drafts(\.|$|\?)", s, re.I):
            return not _path_re(
                path,
                r"^/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard)(/|$)",
            )
        if re.search(r"vc-image-lightbox(\.|$|\?)", s, re.I):
            return not _path_re(
                path,
                r"^/(confessionale|bacheca|feedback|recensioni|staff|user|classifiche|tickets)(/|$)",
            )
        if re.search(r"vc-chat-typing(\.|$|\?)", s, re.I):
            return not _path_re(path, r"^/(tickets|confessionale|bacheca|notifications)(/|$)")
        if re.search(r"vc-tickets-push-gate(\.|$|\?)", s, re.I):
            return not _path_re(path, r"^/tickets(/|$)")
        if re.search(r"vc-mini-pager(\.|$|\?)", s, re.I):
            return not _path_re(path, r"^/(tickets|bacheca|staff/compiti|dashboard)(/|$)")
        if re.search(r"vc-type-sfx(\.|$|\?)", s, re.I):
            return not _path_re(
                path,
                r"^/(candidature|confessionale|feedback|tickets|appelli|seratafilm|bacheca|dashboard|personalizza|staff/compiti)(?=/|$)",
            )
        if re.search(r"vc-landing(\.|$|\?)", s, re.I) and not re.search(
            r"vc-landing-notif", s, re.I
        ):
            if path == "/":
                return False
            return not _path_re(
                path,
                r"^/(user|classifiche|vote|tickets|perks|personalizza|confessionale|notifications|bacheca|seratafilm|puzzle|donazioni)(/|$)",
            )
        if path != "/":
            if re.search(r"vc-kick-pip(\.|$|\?)", s, re.I):
                return True
            if re.search(r"vc-twitch-pip(\.|$|\?)", s, re.I):
                return True
            if re.search(r"(?:^|/)live-stats(\.|$|\?)", s, re.I):
                return True
            if re.search(r"vc-home-boot-gate(\.|$|\?)", s, re.I):
                return True
            if re.search(r"vc-home-sw-cache-guard(\.|$|\?)", s, re.I):
                return True
            if re.search(r"vc-live-config(\.|$|\?)", s, re.I):
                return True
        return False

    def should_kill_link(path: str, href: str) -> bool:
        h = href or ""
        if "vc-image-lightbox" in h and not _path_re(
            path,
            r"^/(confessionale|bacheca|feedback|recensioni|staff|user|classifiche|tickets)(/|$)",
        ):
            return True
        if "vc-page-home" in h and path != "/":
            return True
        return False

    def neuter_script(m: re.Match) -> str:
        src = m.group("src")
        # path filled by outer closure via nonlocal — set on each file
        if not should_kill_script(neuter_script.path, src):  # type: ignore[attr-defined]
            return m.group(0)
        # siteOptAll2: rimuovi del tutto (commento minimo per grep deploy)
        return f"<!-- siteOptAll2 scrubbed script {src} -->"

    n = 0
    killed = 0
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        path = _html_norm_path(rel)
        raw = html.read_text(encoding="utf-8", errors="ignore")
        neuter_script.path = path  # type: ignore[attr-defined]

        def repl_script(m: re.Match) -> str:
            nonlocal killed
            out = neuter_script(m)
            if out != m.group(0):
                killed += 1
            return out

        new = script_re.sub(repl_script, raw)
        # heal text/plain residui siteOptAll1
        def repl_plain(m: re.Match) -> str:
            nonlocal killed
            killed += 1
            return "<!-- siteOptAll2 heal killed-plain -->"

        new2, n_plain = killed_plain_re.subn(repl_plain, new)
        new = new2

        def repl_link(m: re.Match) -> str:
            nonlocal killed
            href = m.group("href")
            if not should_kill_link(path, href):
                return m.group(0)
            killed += 1
            return f"<!-- siteOptAll2 scrubbed link {href} -->"

        new = link_re.sub(repl_link, new)
        if new == raw:
            continue
        print("scrub_route", rel)
        if not dry_run:
            html.write_text(new, encoding="utf-8")
        n += 1
    print("scrubbed_html_files", n, "killed_tags", killed)
    return n


def bake_fase2_defer_css_on_scoped(www: Path, dry_run: bool) -> int:
    """fase2Bake1: su pagine scoped, look/soft in HTML = media=print + post-curtain (no block)."""
    n = 0
    link_re = re.compile(r"<link\b[^>]*>", re.I)

    def transform_tag(tag: str) -> str:
        low = tag.lower()
        if "vc-look-core" not in low and "vc-soft-fx" not in low:
            return tag
        self_close = tag.rstrip().endswith("/>")
        core = tag.rstrip()
        if core.endswith("/>"):
            core = core[:-2].rstrip()
        elif core.endswith(">"):
            core = core[:-1].rstrip()
        if re.search(r"\bmedia\s*=", core, flags=re.I):
            core = re.sub(
                r'\bmedia\s*=\s*["\'][^"\']*["\']',
                'media="print"',
                core,
                count=1,
                flags=re.I,
            )
        else:
            core += ' media="print"'
        if "data-vc-defer-css" not in core.lower():
            core += ' data-vc-defer-css="post-curtain"'
        else:
            core = re.sub(
                r'\bdata-vc-defer-css\s*=\s*["\'][^"\']*["\']',
                'data-vc-defer-css="post-curtain"',
                core,
                count=1,
                flags=re.I,
            )
        if "data-vc-fase2-defer" not in core.lower():
            core += ' data-vc-fase2-defer="1"'
        return core + (" />" if self_close else ">")

    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        if not any(s in raw for s in SCOPED_PAGE_CSS):
            continue
        new = link_re.sub(lambda m: transform_tag(m.group(0)), raw)
        if new == raw:
            continue
        print("fase2_bake", rel)
        if not dry_run:
            html.write_text(new, encoding="utf-8")
        n += 1
    print("baked_fase2_defer_html", n)
    return n


def heal_missing_gz(roots: list[Path], dry_run: bool) -> int:
    """fase2Gzip1: nginx gzip_static — ogni .js/.css sotto css|js deve avere .gz fresco."""
    import gzip
    import os

    n = 0
    for root in roots:
        for folder in ("css", "js"):
            d = root / folder
            if not d.is_dir():
                continue
            for path in d.rglob("*"):
                if not path.is_file():
                    continue
                if path.suffix not in (".js", ".css"):
                    continue
                if path.name.endswith(".gz"):
                    continue
                gz_path = Path(str(path) + ".gz")
                need = True
                try:
                    if gz_path.exists() and gz_path.stat().st_mtime >= path.stat().st_mtime - 1:
                        need = False
                except OSError:
                    need = True
                if not need:
                    continue
                if dry_run:
                    print("DRY gzip", gz_path)
                    n += 1
                    continue
                try:
                    data = path.read_bytes()
                    with gzip.open(gz_path, "wb", compresslevel=9) as gf:
                        gf.write(data)
                    os.utime(gz_path, (path.stat().st_mtime, path.stat().st_mtime))
                    n += 1
                except Exception as e:
                    print("gzip_heal_skip", path.name, e)
    print("gzip_healed", n)
    return n


def assert_fase2_gzip_and_defer(www: Path) -> None:
    """fase2: registry stamps have .gz; auth-inject has fase2Defer1; post-curtain has fase2Lazy1."""
    reg = load_registry(www / "asset-versions.json")
    baseline = baseline_map(reg)
    missing = []
    for stem_name, ver in baseline.items():
        if ver in ("keep-page-ref", None, ""):
            continue
        folder = stem_folder(stem_name)
        stamped = www / folder / stamped_name(stem_name, ver)
        if stamped.exists() and not Path(str(stamped) + ".gz").exists():
            missing.append(stamped.name)
        canon = www / folder / stem_name
        if canon.exists() and not Path(str(canon) + ".gz").exists():
            missing.append(canon.name)
    if missing:
        raise AssertionError("fase2: missing .gz for " + ", ".join(missing[:30]))
    ai_ok = False
    for p in (www / "js").glob("vc-auth-inject*.js"):
        if p.name.endswith(".gz"):
            continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if "fase2Defer1" in txt and "armFase2ScopedCssDefer" in txt:
            ai_ok = True
            break
    if not ai_ok:
        raise AssertionError("fase2: vc-auth-inject missing fase2Defer1 / armFase2ScopedCssDefer")
    lazy_ok = False
    for p in (www / "js").glob("vc-post-curtain-lazy*.js"):
        if p.name.endswith(".gz"):
            continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if "fase2Lazy1" in txt or "20261018fase2Lazy1" in txt:
            lazy_ok = True
            break
    if not lazy_ok:
        raise AssertionError("fase2: vc-post-curtain-lazy missing fase2Lazy1")
    # cssDeferUnstick1: look/soft must NOT stay media=print on scoped (was blank pages)
    stuck = []
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        if not any(s in raw for s in SCOPED_PAGE_CSS):
            continue
        if 'data-vc-fase2-defer="1"' in raw or "data-vc-fase2-defer='1'" in raw:
            stuck.append(rel)
        elif re.search(r'vc-look-core[^>]+media=["\']print["\']', raw, flags=re.I):
            stuck.append(rel)
    if stuck:
        raise AssertionError(
            "fase2: scoped look/soft still print-deferred (cssDeferUnstick1): "
            + ", ".join(stuck[:15])
        )
    print("assert_ok fase2_no_print_defer_stuck")
    print("assert_ok fase2_gzip_and_defer")


def assert_fase4_guardrails(www: Path) -> None:
    """fase4Guard1: budgets + no mega-bundle on scoped samples + sipario markers."""
    reg = load_registry(www / "asset-versions.json") if (www / "asset-versions.json").exists() else {}
    assets = baseline_map(reg)

    def wire_bytes(path: Path) -> int:
        gz = Path(str(path) + ".gz")
        if gz.exists():
            return gz.stat().st_size
        return path.stat().st_size if path.exists() else 0

    def resolve(stem: str):
        ver = assets.get(stem)
        folder = stem_folder(stem)
        if ver:
            stamped = www / folder / stamped_name(stem, ver)
            if stamped.exists():
                return stamped
        canon = www / folder / stem
        return canon if canon.exists() else None

    early_kit = 0
    for stem in ("vc-site-boot-kit.css", "vc-fonts.css"):
        p = resolve(stem)
        if p:
            early_kit += wire_bytes(p)
    if early_kit > 40_000:
        raise AssertionError(f"fase4: early kit CSS wire {early_kit} > 40000")

    early_js = 0
    for stem in ("vc-perf.js", "vc-auth-inject.js", "vc-asset-versions.js"):
        p = resolve(stem)
        if p:
            early_js += wire_bytes(p)
    if early_js > 100_000:
        raise AssertionError(f"fase4: early JS wire {early_js} > 100000")

    for stem in (
        "vc-page-legal.css",
        "vc-page-cine-public.css",
        "vc-page-tickets.css",
        "vc-page-bacheca.css",
        "vc-page-staff.css",
        "vc-page-dashboard.css",
        "seratafilm-page.css",
    ):
        p = resolve(stem)
        if not p:
            continue
        n = wire_bytes(p)
        if n > 200_000:
            raise AssertionError(f"fase4: scoped CSS {stem} wire {n} > 200000")

    samples = (
        "privacy/index.html",
        "tickets/index.html",
        "seratafilm/index.html",
        "staff/index.html",
        "dashboard/index.html",
        "bacheca/index.html",
        "faq/index.html",
        "index.html",
    )
    for rel in samples:
        html = www / rel
        if not html.exists():
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        scoped = any(s in raw for s in SCOPED_PAGE_CSS)
        if scoped and ("vc-page-bundle" in raw or "page-bundle." in raw):
            raise AssertionError(f"fase4: {rel} scoped page references page-bundle")
        if "vc-boot-load-screen" not in raw and "vc-pre-cine-hard-sipario" not in raw:
            raise AssertionError(f"fase4: {rel} missing sipario marker")
        if scoped and (
            'data-vc-fase2-defer="1"' in raw
            or re.search(r'vc-look-core[^>]+media=["\']print["\']', raw, flags=re.I)
            or re.search(r'vc-soft-fx[^>]+media=["\']print["\']', raw, flags=re.I)
        ):
            raise AssertionError(f"fase4: {rel} look/soft stuck on print defer")
        hrefs = set(re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']', raw, flags=re.I))
        if len(hrefs) > 28:
            raise AssertionError(f"fase4: {rel} css hrefs {len(hrefs)} > 28")

    print("assert_ok fase4_guardrails", "kit", early_kit, "js", early_js)

def assert_fase3_cpu(www: Path) -> None:
    """fase3Cpu1: markers in inject/perf/marquee/home-cine/soft-fx; no 50ms boot pulse."""
    checks = [
        ("js", "vc-auth-inject*.js", ("fase3Cpu1", "}, 200)")),
        ("js", "vc-perf*.js", ("fase3Cpu1", "IDLE_MS = 2400")),
        ("js", "vc-header-name-marquee*.js", ("fase3Cpu1",)),
        ("js", "vc-home-cine*.js", ("fase3NoCanvas1",)),
        ("css", "vc-soft-fx*.css", ("fase3Cpu1",)),
    ]
    for folder, glob_pat, markers in checks:
        found = False
        for p in (www / folder).glob(glob_pat):
            if p.name.endswith(".gz"):
                continue
            txt = p.read_text(encoding="utf-8", errors="ignore")
            if all(m in txt for m in markers):
                found = True
                break
        if not found:
            raise AssertionError(f"fase3: missing markers {markers} in {folder}/{glob_pat}")
    for p in (www / "js").glob("vc-auth-inject.20261018fase3Cpu1.js"):
        t = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"\}, 50\)", t):
            raise AssertionError("fase3: 50ms interval still present in " + p.name)
    print("assert_ok fase3_cpu")


def assert_fase1_no_bundle_on_scoped(www: Path) -> None:
    """fase1NoBundle1: HTML with scoped page CSS must not reference page-bundle."""
    bad: list[str] = []
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        has_scoped = any(s in raw for s in SCOPED_PAGE_CSS)
        if not has_scoped:
            continue
        if "vc-page-bundle" in raw or "page-bundle." in raw:
            bad.append(rel)
    if bad:
        raise AssertionError(
            "fase1: scoped pages still reference page-bundle: " + ", ".join(bad[:20])
        )
    # auth-inject must contain skip helpers
    ai_hits = list((www / "js").glob("vc-auth-inject*.js"))
    found = False
    for p in ai_hits:
        if p.name.endswith(".gz"):
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        if (
            "pageHasScopedPageCss" in t
            and ("fase1NoBundle1" in t or "cssCleanShell1" in t)
            and "injectVcShellCss" in t
        ):
            found = True
            break
    if not found:
        raise AssertionError(
            "fase1: vc-auth-inject missing pageHasScopedPageCss / cssCleanShell1 / injectVcShellCss"
        )
    print("assert_ok fase1_no_bundle_on_scoped")


def prune_orphan_stamps(roots: list[Path], dry_run: bool) -> None:
    """Delegate to purge_orphan_stamps.py (same folder) — disk only, visual lock."""
    import subprocess

    script = Path(__file__).resolve().parent / "purge_orphan_stamps.py"
    if not script.is_file():
        print("WARN prune_orphan_stamps.py missing — skip")
        return
    cmd = ["python3", str(script)]
    # first root is www
    cmd += ["--www", str(roots[0])]
    if len(roots) > 1:
        cmd += ["--opt", str(roots[1])]
    cmd.append("--dry-run" if dry_run else "--apply")
    print("RUN", " ".join(cmd))
    subprocess.check_call(cmd)


def assert_no_dual_css(www: Path) -> None:
    """Fail if public HTML still pulls scrubbed mega dual stacks."""
    bad_re = re.compile(
        r"""(?:href|src)=["'][^"']*(?:landing-ext|tw-build|/css/pages/vc-page-bundle|vc-page-bundle\.)[^"']*["']""",
        re.I,
    )
    fails: list[str] = []
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        if html.name.startswith("_"):
            continue
        text = html.read_text(encoding="utf-8", errors="replace")
        if bad_re.search(text):
            fails.append(rel)
    if fails:
        print("FAIL dual-css in", len(fails), "files sample:", fails[:8])
        raise SystemExit(2)
    print("PASS assert_no_dual_css")


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
    ap.add_argument(
        "--assert-fase1",
        action="store_true",
        help="Assert scoped pages have no page-bundle HTML refs + auth-inject skip",
    )
    ap.add_argument(
        "--assert-fase2",
        action="store_true",
        help="Assert gzip on stamps + fase2Defer1 inject + post-curtain lazy",
    )
    ap.add_argument(
        "--assert-fase3",
        action="store_true",
        help="Assert fase3Cpu1 markers (no 50ms pulse, settle, soft-fx idle)",
    )
    ap.add_argument(
        "--assert-fase4",
        action="store_true",
        help="fase4Guard1: budgets + no page-bundle on scoped samples + sipario",
    )
    ap.add_argument(
        "--heal-gz",
        action="store_true",
        help="fase2Gzip1: create/refresh missing .gz beside every css/js",
    )
    ap.add_argument(
        "--bake-fase2-defer",
        action="store_true",
        help="fase2Bake1: scoped HTML look/soft -> media=print post-curtain",
    )
    ap.add_argument(
        "--scrub-route-assets",
        action="store_true",
        help="siteOptAll1: neutra script/CSS off-path in HTML (zero GET, look lock)",
    )
    ap.add_argument("--purge", action="store_true")
    ap.add_argument("--purge-urls", default="", help="Extra URLs comma-separated")
    ap.add_argument(
        "--prune-stamps",
        action="store_true",
        help="Delete orphan stamped css/js not in registry/HTML (visual lock: disk only)",
    )
    ap.add_argument(
        "--assert-no-dual-css",
        action="store_true",
        help="Fail if HTML still links landing-ext / tw-build / page-bundle",
    )
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

    if args.heal_gz:
        heal_missing_gz(roots, args.dry_run)

    if args.bake_fase2_defer:
        bake_fase2_defer_css_on_scoped(args.www, args.dry_run)
        if args.opt:
            bake_fase2_defer_css_on_scoped(args.opt, args.dry_run)

    if args.scrub_route_assets:
        scrub_html_route_assets(args.www, args.dry_run)
        if args.opt:
            scrub_html_route_assets(args.opt, args.dry_run)

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

    if args.assert_fase1 and not args.dry_run:
        assert_fase1_no_bundle_on_scoped(args.www)

    if args.assert_fase2 and not args.dry_run:
        assert_fase2_gzip_and_defer(args.www)

    if args.assert_fase3 and not args.dry_run:
        assert_fase3_cpu(args.www)

    if args.assert_fase4 and not args.dry_run:
        assert_fase4_guardrails(args.www)

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

    if args.prune_stamps:
        prune_orphan_stamps(roots, dry_run=args.dry_run)

    if args.assert_no_dual_css and not args.dry_run:
        assert_no_dual_css(args.www)

    print("PASS deploy_assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
