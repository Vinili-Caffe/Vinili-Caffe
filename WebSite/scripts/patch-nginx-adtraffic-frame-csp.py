#!/usr/bin/env python3
"""Add Google Ad Traffic Quality hosts to CSP frame-src (ep1/ep2 iframes)."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

NGINX = Path("/etc/nginx/sites-enabled/viniliecaffe")
ADD = (
    " https://ep1.adtrafficquality.google"
    " https://ep2.adtrafficquality.google"
    " https://*.adtrafficquality.google"
)


def patch_csp(csp: str) -> str:
    # frame-src: add adtrafficquality if missing
    m = re.search(r"(frame-src )([^;]+)(;)", csp)
    if not m:
        return csp
    frame = m.group(2)
    if "adtrafficquality.google" in frame:
        return csp
    # insert before trailing fundingchoices if present, else append
    if "fundingchoicesmessages.google.com" in frame:
        frame2 = frame.replace(
            "https://fundingchoicesmessages.google.com",
            "https://fundingchoicesmessages.google.com" + ADD,
            1,
        )
    else:
        frame2 = frame.rstrip() + ADD
    return csp[: m.start(2)] + frame2 + csp[m.end(2) :]


def main() -> None:
    bak = NGINX.with_name(NGINX.name + ".bak-adtrafficFrameCsp1")
    text = NGINX.read_text(encoding="utf-8", errors="replace")
    if not bak.exists():
        bak.write_text(text, encoding="utf-8")
        print("OK bak", bak)

    def repl(m: re.Match[str]) -> str:
        return m.group(1) + patch_csp(m.group(2)) + m.group(3)

    new_text, n = re.subn(
        r'(add_header Content-Security-Policy ")([^"]+)(" always;)',
        repl,
        text,
    )
    print("patched headers", n)
    if n < 1:
        raise SystemExit("no CSP headers")
    # assert
    for m in re.finditer(
        r'add_header Content-Security-Policy "([^"]+)" always;',
        new_text,
    ):
        csp = m.group(1)
        fs = re.search(r"frame-src[^;]+", csp)
        if not fs or "ep2.adtrafficquality.google" not in fs.group(0):
            raise SystemExit("assert fail: ep2 still missing in frame-src")
    NGINX.write_text(new_text, encoding="utf-8")
    subprocess.check_call(["nginx", "-t"])
    subprocess.check_call(["systemctl", "reload", "nginx"])
    print("PASS nginx adtraffic frame-src")


if __name__ == "__main__":
    main()
