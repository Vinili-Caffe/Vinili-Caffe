#!/usr/bin/env python3
"""Ban IPs that hammer nginx rate limits (HTTP 429)."""
from __future__ import annotations

import subprocess
from pathlib import Path

FILTER = Path("/etc/fail2ban/filter.d/nginx-limit-req.conf")
JAIL = Path("/etc/fail2ban/jail.d/nginx-limit-req.local")

FILTER_BODY = """\
[Definition]
failregex = ^<HOST> -.* "(GET|POST|PATCH|DELETE|PUT|HEAD|OPTIONS).*" 429
ignoreregex =
"""

JAIL_BODY = """\
[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/access.log
maxretry = 40
findtime = 120
bantime = 30m
"""


def main() -> int:
    FILTER.write_text(FILTER_BODY, encoding="utf-8")
    JAIL.write_text(JAIL_BODY, encoding="utf-8")
    subprocess.run(["systemctl", "restart", "fail2ban"], check=True)
    print("fail2ban nginx-limit-req enabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
