# Setup rapido proxy DISBOARD (Windows)

## 1) Avvia proxy locale

Da PowerShell, nella root del progetto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-disboard-proxy-local.ps1
```

Test locale:

```powershell
curl http://127.0.0.1:8787/health
```

## 2) Esponi endpoint verso il server bot (Cloudflare Tunnel)

Installa `cloudflared` sul tuo PC e avvia:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

Ti darà un URL tipo `https://xxxx.trycloudflare.com`.

## 3) Configura il bot server

In `Vinyls/config.json`:

- `disboardReviews.enabled`: `true`
- `disboardReviews.fetchEndpoint`: `https://xxxx.trycloudflare.com/disboard/reviews`
- `disboardReviews.fetchEndpointSecret`: stesso valore di `DISBOARD_PROXY_API_KEY` nel tuo `.env`

Riavvia il bot.

## 4) Test endpoint remoto

Dal server bot:

```bash
curl -sS -H "x-api-key: <API_KEY>" "https://xxxx.trycloudflare.com/disboard/reviews" | head -c 200
```

Se vedi `"ok":true`, è operativo.