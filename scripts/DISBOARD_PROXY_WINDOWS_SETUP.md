# DISBOARD recensioni — setup pratico (Windows + bot su server)

## Cosa devi rifare e cosa no

| Cosa | Quanto spesso |
|------|----------------|
| Avviare PC + script (o avvio automatico) | Ogni volta che spegni il PC (se il tunnel gira solo lì) |
| Cambiare URL in `config.json` | **Mai**, se usi un **tunnel nominato** (URL fisso) |
| Aggiornare cookie DISBOARD | Solo quando smette di funzionare (scadenza Cloudflare), non ogni giorno |

**Quick tunnel** (`trycloudflare.com`): URL **nuovo a ogni avvio** → scomodo.  
**Tunnel nominato** (account Cloudflare gratuito): **stesso URL per sempre** → consigliato.

---

## Modo più semplice: un solo comando (proxy + tunnel)

Dalla root del progetto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-disboard-reviews-stack.ps1
```

- Avvia il proxy su `127.0.0.1:8787` e subito dopo `cloudflared`.
- Chiudi con `Ctrl+C` (ferma anche il proxy).

Opzionale nel `.env`:

```env
CLOUDFLARED_EXE=C:\Tools\cloudflared\cloudflared.exe
```

---

## Tunnel stabile (consigliato, una tantum)

1. Account Cloudflare gratuito.
2. Installa `cloudflared`, poi: `cloudflared tunnel login`
3. Crea un tunnel: `cloudflared tunnel create disboard-reviews`
4. Configura `config.yml` in `%USERPROFILE%\.cloudflared\` con ingress verso `http://127.0.0.1:8787` e assegna un hostname (es. `disboard-proxy.tuodominio.it` o sottodominio su dominio già su Cloudflare).
5. Nel `.env` del progetto aggiungi:

```env
CLOUDFLARED_NAMED_TUNNEL=disboard-reviews
```

6. Avvia lo stack (stesso script di sopra): userà `cloudflared tunnel run disboard-reviews`.
7. In `Vinyls/config.json` metti **una volta**:

`disboardReviews.fetchEndpoint`: `https://TUO_HOSTNAME_FISSO/disboard/reviews`

Guida ufficiale: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

## Cookie DISBOARD (solo quando serve)

Sul **PC dove gira il proxy**, apri la pagina recensioni, supera “Just a moment…”, DevTools → Application → Cookies → `disboard.org`.

- `DISBOARD_CF_COOKIE=cf_clearance=...` nel `.env`, oppure
- `DISBOARD_COOKIE_HEADER=cf_clearance=...; __cf_bm=...` (più completo)

Riavvia lo stack.

---

## Avvio automatico all’accesso Windows

1. `Win+R` → `taskschd.msc` → Crea attività di base.
2. Trigger: all’accesso utente.
3. Azione: avvia programma  
   `powershell.exe`  
   Argomenti: `-ExecutionPolicy Bypass -WindowStyle Minimized -File "C:\percorso\DiscordBot-1\scripts\start-disboard-reviews-stack.ps1"`

---

## Se aggiorni il cookie ma continua a dare errore

1. **Riavvia** `start-disboard-reviews-stack.ps1` (o il proxy): il `.env` viene letto solo all’avvio.
2. **Un solo `.env`**: modifica quello nella **root del progetto** (stesso usato dallo script), non sul server.
3. **Non usare due righe insieme male**: se imposti `DISBOARD_COOKIE_HEADER`, ha priorità su `DISBOARD_CF_COOKIE` — controlla che sia completa.
4. Aggiungi anche **`__cf_bm`** nella stessa stringa cookie (DevTools → copia tutti i cookie rilevanti).
5. Il proxy ora prova anche **`curl.exe`** se il `fetch` di Node riceve ancora la challenge (Cloudflare spesso differenzia i due). Riavvia il proxy dopo il pull.

6. Debug (senza esporre segreti): nel `.env` metti `DISBOARD_PROXY_DEBUG=1`, riavvia proxy, poi:
   ```powershell
   curl -H "x-api-key: <API_KEY>" http://127.0.0.1:8787/debug/disboard
   ```
   Deve risultare `cookieChars` > 0 e `hasCfClearance: true`.

## Test

Locale:

```powershell
curl.exe http://127.0.0.1:8787/health
```

Su PowerShell **non** usare `curl` senza `.exe`: è alias di `Invoke-WebRequest` e `-H` non va. Usa sempre `curl.exe` oppure:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787/disboard/reviews" -Headers @{ "x-api-key" = "LA_TUA_CHIAVE" }
```

Dal server (con API key):

```bash
curl -sS -H "x-api-key: <API_KEY>" "https://TUO_HOST/disboard/reviews" | head -c 200
```

`"ok":true` = operativo.