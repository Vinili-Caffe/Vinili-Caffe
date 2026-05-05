# Lavalink — **YouTube** + **Spotify (LavaSrc)** + stream HTTP (radio)

## Deploy da repo (`scripts/deploy-all.ps1`)

Il backend include questa cartella; sul server lo script remoto: crea `Lavalink/plugins/`, **scarica `Lavalink.jar` 4.2.2** se manca, `chmod +x` su `start-lavalink.sh` (per avvio manuale), poi PM2 fa `reload` di `ecosystem.config.cjs`. **Lavalink in PM2** = sempre **`java -jar`** con `cwd` su questa cartella e `--spring.config.additional-location=optional:file:./` (non `bash` + script: dopo un reload PM2 può passare gli argomenti JVM a bash → `bash: -X: invalid option`). Opzionale: **`Lavalink/.env.lavalink`** sul server (o in locale e deploy) — `ecosystem.config.cjs` legge le coppie `KEY=val` e le mette in `env` del processo Lavalink.

- Plugin **youtube-plugin** (in `application.yml`: tienilo **aggiornato**). Se in log vedi `SignatureCipherManager` / `No match found` in playback, YouTube ha cambiato script → alza la versione del plugin (ultima: [youtube-source releases](https://github.com/lavalink-devs/youtube-source/releases)).
- Plugin **lavasrc** ([LavaSrc](https://github.com/topi314/LavaSrc)): abilita sorgente Spotify. In cima a `application.yml`, sotto `plugins.lavasrc.spotify`, inserisci **clientId** e **clientSecret** dalla [dashboard Spotify Developer](https://developer.spotify.com/dashboard) (Redirect URI non serve per questo uso). Spotify non viene streamato da Spotify: LavaSrc risolve i brani e li fa riprodurre tramite i **provider** (qui `ytsearch`), quindi serve YouTube-plugin funzionante.
- **Radio**: URL diretti risolti dal bot poi load su Lavalink.
- Password: `youshallnotpass` — `LAVALINK_PASSWORD` nel `.env` del bot (e stessa password in `application.yml` se la cambi).
- Dopo ogni cambio a `application.yml`: **riavvia Lavalink** (PM2 scarica il nuovo jar al boot). Con **youtube-plugin** serve la sezione `plugins.youtube` (`allowSearch: true` e `clients`, vedi `application.yml`) altrimenti `ytsearch:` / `ytmsearch:` possono restare vuoti mentre i link diretti funzionano.
- Nei log, su `open.spotify.com/playlist/...` (o album/track), **`Unknown file format`** con stack su **`HttpAudioSourceManager`**: Lavalink sta trattando l’URL come **HTTP** (pagina HTML), quindi **LavaSrc non sta gestendo Spotify** (plugin assente/non caricato, **application.yml** non letto, o **clientId**/**clientSecret** errati). Controlla avvio Lavalink per errori plugin, allinea `plugins.lavasrc.spotify`, riavvia.
- **PM2 / avvio:** la cartella di lavoro deve essere quella che contiene **`application.yml`** e **`Lavalink.jar`**, oppure usa **`Lavalink/start-lavalink.sh`**: passa `--spring.config.additional-location` così la config viene letta anche se il `cwd` di PM2 è altrove (senza questo, Lavalink parte con default → nessun LavaSrc → stesso errore). Opzionale: variabili in **`Lavalink/.env.lavalink`** (non in git); lo script le carica se il file esiste.
- **Verifica plugin:** nei primi secondi di log cerca caricamento plugin / eventuali errori Maven; con `logging.level.lavalink: INFO` (già in `application.yml`) è più facile vedere problemi rispetto a `root: ERROR` da solo.
- **Lag / scatti audio:** `bufferDurationMs` e `frameBufferDurationMs` più alti = più tolleranza a CPU/rete; VPS piccola: evita altri carichi pesanti mentre suona; nel `.env` del bot `MUSIC_LOGS=0` per non loggare ogni evento; almeno **2 vCPU** e **1 GB** riservati a Lavalink se puoi.

## Bot (Vinyls)

Variabili utili nel `.env` del processo Node:

- `LAVALINK_HOST` — default `127.0.0.1:2333`
- `LAVALINK_PASSWORD` — allineata a `lavalink.server.password`
- `LAVALINK_NODE_NAME` — default `main` (nome nodo in Shoukaku)
- `MUSIC_ENABLED` — `0` per non inizializzare Shoukaku
- `MUSIC_DEFAULT_VOLUME` — 0–1000 come in [Lavalink REST](https://lavalink.dev/api/rest.html) (**100 = 100%**; default bot **50** = 50%; valori molto alti amplificano oltre il livello «normale»)
- `MUSIC_SEARCH_PREFIX` — prefisso ricerca Lavalink per titoli senza URL (default `ytsearch:`)
- `MUSIC_SPOTIFY_URL_LOOKUP` — `1` (default) per tentare `spsearch:` e costruire il link Spotify nell’embed `+play`; `0` per usare solo URI/ISRC già sulla traccia
- `MUSIC_INACTIVITY_IDLE_MS` — dopo quanti ms di **nessun brano in riproduzione** (o pausa) **oppure canale senza umani** il bot lascia il vocale e invia l’embed di inattività (default `180000` = 3 minuti; minimo 60s)
- `+play` accetta link **Spotify** (`/track/`, `/album/`, `/playlist/`), non **show** / **episode** (podcast).
- `MUSIC_LOGS` — `1` per log di debug musica