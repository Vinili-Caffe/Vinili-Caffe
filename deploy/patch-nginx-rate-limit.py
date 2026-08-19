#!/usr/bin/env python3
"""Install nginx rate limits for viniliecaffe (zones + server locations)."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

CONF_D = Path("/etc/nginx/conf.d/vc-rate-limit.conf")
SITE = Path("/etc/nginx/sites-enabled/viniliecaffe")
MARKER = "# VC rate limit (anti-DDoS)"

ZONES = """\
# VC rate limit (anti-DDoS)
limit_req_zone $binary_remote_addr zone=vc_site_general:16m rate=25r/s;
limit_req_zone $binary_remote_addr zone=vc_site_api:16m rate=8r/s;
limit_req_zone $binary_remote_addr zone=vc_site_static:16m rate=60r/s;
limit_conn_zone $binary_remote_addr zone=vc_site_conn:16m;
"""

SERVER_LIMITS = f"""\
    {MARKER}
    limit_conn vc_site_conn 50;
    limit_req_status 429;
    limit_conn_status 429;
"""

LOCATION_RULES = [
    (r"location \^~ /js/ \{", "        limit_req zone=vc_site_static burst=120 nodelay;\n", "js"),
    (r"location \^~ /css/ \{", "        limit_req zone=vc_site_static burst=120 nodelay;\n", "css"),
    (r"location \^~ /images/ \{", "        limit_req zone=vc_site_static burst=80 nodelay;\n", "images"),
    (r"location \^~ /webhooks/site- \{", "      limit_req zone=vc_site_api burst=24 nodelay;\n", "webhooks-site"),
    (r"location /webhooks/ \{", "      limit_req zone=vc_site_api burst=24 nodelay;\n", "webhooks"),
    (r"location / \{", "        limit_req zone=vc_site_general burst=50 nodelay;\n", "root"),
]


def write_zones() -> None:
    if CONF_D.exists() and MARKER in CONF_D.read_text(encoding="utf-8"):
        print(f"zones ok: {CONF_D}")
        return
    CONF_D.write_text(ZONES, encoding="utf-8")
    print(f"wrote {CONF_D}")


def strip_orphan_limits(text: str) -> tuple[str, bool]:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    removed = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"^\s+limit_req zone=vc_site", line):
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if re.match(r"^\s*location\b", nxt):
                removed = True
                i += 1
                continue
        out.append(line)
        i += 1
    return "".join(out), removed


def patch_location(text: str, loc_pattern: str, insert: str, label: str) -> tuple[str, bool]:
    m = re.search(loc_pattern, text)
    if not m:
        print(f"WARN: location not found: {label}", file=sys.stderr)
        return text, False
    brace = text.find("{", m.start())
    if brace == -1:
        return text, False
    block_end = text.find("\n    location ", brace + 1)
    if block_end == -1:
        block_end = len(text)
    block = text[brace:block_end]
    if "limit_req zone=vc_site" in block:
        print(f"skip (already limited): {label}")
        return text, False
    insert_at = brace + 1
    if text[insert_at : insert_at + 1] == "\n":
        insert_at += 1
    return text[:insert_at] + insert + text[insert_at:], True


def patch_site() -> bool:
    text = SITE.read_text(encoding="utf-8")
    text, changed = strip_orphan_limits(text)

    if MARKER not in text:
        m = re.search(r"(server\s*\{\s*\n\s*server_name\s+www\.viniliecaffe\.it;\s*\n)", text)
        if not m:
            print("ERROR: www server block not found", file=sys.stderr)
            return False
        text = text[: m.end()] + SERVER_LIMITS + text[m.end() :]
        changed = True
        print("patched server limits")

    for loc_pattern, insert, label in LOCATION_RULES:
        text, did = patch_location(text, loc_pattern, insert, label)
        if did:
            changed = True
            print(f"patched location: {label}")

    if changed:
        backup = SITE.with_suffix(".bak-rate-limit")
        if not backup.exists():
            backup.write_text(SITE.read_text(encoding="utf-8"), encoding="utf-8")
        SITE.write_text(text, encoding="utf-8")
        print(f"updated {SITE}")
    else:
        SITE.write_text(text, encoding="utf-8")
        print(f"site ok: {SITE}")
    return True


def nginx_test_reload() -> None:
    subprocess.run(["nginx", "-t"], check=True)
    subprocess.run(["systemctl", "reload", "nginx"], check=True)
    print("nginx reloaded")


def main() -> int:
    write_zones()
    if not patch_site():
        return 1
    nginx_test_reload()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
