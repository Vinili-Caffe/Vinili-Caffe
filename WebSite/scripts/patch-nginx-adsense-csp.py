#!/usr/bin/env python3
from __future__ import annotations
import re
import subprocess
from pathlib import Path

NGINX = Path("/etc/nginx/sites-enabled/viniliecaffe")


def patch_csp(csp: str) -> str:
    if "pagead2.googlesyndication.com" not in csp:
        csp = csp.replace(
            "script-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com",
            1,
        )
    if "tpc.googlesyndication.com" not in csp.split("frame-src", 1)[-1][:300]:
        csp = csp.replace(
            "frame-src https://www.youtube.com",
            "frame-src https://pagead2.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.youtube.com",
            1,
        )
    connect = csp.split("connect-src", 1)
    if len(connect) > 1 and "pagead2.googlesyndication.com" not in connect[1].split(";", 1)[0]:
        csp = csp.replace(
            "connect-src 'self'",
            "connect-src 'self' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://partner.googleadservices.com https://googleads.g.doubleclick.net",
            1,
        )
    return csp


def main() -> None:
    bak = NGINX.with_name(NGINX.name + ".bak-boardsAdsenseVerify1")
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
    NGINX.write_text(new_text, encoding="utf-8")
    subprocess.check_call(["nginx", "-t"])
    subprocess.check_call(["systemctl", "reload", "nginx"])
    print("PASS nginx adsense csp")


if __name__ == "__main__":
    main()
