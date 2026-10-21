#!/usr/bin/env python3
"""fase4Guard1 — continuous perf/CSS guardrails for Vinili & Caffè site.

Run on VPS (or locally against a WWW tree):

  python3 probe_guardrails.py --www /var/www/viniliecaffe
  python3 probe_guardrails.py --www /var/www/viniliecaffe --http --json /tmp/vc_fase4_report.json

Budgets (gz wire when .gz exists, else raw):
  - early kit CSS (boot-kit + fonts): < 40KB
  - early JS (perf + auth-inject + asset-versions): < 100KB
  - single scoped page CSS sheet: < 200KB
  - scoped public HTML: no page-bundle
  - scoped: look/soft deferred (fase2 bake) OR media=print
  - sipario markers present; flashKill failsafe <= 8000ms
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

SKIP_HTML_PARTS = ("node_modules", ".git", "backup", "partials", "dist", "scripts", "_archive")
SCOPED_PAGE_CSS = (
    "vc-page-legal",
    "vc-page-cine-public",
    "vc-page-tickets",
    "vc-page-bacheca",
    "vc-page-staff",
    "vc-page-dashboard",
    "seratafilm-page",
)

SAMPLE_ROUTES = (
    "index.html",
    "privacy/index.html",
    "tickets/index.html",
    "seratafilm/index.html",
    "staff/index.html",
    "dashboard/index.html",
    "bacheca/index.html",
    "candidature/index.html",
    "faq/index.html",
    "404.html",
)

EARLY_KIT_CSS = ("vc-site-boot-kit.css", "vc-fonts.css")
EARLY_JS = ("vc-perf.js", "vc-auth-inject.js", "vc-asset-versions.js")
SCOPED_SHEETS = (
    "vc-page-legal.css",
    "vc-page-cine-public.css",
    "vc-page-tickets.css",
    "vc-page-bacheca.css",
    "vc-page-staff.css",
    "vc-page-dashboard.css",
    "seratafilm-page.css",
)

EARLY_KIT_GZ_MAX = 40_000
EARLY_JS_GZ_MAX = 100_000
SCOPED_PAGE_CSS_GZ_MAX = 200_000
CSS_LINK_MAX = 28
SIPARIO_FAILSAFE_MS_MAX = 8000
PAGE_BUNDLE_GZ_ALARM = 400_000  # mega-bundle still on disk OK; HTML must not ref it


def load_registry(www: Path) -> dict:
    p = www / "asset-versions.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def baseline_map(reg: dict) -> dict[str, str]:
    if isinstance(reg.get("assets"), dict) and reg["assets"]:
        return {k: str(v) for k, v in reg["assets"].items()}
    return {}


def stamped_path(www: Path, stem: str, ver: str) -> Path:
    folder = "js" if stem.endswith(".js") else "css"
    p = Path(stem)
    return www / folder / f"{p.stem}.{ver}{p.suffix}"


def wire_bytes(path: Path) -> int:
    gz = Path(str(path) + ".gz")
    if gz.exists():
        return gz.stat().st_size
    return path.stat().st_size if path.exists() else 0


def resolve_asset(www: Path, assets: dict[str, str], stem: str) -> Path | None:
    ver = assets.get(stem)
    if ver:
        stamped = stamped_path(www, stem, ver)
        if stamped.exists():
            return stamped
    folder = "js" if stem.endswith(".js") else "css"
    canon = www / folder / stem
    return canon if canon.exists() else None


def sum_wire(www: Path, assets: dict[str, str], stems: tuple[str, ...]) -> tuple[int, list[dict]]:
    total = 0
    detail = []
    for stem in stems:
        p = resolve_asset(www, assets, stem)
        if not p:
            detail.append({"stem": stem, "missing": True})
            continue
        n = wire_bytes(p)
        total += n
        detail.append({"stem": stem, "path": p.name, "wire": n})
    return total, detail


def assert_no_bundle_scoped(www: Path) -> list[str]:
    bad = []
    for html in www.rglob("*.html"):
        rel = html.relative_to(www).as_posix()
        if any(x in rel for x in SKIP_HTML_PARTS):
            continue
        raw = html.read_text(encoding="utf-8", errors="ignore")
        if not any(s in raw for s in SCOPED_PAGE_CSS):
            continue
        if "vc-page-bundle" in raw or "page-bundle." in raw:
            bad.append(rel)
    return bad


def sample_page_report(www: Path, rel: str) -> dict:
    p = www / rel
    out: dict = {"route": rel, "exists": p.exists()}
    if not p.exists():
        return out
    raw = p.read_text(encoding="utf-8", errors="ignore")
    out["bytes_html"] = len(raw.encode("utf-8", errors="ignore"))
    hrefs = re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']', raw, flags=re.I)
    out["css_hrefs"] = len(set(hrefs))
    out["css_links"] = out["css_hrefs"]
    out["has_page_bundle"] = ("vc-page-bundle" in raw) or ("page-bundle." in raw)
    out["has_scoped"] = any(s in raw for s in SCOPED_PAGE_CSS)
    out["has_sipario"] = ("vc-boot-load-screen" in raw) or ("vc-pre-cine-hard-sipario" in raw)
    out["has_sipario_css"] = "vc-sipario-load-sync-css" in raw or "vc-pre-cine-hard-sipario-css" in raw
    failsafe = None
    # common: openGate("t8000");},8000);
    m_fs = re.search(
        r'openGate\(\s*["\']t(\d+)["\']\s*\)\s*;\s*\}\s*,\s*(\d+)\s*\)',
        raw,
    )
    if m_fs:
        failsafe = int(m_fs.group(2))
    elif re.search(r'openGate\(\s*["\']t8000["\']\s*\)', raw):
        failsafe = 8000
    out["sipario_failsafe_ms"] = failsafe
    out["look_print_stuck"] = bool(
        re.search(r'vc-look-core[^>]+media=["\']print["\']', raw, flags=re.I)
        or 'data-vc-fase2-defer="1"' in raw
    )
    out["soft_print_stuck"] = bool(
        re.search(r'vc-soft-fx[^>]+media=["\']print["\']', raw, flags=re.I)
    )
    return out


def http_probe(path: str, host: str = "www.viniliecaffe.it") -> dict:
    url = f"http://127.0.0.1/{path.lstrip('/')}"
    req = urllib.request.Request(
        url,
        headers={"Host": host, "Cache-Control": "no-cache", "Accept-Encoding": "gzip"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            return {
                "url": path,
                "status": r.status,
                "bytes": len(body),
                "encoding": r.headers.get("Content-Encoding"),
                "has_bundle": b"vc-page-bundle" in body or b"page-bundle." in body,
            }
    except Exception as e:
        return {"url": path, "error": str(e)}


def run(www: Path, do_http: bool) -> dict:
    reg = load_registry(www)
    assets = baseline_map(reg)
    report: dict = {
        "ver": reg.get("ver"),
        "fase": "fase4Guard1",
        "ok": True,
        "errors": [],
        "warnings": [],
    }

    kit_total, kit_detail = sum_wire(www, assets, EARLY_KIT_CSS)
    js_total, js_detail = sum_wire(www, assets, EARLY_JS)
    report["early_kit_css"] = {"total_wire": kit_total, "max": EARLY_KIT_GZ_MAX, "items": kit_detail}
    report["early_js"] = {"total_wire": js_total, "max": EARLY_JS_GZ_MAX, "items": js_detail}
    if kit_total > EARLY_KIT_GZ_MAX:
        report["errors"].append(f"early_kit_css_wire {kit_total} > {EARLY_KIT_GZ_MAX}")
    if js_total > EARLY_JS_GZ_MAX:
        report["errors"].append(f"early_js_wire {js_total} > {EARLY_JS_GZ_MAX}")

    scoped_items = []
    for stem in SCOPED_SHEETS:
        p = resolve_asset(www, assets, stem)
        if not p:
            continue
        n = wire_bytes(p)
        scoped_items.append({"stem": stem, "path": p.name, "wire": n})
        if n > SCOPED_PAGE_CSS_GZ_MAX:
            report["errors"].append(f"scoped_css_wire {stem} {n} > {SCOPED_PAGE_CSS_GZ_MAX}")
    report["scoped_page_css"] = {"max": SCOPED_PAGE_CSS_GZ_MAX, "items": scoped_items}

    bad_bundle = assert_no_bundle_scoped(www)
    report["scoped_no_page_bundle"] = {"bad": bad_bundle[:30], "count": len(bad_bundle)}
    if bad_bundle:
        report["errors"].append("scoped_pages_reference_page_bundle:" + ",".join(bad_bundle[:12]))

    # mega-bundle still on disk is OK for home/404 — alarm size for awareness
    bundles = []
    pages_dir = www / "css" / "pages"
    if pages_dir.is_dir():
        for p in pages_dir.glob("vc-page-bundle*.css"):
            if p.name.endswith(".gz"):
                continue
            bundles.append({"path": p.name, "wire": wire_bytes(p), "raw": p.stat().st_size})
    report["page_bundle_files"] = bundles

    samples = []
    for rel in SAMPLE_ROUTES:
        info = sample_page_report(www, rel)
        samples.append(info)
        if not info.get("exists"):
            report["warnings"].append(f"missing_sample {rel}")
            continue
        if info.get("css_hrefs", 0) > CSS_LINK_MAX:
            report["errors"].append(f"{rel} css_hrefs {info['css_hrefs']} > {CSS_LINK_MAX}")
        if info.get("has_scoped") and info.get("has_page_bundle"):
            report["errors"].append(f"{rel} scoped+page-bundle")
        if not info.get("has_sipario"):
            # home/404 must have sipario; allow rare exceptions?
            report["errors"].append(f"{rel} missing_sipario_marker")
        fs = info.get("sipario_failsafe_ms")
        if fs is not None and fs > SIPARIO_FAILSAFE_MS_MAX:
            report["errors"].append(f"{rel} sipario_failsafe {fs} > {SIPARIO_FAILSAFE_MS_MAX}")
        if info.get("has_scoped") and (info.get("look_print_stuck") or info.get("soft_print_stuck")):
            report["errors"].append(f"{rel} look_soft_print_defer_stuck")
    report["samples"] = samples

    if do_http:
        http_rows = []
        for path in (
            "privacy/",
            "tickets/",
            "seratafilm/",
            "staff/",
            "dashboard/",
            "",
        ):
            http_rows.append(http_probe(path))
        report["http"] = http_rows
        for row in http_rows:
            if row.get("has_bundle") and row.get("url") not in ("",):
                # home may still use bundle
                if row.get("url") in ("privacy/", "tickets/", "seratafilm/", "staff/", "dashboard/"):
                    report["errors"].append(f"http_bundle_leak {row.get('url')}")

    report["ok"] = not report["errors"]
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="fase4Guard1 continuous guardrails probe")
    ap.add_argument("--www", type=Path, required=True)
    ap.add_argument("--http", action="store_true", help="Also fetch sample routes via localhost Host")
    ap.add_argument("--json", type=Path, default=None, help="Write full JSON report")
    args = ap.parse_args()
    report = run(args.www, args.http)
    if args.json:
        args.json.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("wrote", args.json)
    print(
        "fase4",
        "PASS" if report["ok"] else "FAIL",
        "kit",
        report["early_kit_css"]["total_wire"],
        "js",
        report["early_js"]["total_wire"],
        "bundle_leaks",
        report["scoped_no_page_bundle"]["count"],
        "errors",
        len(report["errors"]),
    )
    for e in report["errors"][:20]:
        print(" ERR", e)
    for w in report["warnings"][:10]:
        print(" WARN", w)
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
