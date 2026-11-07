# Seconda VPS — playbook

Prerequisiti: nuova VPS Ubuntu, SSH root, stesso repo in `/opt/bot`, Mongo raggiungibile (replica set o tunnel), DNS/Cloudflare pronti.

## 1. Bootstrap

```bash
# sulla 2ª VPS
mkdir -p /opt/bot
# rsync o git clone del repo (+ .env senza avviare i bot)
cd /opt/bot
npm ci --omit=dev
```

In `.env` sulla standby:

```bash
HOST_ROLE=standby
# token Discord uguali OK, ma NON avviare `bots` finché primary è online
```

## 2. Cosa avviare subito sullo standby

Consigliato subito:

- `host-watchdog` (solo health locale)
- Mongo secondary (se fai replica set)
- opzionale: `site-api` dietro Cloudflare Load Balancing / origin pool

Da tenere **spento** finché primary è sano:

```bash
pm2 start ecosystem.config.cjs --only lavalink,site-api,host-watchdog
# NON: pm2 start ... --only bots
pm2 save
```

## 3. Failover bot (manual / semi-auto)

Sulla **primary** (se ancora raggiungibile):

```bash
pm2 stop bots
```

Sulla **standby**:

```bash
pm2 start ecosystem.config.cjs --only bots
# oppure: pm2 restart bots --update-env
pm2 save
```

Verifica:

```bash
curl -sS http://127.0.0.1:3000/webhooks/health
curl -sS http://127.0.0.1:3011/health   # Coffee
```

## 4. Failback

1. Ripristina primary.
2. `pm2 stop bots` sullo standby.
3. `pm2 start/restart bots` sulla primary.
4. Controlla che non ci siano due sessioni gateway (log Discord / `pm2 logs bots`).

## 5. Cloudflare (API/web)

Per `www` / webhooks HTTP (non per il gateway Discord):

- Pool con primary + standby health check su `/webhooks/site-api/health`
- Origin che fallisce esce dal pool

I bot Discord restano **un host attivo**.

## 6. Checklist RAM

Una seconda VPS da **almeno 4 GB** (meglio 8 GB se vuoi Lavalink + bot standby pronti).  
Non clonare tutti i worker PM2 su entrambe senza un lease/lock condiviso.
