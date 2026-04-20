# Sito statico Vinili & Caffè

Vetrina HTML/CSS/JS per la community Discord **Vinili & Caffè**. Testi e link sensibili si centralizzano in `site.config.json`; lo script di build sostituisce i placeholder `{{NOME}}` in `index.html` e genera la cartella **`dist/`** pronta per nginx o Docker.

## Configurazione

1. Copia o modifica `site.config.json`:
   - `siteUrl`: URL pubblico definitivo (meta e link).
   - `voteUrl` / `reviewsUrl`: link dei pulsanti in alto a destra (Vota / Recensioni).
   - `discordOauth.clientId` / `discordOauth.redirectUri`: OAuth Discord del pulsante Login (scope `identify`, implicit flow). Nel Developer Portal Discord registra **un solo** URL in Redirects (di solito la home, come `siteUrl`): tutte le pagine usano quella callback; il ritorno a wiki / candidature / unban avviene con il parametro `state` (gestito da `js/discord-auth.js`).
   - `usersLeaderboardApiUrl` / `usersLeaderboardApiUrlLocal`: GET JSON per la pagina `/user` (classifica livelli). In produzione deve rispondere il bot su `GET /webhooks/site-users` (stesso host del sito se nginx fa proxy, altrimenti URL completo verso la `webhookPort` del bot). Locale: tipicamente `http://127.0.0.1:PORTA_BOT/webhooks/site-users`.
   - `discordInviteUrl`: stesso invite del catalogo bot (`https://discord.gg/viniliecaffe`).
   - `useDiscordGuildBanner`: `true` (default) = in build si legge il **banner del server** da Discord (API invite pubblica) e si usa come sfondo della hero. Serve **rete** durante `npm run build`. Se il server non ha banner, resta lo sfondo del CSS (GIF legacy).
   - `useDiscordGuildIcon`: `true` (default) = stessa API; l’**icona della guild** sostituisce l’immagine circolare in “Chi siamo”. Se manca o il fetch fallisce, si usa `images/vc-header-logo.png`.
   - `useDiscordGuildFoundedDate`: `true` (default) = alla riga **“Da”** viene messa la **data di creazione stimata** del server, calcolata dallo **snowflake dell’ID guild** (Discord non espone `created_at` sull’invite pubblico). Fuso orario `Europe/Rome`, formato italiano lungo. Se disattivi o manca l’invite, si usa `foundedDisplay` (o `—`).
   - `useDiscordGuildDescription`: `true` (default) = nel blocco **Descrizione** (Chi siamo) si usa il testo **Descrizione server** della guild restituito dall’API invite pubblica (Impostazioni server → Profilo → Descrizione). Se è vuota o il fetch fallisce: testo in **`aboutDescription`** se compilato, altrimenti il testo di default del template. Con `useDiscordGuildDescription`: `false` si ignorano sempre i dati Discord per quel paragrafo.
   - **`discordStaffListBuild`**: se `enabled` è `true`, in build lo script scarica i membri via API bot e compila **Lo staff** in blocchi **Ruolo: nome \| nome \| …**. Ogni persona compare **una sola volta**, sotto il ruolo staff **con posizione Discord più alta** tra quelli elencati in `staffRoleIds` (i ruoli in `excludeFromStaffListRoleIds` **non contano** per quella scelta: es. chi ha Mod + Partner Manager compare come Mod). **Ogni fascia (Founder, Admin, Mod, Helper, …) deve avere il suo ruolo su Discord e il suo ID in `staffRoleIds`**: se manca, non comparirà una riga per quella fascia e chi ha solo quel ruolo non apparirà. Se su Discord esiste **un solo ruolo** tipo “High Staff” che raggruppa più livelli, in pagina vedrai **una sola riga** con quel nome: per avere Founder / Admin separati servono **ruoli distinti** sul server (o etichette diverse con `staffRoleLabels` sullo stesso ID, ma resta un’unica coda nomi). `DISCORD_WEBSITE_BUILD_BOT_TOKEN=... npm run list-guild-roles` elenca tutti gli ID: aggiungi a `staffRoleIds` ogni ruolo staff da mostrare. Opzionale **`staffRoleDisplayOrder`**: array di **ID ruolo Discord dall’alto verso il basso** (es. Founder, Admin, High Staff, Mod, Helper). Se lo imposti, **ogni membro viene messo nella prima fascia dell’elenco che possiede** (così Founder non resta vuoto se su Discord «High Staff» ha posizione più alta). Se lo lasci vuoto, la fascia è quella con **posizione Discord più alta** tra i suoi ruoli in `staffRoleIds`. Gli ID in elenco che non sono in `staffRoleIds` vengono ignorati; chi non matcha nessuna voce dell’ordine usa comunque il criterio per posizione. Con **`staffListShowEachRole`: `true`** ogni membro compare **sotto ogni ruolo staff** che ha (es. Mod e Helper → due righe con lo stesso nome); il conteggio `staffNoPm` resta **persone uniche**. Utile se molti ruoli “alti” nascondevano chi aveva anche fasce più basse. Con `false` (default se omesso) resta **una sola riga per persona** (la fascia scelta con `staffRoleDisplayOrder` o per posizione). Opzionale **`staffRoleLabels`**: `{ "id": "Etichetta" }`. `maxMembersToScan` (default build **10000** se omesso in config) limita il massimo membri scaricati; in build compare un avviso se si raggiunge il tetto. Intent **Server Members** obbligatorio.
   - `discordInviteCode`: opzionale; se vuoto si ricava dall’URL invite (es. `viniliecaffe`).
   - Email: sostituisci i placeholder `@esempio.it`.
   - `statMembers` / `statBoosts` / `statStaff`: numeri opzionali per la sezione statistiche.
   - `instagramUrl`: lascia vuoto `""` per nascondere le icone Instagram.
   - `cookieYesClientId`: solo l’ID CookieYes (cartella in `client_data/...`), oppure `""` per disattivare.
   - `googleAnalyticsMeasurementId`: es. `G-XXXXXXXX` oppure `""`.

2. Logo nella sezione “Chi siamo”: sostituisci il file `images/vc-header-logo.png` con il logo della community (stesso nome percorso oppure aggiorna `index.html` e ricostruisci).

## Build in locale

```bash
cd WebSite
npm run build
```

Apri `dist/index.html` via server statico (es. `npx --yes serve dist`) per verificare.

## Deploy su VPS (Docker)

Sulla VPS: Docker e Docker Compose plugin installati; DNS del dominio puntato all’IP della VPS (o reverse proxy).

```bash
cd WebSite
# modifica site.config.json sulla macchina di build (o sulla VPS)
npm run build
docker compose up -d --build
```

Il sito è in ascolto sulla porta **8080** dell’host (`docker-compose.yml`). Davanti metti **Caddy** o **nginx** con TLS che fa proxy a `127.0.0.1:8080`.

## Deploy senza Docker (solo file)

Dopo `npm run build`, copia l’intera cartella `dist/` nella root del virtual host nginx, es. `/var/www/viniliecaffe/`, con owner leggibile da `www-data`. Lo script **`scripts/deploy-site.ps1`** (o `WebSite/deploy-site.ps1`) crea un **unico `.tar.gz`** da `dist/` e lo estrae sul server (molto più veloce di centinaia di `scp` separati; fallback a `scp -r` con **`-SlowScpRecursive`** o se manca `tar`). Con **`-SkipBuild`** riusa `dist/` senza rilanciare `npm run build`. Dopo l’upload esegue via **SSH** `chown`/`chmod` sulla docroot (403 se nginx non legge i file). Esempio blocco server (certificati gestiti a parte):

Vedi `deploy/nginx-site.conf.example`. Se vedi **403** solo su path tipo `/regole` o `/wiki`, aggiorna `try_files` sul server come nell’esempio (**senza** `$uri/` tra le prove: con cartella vuota o senza `index.html` nginx risponde 403) e verifica in docroot **`regole/index.html`** (rifai `npm run build` e deploy completo di `dist/`). Ricorda anche **permessi** `www-data` sulla sottocartella.

## Statistiche live nel browser

Il JS in pagina fa polling di:

1. **Membri e boost** — API invite `with_counts` (stessi numeri che vedi nel client Discord in modo approssimato).
2. **Staff (no PM)** — file JSON **`live-stats-extra.json`** nella root del sito (stesso path configurato in `site.config.json` → `liveStats.extraStatsPath`, default `/live-stats-extra.json`).

### Perché serve nginx per `/discord-invite.json`

Dal browser una `fetch` verso `https://discord.com/...` è spesso bloccata da **CORS**. Sul server nginx aggiungi un endpoint **sullo stesso dominio** che fa proxy verso Discord. Esempio in `deploy/nginx-site.conf.example`:

- Nel blocco `location = /discord-invite.json` l’URL in **`proxy_pass`** deve usare lo **stesso codice invite** che hai in `site.config.json` (es. `https://discord.gg/viniliecaffe` → segmento `viniliecaffe` nel path API: `/api/v10/invites/viniliecaffe?with_counts=true`).
- Dopo aver modificato la config nginx: `sudo nginx -t` e `sudo systemctl reload nginx` (o equivalente).

### Staff aggiornato senza ridistribuire tutto il sito

La build completa (`npm run build`) scrive anche `dist/live-stats-extra.json` se il conteggio staff è disponibile. Per aggiornare **solo quel file** nella directory pubblicata (es. `/var/www/viniliecaffe/`):

```bash
cd /percorso/repo/WebSite
export DISCORD_WEBSITE_BUILD_BOT_TOKEN="il_token_del_bot"
# opzionale: dove scrivere (default: ./dist/live-stats-extra.json)
export VC_LIVE_STATS_JSON_OUT="/var/www/viniliecaffe/live-stats-extra.json"
npm run refresh-live-stats-extra
```

Esempio **cron** (ogni 15 minuti, utente dedicato, log minimi):

```cron
*/15 * * * * cd /percorso/repo/WebSite && . /percorso/repo/.env.cron 2>/dev/null; export VC_LIVE_STATS_JSON_OUT=/var/www/viniliecaffe/live-stats-extra.json; /usr/bin/npm run refresh-live-stats-extra >> /var/log/vc-live-stats-extra.log 2>&1
```

Crea un file leggibile dalla cron (es. `.env.cron`) con **solo** `export DISCORD_WEBSITE_BUILD_BOT_TOKEN=...` e `chmod 600` sul file. In alternativa imposta la variabile nel crontab stesso (meno ideale per la sicurezza).

## Note

- Non possiamo configurare la VPS al posto tuo: SSH, firewall, certificati Let’s Encrypt e DNS restano sul server.
- Il file `CNAME` (eredità GitHub Pages) non è usato dal build Docker; puoi eliminarlo o ignorarlo.