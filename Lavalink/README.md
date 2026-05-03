# Lavalink — **YouTube** + **Spotify (LavaSrc)** + stream HTTP (radio)

- Plugin **youtube-plugin** (in `application.yml`: tienilo **aggiornato**). Se in log vedi `SignatureCipherManager` / `No match found` in playback, YouTube ha cambiato script → alza la versione del plugin (ultima: [youtube-source releases](https://github.com/lavalink-devs/youtube-source/releases)).
- Plugin **lavasrc** ([LavaSrc](https://github.com/topi314/LavaSrc)): abilita sorgente Spotify. In cima a `application.yml`, sotto `plugins.lavasrc.spotify`, inserisci **clientId** e **clientSecret** dalla [dashboard Spotify Developer](https://developer.spotify.com/dashboard) (Redirect URI non serve per questo uso). Spotify non viene streamato da Spotify: LavaSrc risolve i brani e li fa riprodurre tramite i **provider** (qui `ytsearch`), quindi serve YouTube-plugin funzionante.
- **Radio**: URL diretti risolti dal bot poi load su Lavalink.
- Password: `youshallnotpass` — `LAVALINK_PASSWORD` nel `.env` del bot (e stessa password in `application.yml` se la cambi).
- Dopo ogni cambio a `application.yml`: **riavvia Lavalink** (PM2 scarica il nuovo jar al boot).
- **Lag / scatti audio:** `bufferDurationMs` e `frameBufferDurationMs` più alti = più tolleranza a CPU/rete; VPS piccola: evita altri carichi pesanti mentre suona; nel `.env` del bot `MUSIC_LOGS=0` per non loggare ogni evento; almeno **2 vCPU** e **1 GB** riservati a Lavalink se puoi.

## Bot (Vinyls)

Variabili utili nel `.env` del processo Node:

- `LAVALINK_HOST` — default `127.0.0.1:2333`
- `LAVALINK_PASSWORD` — allineata a `lavalink.server.password`
- `LAVALINK_NODE_NAME` — default `main` (nome nodo in Shoukaku)
- `MUSIC_ENABLED` — `0` per non inizializzare Shoukaku
- `MUSIC_DEFAULT_VOLUME` — 0–1000 come in Lavalink/Shoukaku (default 1000 = volume pieno)
- `MUSIC_LOGS` — `1` per log di debug musica