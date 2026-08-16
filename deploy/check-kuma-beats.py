#!/usr/bin/env python3
from uptime_kuma_api import UptimeKumaApi

creds = {}
for line in open("/root/.uptime-kuma-admin", encoding="utf-8"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        creds[k] = v
api = UptimeKumaApi(creds["UPTIME_KUMA_URL"], timeout=60)
api.login(creds["UPTIME_KUMA_USER"], creds["UPTIME_KUMA_PASS"])
for m in api.get_monitors():
    hb = api.get_monitor_beats(m["id"], 1)
    last = hb[-1] if hb else {}
    print(m.get("name"), "->", last.get("status"), last.get("msg"))
api.disconnect()
