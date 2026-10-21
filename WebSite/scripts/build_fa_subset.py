#!/usr/bin/env python3
"""Build Font Awesome 4 subset (woff2+css) from icons used in HTML/JS.

Aliases map non-FA4 class names to real glyphs (look lock).
Requires: fonttools (pyftsubset).
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path

CLASS_RE = re.compile(r'class=["\']([^"\']+)["\']', re.I)
ICON = re.compile(
    r"(?:^|\s)(?:fa(?:s|r|b)?|fa-solid|fa-regular|fa-brands)\s+fa-([a-z0-9-]+)",
    re.I,
)
ICON_JS = re.compile(r"""fa\s+fa-([a-z0-9-]+)""", re.I)
RULE_RE = re.compile(
    r"\.fa-([a-z0-9-]+):before\s*\{\s*content:\s*[\"']\\([a-fA-F0-9]+)[\"']",
    re.I,
)

# HTML/JS sometimes uses FA5-ish names missing from FA4 webfont
ALIASES = {
    "edit": "pencil",
    "image": "picture-o",
    "discord-alt": "sign-in",
    "discord": "sign-in",
}


def collect_icons(www: Path) -> set[str]:
    names: set[str] = set()
    skip = {"node_modules", "css", "images", "fonts", "audio", "emoji", ".git", "_archive", "_tmp_stage"}
    for root, dirs, files in os.walk(www):
        dirs[:] = [d for d in dirs if d not in skip and not d.startswith("_tmp")]
        for f in files:
            if not f.endswith((".html", ".js")):
                continue
            # skip stamped copies except bare stems under js/
            if ".20" in f and not f.startswith("vc-"):
                continue
            if re.search(r"\.\d{8}", f) and f.endswith(".js"):
                # only scan canonical-ish / known inject sources
                if not any(x in f for x in ("auth-inject", "landing-notif", "login-required", "boards-manage", "notif")):
                    continue
            text = (Path(root) / f).read_text(encoding="utf-8", errors="replace")
            if f.endswith(".html"):
                for cm in CLASS_RE.finditer(text):
                    for m in ICON.finditer(cm.group(1)):
                        names.add(m.group(1))
            else:
                for m in ICON_JS.finditer(text):
                    names.add(m.group(1))
    # always include alias sources+targets (legacy class names in cached HTML)
    for src, dst in ALIASES.items():
        names.add(src)
        names.add(dst)
    return names


def resolve_code(name: str, code_by_name: dict[str, str]) -> tuple[str, str] | None:
    """Return (css_class_name, unicode_hex) after alias."""
    target = ALIASES.get(name, name)
    code = code_by_name.get(target) or code_by_name.get(name)
    if not code:
        return None
    return target if name in ALIASES else name, code


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--www", type=Path, required=True)
    ap.add_argument("--apply", action="store_true", help="also write wire marker file")
    args = ap.parse_args()

    www = args.www
    fa_css = www / "css" / "font-awesome" / "css" / "font-awesome.min.css"
    if not fa_css.exists():
        fa_css = www / "css" / "font-awesome" / "font-awesome.min.css"
    fa_woff2 = www / "css" / "font-awesome" / "fonts" / "fontawesome-webfont.woff2"
    if not fa_woff2.exists():
        cands = list((www / "css" / "font-awesome").rglob("fontawesome-webfont.woff2"))
        fa_woff2 = cands[0] if cands else fa_woff2

    icons = collect_icons(www)
    css_text = fa_css.read_text(encoding="utf-8", errors="replace")
    code_by_name = {m.group(1): m.group(2).lower() for m in RULE_RE.finditer(css_text)}

    resolved: dict[str, str] = {}  # class name -> code
    missing = []
    for name in sorted(icons):
        # emit both alias source and target rules when aliased
        if name in ALIASES:
            target = ALIASES[name]
            code = code_by_name.get(target)
            if not code:
                missing.append(name)
                continue
            resolved[name] = code  # .fa-edit -> same as pencil
            resolved[target] = code
            continue
        code = code_by_name.get(name)
        if not code:
            missing.append(name)
            continue
        resolved[name] = code

    unicodes = sorted({f"U+{c.upper()}" for c in resolved.values()})
    print(f"icons={len(icons)} resolved_rules={len(resolved)} unicodes={len(unicodes)} missing={len(missing)}")
    if missing[:20]:
        print("missing sample:", ", ".join(missing[:20]))

    out_dir = www / "css" / "font-awesome" / "subset"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "used-icons.txt").write_text("\n".join(sorted(icons)) + "\n", encoding="utf-8")

    try:
        subprocess.check_output(["pyftsubset", "--help"], stderr=subprocess.STDOUT)
    except Exception:
        print("SKIP pyftsubset not installed — wrote used-icons.txt only")
        print("PASS build_fa_subset (report)")
        return

    if not fa_woff2.exists():
        print("FAIL no woff2", fa_woff2)
        raise SystemExit(1)

    out_font = out_dir / "fa-subset.woff2"
    cmd = [
        "pyftsubset",
        str(fa_woff2),
        f"--unicodes={','.join(unicodes) if unicodes else 'U+F000'}",
        "--flavor=woff2",
        f"--output-file={out_font}",
    ]
    print("RUN pyftsubset ...")
    subprocess.check_call(cmd)
    print(
        f"subset_woff2={out_font.stat().st_size} full_woff2={fa_woff2.stat().st_size} "
        f"saved={(fa_woff2.stat().st_size - out_font.stat().st_size)/1024:.0f}KB"
    )

    first_icon = re.search(r"\.fa-[a-z0-9-]+:before\{", css_text)
    head = css_text[: first_icon.start()] if first_icon else css_text
    used_rules = [f'.fa-{n}:before{{content:"\\{c}"}}' for n, c in sorted(resolved.items())]
    subset_css = head + "".join(used_rules)
    subset_css = re.sub(
        r"url\(['\"]?\.\./fonts/fontawesome-webfont\.(?:woff2|woff|ttf|eot)[^'\"]*['\"]?\)\s*format\([^)]+\)\s*,?",
        "",
        subset_css,
    )
    subset_css = re.sub(
        r"src:\s*url\([^)]+\)\s*;",
        "src:url('../subset/fa-subset.woff2') format('woff2');",
        subset_css,
        count=1,
    )
    # ensure woff2 path if src rewrite missed
    if "fa-subset.woff2" not in subset_css:
        subset_css = re.sub(
            r"url\(['\"]?\.\./fonts/fontawesome-webfont\.woff2[^'\"]*['\"]?\)",
            "url('../subset/fa-subset.woff2')",
            subset_css,
        )
    out_css = out_dir / "font-awesome.subset.min.css"
    out_css.write_text(subset_css, encoding="utf-8")
    print(f"subset_css={out_css.stat().st_size} full_css={fa_css.stat().st_size}")
    (out_dir / "WIRE.txt").write_text(
        "ready — inject should prefer /css/font-awesome/subset/font-awesome.subset.min.css\n",
        encoding="utf-8",
    )
    print("PASS build_fa_subset")


if __name__ == "__main__":
    main()
