# Host housekeeper

Processo PM2 `host-housekeeper` (`deploy/ha/hostHousekeeperApp.js`).

## Cosa fa

1. **Cleanup continuo** (ogni 30 min + al boot)
   - `/tmp/vc_*` deploy vecchi (tiene `vc_pw_venv`)
   - screenshot probe `/tmp/vc_*.png`
   - journald vacuum, apt clean
   - trim log PM2 > 40MB
   - `docker container/image prune` (solo exited/dangling, **niente** volume)
   - cache chrome/pip/npm vecchie
   - report processi zombie

2. **Saturazione** (ogni 60s)
   - CPU: load1 / ncpu ≥ 2.5 e load5 alto
   - RAM: MemAvailable ≤ 8% o swap ≥ 92%
   - Disk `/` ≥ 92% (warn cleanup da 85%)
   - Soft: cleanup + drop page cache + `pm2 restart` bots/site-api/lavalink
   - Se dopo 5 tick critici e soft non basta → **reboot** (cooldown 6h)

## Env utili

| Var | Default | Note |
|-----|---------|------|
| `HOST_HOUSEKEEPER_ALLOW_REBOOT` | `1` | `0` = solo soft, mai reboot |
| `HOST_HOUSEKEEPER_DISK_PCT` | `92` | soglia reboot disk |
| `HOST_HOUSEKEEPER_MEM_PCT` | `8` | MemAvailable % critica |
| `HOST_HOUSEKEEPER_REBOOT_COOLDOWN_MS` | `21600000` | 6h |

Log: `/var/log/vc-housekeeper.log`  
State: `/var/lib/vc-housekeeper/`

Affianca `host-watchdog` (health HTTP/TCP servizi), non lo sostituisce.
