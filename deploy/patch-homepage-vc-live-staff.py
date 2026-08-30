#!/usr/bin/env python3
"""Sync homepage live stats + OG title from live-stats-extra.json.

Safe: restores data-live-stat on members/boosts/staff if a previous patch mangled them.
"""
from __future__ import annotations

import html as html_lib
import json
import re
import sys
import time
from pathlib import Path


def extract_vc_live_json(html: str) -> tuple[int, int, dict]:
    """Return (start, end, cfg) for window.__VC_LIVE={...}; (end exclusive of trailing ;</script>)."""
    marker = "<script>window.__VC_LIVE="
    start = html.find(marker)
    if start < 0:
        # allow whitespace variants
        m = re.search(r"<script>\s*window\.__VC_LIVE\s*=\s*", html)
        if not m:
            raise SystemExit("__VC_LIVE script not found")
        start = m.start()
        brace_at = html.find("{", m.end() - 1)
    else:
        brace_at = start + len(marker)
    if brace_at < 0 or html[brace_at] != "{":
        raise SystemExit("__VC_LIVE opening brace not found")
    depth = 0
    in_str = False
    esc = False
    i = brace_at
    while i < len(html):
        ch = html[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    cfg = json.loads(html[brace_at : i + 1])
                    end = i + 1
                    # consume optional ;</script>
                    rest = html[end : end + 16]
                    m_end = re.match(r"\s*;\s*</script>", rest, flags=re.I)
                    if m_end:
                        end += m_end.end()
                    return start, end, cfg
        i += 1
    raise SystemExit("__VC_LIVE JSON not closed")


def replace_stat_num(html: str, i18n_key: str, live_key: str, target: int | None) -> str:
    """Rewrite the vc-stat-num <p> that precedes a given i18n label."""
    label_re = re.compile(
        rf'(<p\s+class="vc-stat-num(?![^>]*\bvc-stat-247\b)[^"]*")([^>]*)(>\s*'
        rf'<span class="vc-stat-num-inner">[^<]*</span>\s*</p>\s*'
        rf'<p class="vc-stat-label"[^>]*data-i18n="{re.escape(i18n_key)}")',
        flags=re.I,
    )

    def repl(m: re.Match[str]) -> str:
        attrs = f' data-live-stat="{live_key}"'
        if target is not None:
            attrs += f' data-stat-target="{int(target)}"'
        return f"{m.group(1)}{attrs}{m.group(3)}"

    out, n = label_re.subn(repl, html, count=1)
    if n != 1:
        raise SystemExit(f"stat cell not found/unique for {i18n_key} (matches={n})")
    return out


def main() -> None:
    html_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/var/www/viniliecaffe/index.html")
    json_path = Path(sys.argv[2] if len(sys.argv) > 2 else "/var/www/viniliecaffe/live-stats-extra.json")

    extra = json.loads(json_path.read_text(encoding="utf-8"))
    html = html_path.read_text(encoding="utf-8")
    start, end, cfg = extract_vc_live_json(html)

    cfg["staffNoPm"] = extra.get("staffNoPm", cfg.get("staffNoPm"))
    if isinstance(extra.get("staffHoverGroups"), list) and extra["staffHoverGroups"]:
        cfg["staffHoverGroups"] = extra["staffHoverGroups"]
    if isinstance(extra.get("boostHoverMembers"), list):
        cfg["boostHoverMembers"] = extra["boostHoverMembers"]
    if extra.get("guildMemberCount") is not None:
        cfg["guildMemberCount"] = extra["guildMemberCount"]
    if extra.get("guildBoostCount") is not None:
        cfg["guildBoostCount"] = extra["guildBoostCount"]
    if isinstance(extra.get("memberPulse"), dict):
        cfg["memberPulse"] = extra["memberPulse"]
    if isinstance(extra.get("communityHours"), dict):
        cfg["communityHours"] = extra["communityHours"]

    new_json = json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))
    new_script = f"<script>window.__VC_LIVE={new_json};</script>"
    html2 = html[:start] + new_script + html[end:]

    def as_nonneg_int(raw):
        if raw is None or str(raw).strip() == "":
            return None
        try:
            n = int(float(raw))
        except (TypeError, ValueError):
            return None
        return n if n >= 0 else None

    members = as_nonneg_int(extra.get("guildMemberCount"))
    boosts = as_nonneg_int(extra.get("guildBoostCount"))
    staff = as_nonneg_int(extra.get("staffNoPm"))

    og_title = None
    if members is not None:
        site_name = "Vinili & Caffè"
        m_title = re.search(
            r"<title>([^<]*?)\s*\|\s*Community Discord italiana",
            html2,
            re.I,
        )
        if m_title:
            raw_name = html_lib.unescape(m_title.group(1)).strip()
            if raw_name:
                site_name = raw_name
        og_title = f"{site_name} | Community Discord italiana · {members}+ membri"
        og_esc = html_lib.escape(og_title, quote=True)
        html2 = re.sub(r"(<title>)[^<]*(</title>)", rf"\1{og_esc}\2", html2, count=1, flags=re.I)
        html2 = re.sub(
            r'(<meta\s+property=["\']og:title["\']\s+content=["\'])[^"\']*(["\']\s*/?>)',
            rf"\1{og_esc}\2",
            html2,
            count=1,
            flags=re.I,
        )
        html2 = re.sub(
            r'(<meta\s+name=["\']twitter:title["\']\s+content=["\'])[^"\']*(["\']\s*/?>)',
            rf"\1{og_esc}\2",
            html2,
            count=1,
            flags=re.I,
        )

    # Always rewrite the three numeric cells by label — repairs mangled leftovers like `P95"` / `b"`.
    html2 = replace_stat_num(html2, "home.statMembers", "members", members)
    html2 = replace_stat_num(html2, "home.statBoosts", "boosts", boosts)
    html2 = replace_stat_num(html2, "home.statStaff", "staff", staff)

    ver = str(int(time.time()))
    html2 = re.sub(r"live-stats\.js(?:\?v=[^\"'&\s]+)?", f"live-stats.js?v={ver}", html2)
    html2 = re.sub(r"vc-landing\.css(?:\?v=[^\"'&\s]+)?", f"vc-landing.css?v={ver}", html2)
    html2 = re.sub(
        r"vc-header-name-marquee\.js(?:\?v=[^\"'&\s]+)?",
        f"vc-header-name-marquee.js?v={ver}",
        html2,
    )
    html2 = re.sub(r"vc-home-cine\.js(?:\?v=[^\"'&\s]+)?", f"vc-home-cine.js?v={ver}", html2)

    # Sanity: attrs must exist and no garbage leftovers from older broken patches.
    for key in ("members", "boosts", "staff"):
        if f'data-live-stat="{key}"' not in html2:
            raise SystemExit(f"missing data-live-stat={key} after patch")
    if re.search(r'sm:text-4xl"\s+[A-Za-z0-9]+">', html2):
        raise SystemExit("mangled vc-stat-num attributes still present")

    html_path.write_text(html2, encoding="utf-8")
    pulse = cfg.get("memberPulse") or {}
    print(
        "[vc-live-staff] patched",
        html_path,
        "staffNoPm=",
        cfg.get("staffNoPm"),
        "members=",
        members,
        "boosts=",
        boosts,
        "og=",
        og_title,
        "msgs7d=",
        pulse.get("messages7d"),
        "active7d=",
        pulse.get("activeMembers7d"),
        "v=",
        ver,
    )


if __name__ == "__main__":
    main()
