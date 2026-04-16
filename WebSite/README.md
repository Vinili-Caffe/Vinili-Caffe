# Sito statico Vinili & Caffè

Vetrina HTML/CSS/JS per la community Discord **Vinili & Caffè**. Testi e link sensibili si centralizzano in `site.config.json`; lo script di build sostituisce i placeholder `{{NOME}}` in `index.html` e genera la cartella **`dist/`** pronta per nginx o Docker.

## Configurazione

1. Copia o modifica `site.config.json`:
   - `siteUrl`: URL pubblico definitivo (meta e link).
   - `discordInviteUrl`: stesso invite del catalogo bot (`https://discord.gg/viniliecaffe`).
   - `useDiscordGuildBanner`: `true` (default) = in build si legge il **banner del server** da Discord (API invite pubblica) e si usa come sfondo della hero. Serve **rete** durante `npm run build`. Se il server non ha banner, resta lo sfondo del CSS (GIF legacy).
   - `useDiscordGuildIcon`: `true` (default) = stessa API; l’**icona della guild** sostituisce l’immagine circolare in “Chi siamo”. Se manca o il fetch fallisce, si usa `images/ocean.png`.
   - `useDiscordGuildFoundedDate`: `true` (default) = alla riga **“Da”** viene messa la **data di creazione stimata** del server, calcolata dallo **snowflake dell’ID guild** (Discord non espone `created_at` sull’invite pubblico). Fuso orario `Europe/Rome`, formato italiano lungo. Se disattivi o manca l’invite, si usa `foundedDisplay` (o `—`).
   - **`discordStaffListBuild`**: se `enabled` è `true`, in build lo script scarica i membri via API bot e compila **Staff e ruoli** con chi ha almeno un ruolo in `staffRoleIds` (Founder, Admin, HighStaff, Coordinator, Mod, Helper, Staff) ed **esclude** chi ha un ruolo in `excludeFromStaffListRoleIds` (default: solo **Partner Manager**). Richiede variabile d’ambiente **`DISCORD_WEBSITE_BUILD_BOT_TOKEN`** (token del **tuo** bot presente nel server) e nel portale Developer attivare l’intent privilegiato **Server Members Intent**. Senza token o in caso di errore resta il testo statico di fallback. `guildId` opzionale se coincide con la guild dell’invite (altrimenti valorizzalo). `maxMembersToScan` limita le pagine da scaricare (default 4000).
   - `discordInviteCode`: opzionale; se vuoto si ricava dall’URL invite (es. `viniliecaffe`).
   - Email: sostituisci i placeholder `@esempio.it`.
   - `statMembers` / `statBoosts` / `statStaff`: numeri opzionali per la sezione statistiche.
   - `instagramUrl`: lascia vuoto `""` per nascondere le icone Instagram.
   - `cookieYesClientId`: solo l’ID CookieYes (cartella in `client_data/...`), oppure `""` per disattivare.
   - `googleAnalyticsMeasurementId`: es. `G-XXXXXXXX` oppure `""`.

2. Logo nella sezione “Chi siamo”: sostituisci il file `images/ocean.png` con il logo della community (stesso nome percorso oppure aggiorna `index.html` e ricostruisci).

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

Dopo `npm run build`, copia l’intera cartella `dist/` nella root del virtual host nginx, es. `/var/www/viniliecaffe/`, con owner leggibile da `www-data`. Esempio blocco server (certificati gestiti a parte):

Vedi `deploy/nginx-site.conf.example`.

## Note

- Non possiamo configurare la VPS al posto tuo: SSH, firewall, certificati Let’s Encrypt e DNS restano sul server.
- Il file `CNAME` (eredità GitHub Pages) non è usato dal build Docker; puoi eliminarlo o ignorarlo.