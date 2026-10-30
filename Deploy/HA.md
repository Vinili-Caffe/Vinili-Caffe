# High Availability (Vinili & Caffè)

## Realtà attuale

Hai **1 sola VPS** (`discord.viniliecaffe.gg`, ~4 GB RAM).  
Se cade quella macchina, cade tutto. Il multi-host vero richiede una **seconda VPS**.

Quello che è attivo ora:

| Layer | Comportamento |
|--------|----------------|
| PM2 | Restart automatico + backoff su tutti i processi (`ecosystem.config.cjs`) |
| `host-watchdog` | Ogni 30s pinga health HTTP/TCP; se resta giù → `pm2 restart` (cooldown 3 min) |
| Bot Discord | **1 solo attivo** (token unico) — mai due gateway con lo stesso token |
| Site API / vote intake | Restart locali; su 2ª VPS possono essere replicati dietro LB |
| Uptime Kuma | Monitor esterno già documentato in `deploy/UPTIME-KUMA.md` |

## Ruoli host

In `.env`:

```bash
HOST_ROLE=primary   # questa VPS
# HOST_ROLE=standby # solo sulla 2ª VPS (bot spenti, API/web opzionali)
```

## Cosa NON fare

- Non avviare `bots` su due macchine contemporaneamente con lo stesso token.
- Non mettere `site-api` in cluster PM2 su questa VPS (RAM insufficiente).
- Non duplicare `vote-drain` / `bot-scheduler` / `auto-backup` su due host senza lock (lavori doppi).

## Quando aggiungi la 2ª VPS

Vedi `deploy/ha/SECOND-HOST.md`.

Schema target:

```text
                    Cloudflare / DNS failover
                              |
              +---------------+---------------+
              |                               |
         VPS primary                     VPS standby
     bots (active)                    bots (stopped / ready)
     site-api                         site-api (optional hot)
     workers                          workers OFF o con lease
     lavalink                         lavalink (optional)
     mongo primary                    mongo secondary (replica set)
     host-watchdog                    host-watchdog
```

Failover bot: stoppare primary → avviare `bots` sullo standby (manuale o script).  
Non c’è “active-active” Discord senza sharding multi-process dedicato.
