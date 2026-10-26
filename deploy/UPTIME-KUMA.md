# Status page / monitoraggio (Uptime Kuma)

## Cosa include
- **Uptime Kuma** su Docker (`--network host`, porta `3001`)
- Nginx + HTTPS su **https://status.viniliecaffe.it**
- Status pubblica: **https://status.viniliecaffe.it/status/vinili**
- Pagina leggera sul sito: **https://www.viniliecaffe.it/stato/**
- Endpoint stack: `GET /webhooks/health` → `{ ok, checks: { bot, mongo, lavalink } }`

## Setup sul VPS
```bash
cd /opt/bot   # o dove hai clonato/copiato deploy/
bash deploy/setup-uptime-kuma.sh
pip3 install --break-system-packages uptime-kuma-api
python3 deploy/configure-uptime-kuma.py
```

Credenziali admin: `/root/.uptime-kuma-admin` (chmod 600).

## Cloudflare DNS (obbligatorio per status.*)
`status.viniliecaffe.it` **non esiste ancora** in DNS pubblico. Crea in Cloudflare:

| Tipo | Nome | Contenuto | Proxy |
|------|------|-----------|-------|
| CNAME | `status` | `viniliecaffe.it` | Proxied (arancione) |

Poi **SSL/TLS → Overview → Full** (il VPS ha già un certificato origin self-signed).

Opzionale dopo DNS attivo (certificato Let's Encrypt vero):
```bash
# temporaneamente SSL mode Flexible, poi:
certbot --nginx -d status.viniliecaffe.it --non-interactive --agree-tos --register-unsafely-without-email --redirect
# poi rimetti SSL Full / Full Strict
```

Admin e password: `/root/.uptime-kuma-admin`

## Monitor configurati
| Nome | Check |
|------|--------|
| Sito web | HTTPS origin `127.0.0.1` + Host header |
| Bot Discord | `http://127.0.0.1:3000/webhooks/status` |
| Stack health | `http://127.0.0.1:3000/webhooks/health` |
| Site API | `http://127.0.0.1:3020/webhooks/site-api/health` |
| Discadia | `http://127.0.0.1:3010/webhooks/discadia/health` |
| MongoDB | TCP `127.0.0.1:27017` |
| Lavalink | TCP `127.0.0.1:2333` |

I probe usano localhost per evitare i 403 di Cloudflare verso il datacenter.
