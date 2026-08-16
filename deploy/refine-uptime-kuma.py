#!/usr/bin/env python3
"""Rinomina monitor in modo leggibile, sistema il check sito, aggiunge Caffè, status page pubblica semplice."""
from __future__ import annotations

import time
from uptime_kuma_api import UptimeKumaApi, MonitorType


def load_creds(path="/root/.uptime-kuma-admin"):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def by_name(mons):
    return {str(m.get("name") or ""): m for m in (mons or [])}


def main() -> int:
    creds = load_creds()
    api = UptimeKumaApi(creds["UPTIME_KUMA_URL"], timeout=120)
    api.login(creds["UPTIME_KUMA_USER"], creds["UPTIME_KUMA_PASS"])
    mons = api.get_monitors()
    named = by_name(mons)

    # 1) Fix sito: HTTP locale verso nginx/static (niente HTTPS→JSON bug)
    site = named.get("Sito web") or named.get("Sito Vinili & Caffè")
    if site:
        print(f"Aggiorno monitor sito id={site['id']}")
        api.edit_monitor(
            id_=int(site["id"]),
            type=MonitorType.HTTP,
            name="Sito Vinili & Caffè",
            url="http://127.0.0.1:8080/",
            interval=60,
            maxretries=2,
            retryInterval=30,
            ignoreTls=False,
            headers="",
            accepted_statuscodes=["200-299", "301", "302"],
        )
    else:
        print("Creo monitor sito")
        api.add_monitor(
            type=MonitorType.HTTP,
            name="Sito Vinili & Caffè",
            url="http://127.0.0.1:8080/",
            interval=60,
            maxretries=2,
            retryInterval=30,
            accepted_statuscodes=["200-299", "301", "302"],
        )

    # 2) Rinomina bot Vinyls
    vinyls = named.get("Bot Discord (Vinyls)") or named.get("Bot Vinyls") or named.get("Bot Vinili")
    if vinyls:
        api.edit_monitor(
            id_=int(vinyls["id"]),
            type=MonitorType.KEYWORD,
            name="Bot Vinili",
            url="http://127.0.0.1:3000/webhooks/status",
            keyword="online",
            interval=60,
            maxretries=2,
            retryInterval=30,
        )

    # 3) Coffee health
    coffee = named.get("Bot Caffè") or named.get("Bot Coffee")
    if coffee:
        api.edit_monitor(
            id_=int(coffee["id"]),
            type=MonitorType.KEYWORD,
            name="Bot Caffè",
            url="http://127.0.0.1:3011/health",
            keyword='"ok":true',
            interval=60,
            maxretries=2,
            retryInterval=30,
        )
    else:
        print("Creo monitor Bot Caffè")
        api.add_monitor(
            type=MonitorType.KEYWORD,
            name="Bot Caffè",
            url="http://127.0.0.1:3011/health",
            keyword='"ok":true',
            interval=60,
            maxretries=2,
            retryInterval=30,
        )

    # 4) Rinomina interni (restano in dashboard; Database/Musica vanno anche in pagina pubblica)
    renames = {
        "Stack health (bot+mongo+lavalink)": "Interno · Stack completo",
        "Interno · Stack completo": "Interno · Stack completo",
        "Site API": "Interno · API sito",
        "Interno · API sito": "Interno · API sito",
        "Discadia intake": "Voti Discadia",
        "Interno · Voti Discadia": "Voti Discadia",
        "Voti Discadia": "Voti Discadia",
        "MongoDB": "Database",
        "Interno · Database": "Database",
        "Database": "Database",
        "Lavalink": "Musica",
        "Interno · Musica (Lavalink)": "Musica",
        "Musica": "Musica",
    }
    mons = api.get_monitors()
    named = by_name(mons)
    for old, new in renames.items():
        m = named.get(old) or named.get(new)
        if not m:
            continue
        kwargs = {"id": int(m["id"]), "name": new}
        # preserve type/url
        if m.get("type") == "http" or m.get("type") == "keyword":
            kwargs["type"] = MonitorType.KEYWORD if (m.get("keyword") or new.startswith("Interno · Stack") or "API" in new or "Discadia" in new or "keyword" in str(m.get("type"))) else MonitorType.HTTP
            if m.get("url"):
                kwargs["url"] = m["url"]
            if m.get("keyword"):
                kwargs["type"] = MonitorType.KEYWORD
                kwargs["keyword"] = m["keyword"]
        elif str(m.get("type")) in ("port", "PORT") or m.get("port"):
            kwargs["type"] = MonitorType.PORT
            kwargs["hostname"] = m.get("hostname") or "127.0.0.1"
            kwargs["port"] = int(m.get("port") or 0)
        try:
            # edit name only via edit_monitor with existing fields
            edit = {
                "id_": int(m["id"]),
                "name": new,
                "interval": int(m.get("interval") or 60),
                "maxretries": int(m.get("maxretries") or 2),
                "retryInterval": int(m.get("retryInterval") or 30),
            }
            t = str(m.get("type") or "")
            if t in ("keyword", "http"):
                edit["type"] = MonitorType.KEYWORD if t == "keyword" or m.get("keyword") else MonitorType.HTTP
                edit["url"] = m.get("url")
                if m.get("keyword"):
                    edit["keyword"] = m.get("keyword")
                    edit["type"] = MonitorType.KEYWORD
            elif t == "port":
                edit["type"] = MonitorType.PORT
                edit["hostname"] = m.get("hostname") or "127.0.0.1"
                edit["port"] = int(m.get("port"))
            api.edit_monitor(**edit)
            print(f"Rinominato: {old} -> {new}")
        except Exception as e:
            print(f"WARN rename {old}: {e}")

    time.sleep(1)
    mons = api.get_monitors()
    named = by_name(mons)

    public_names = ["Sito Vinili & Caffè", "Bot Vinili", "Bot Caffè", "Database", "Musica", "Voti Discadia"]
    public_ids = []
    for n in public_names:
        m = named.get(n)
        if m:
            public_ids.append(int(m["id"]))
            print(f"Pubblico: {n} id={m['id']}")
        else:
            print(f"WARN manca monitor pubblico: {n}")

    slug = creds.get("STATUS_PAGE_SLUG", "vinili")
    try:
        api.save_status_page(
            slug,
            title="Vinili & Caffè — Stato servizi",
            description="Stato in tempo reale del sito e dei bot Discord. Se tutto è verde, i servizi funzionano.",
            theme="dark",
            published=True,
            showTags=False,
            domainNameList=["status.viniliecaffe.it"],
            customCSS="",
            footerText="Vinili & Caffè",
            showPoweredBy=False,
            icon="/icon.svg",
            publicGroupList=[
                {
                    "name": "Servizi principali",
                    "weight": 1,
                    "monitorList": [{"id": mid} for mid in public_ids],
                }
            ],
        )
        print("Status page aggiornata (solo servizi principali)")
    except Exception as e:
        print(f"WARN save_status_page: {e}")

    api.disconnect()
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
