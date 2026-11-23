# Rich Presence: PreMiD e Attività di Discord

Il sito scrive «cosa stai facendo» in `<html data-vc-presence="…">` (vedi `WebSite/src/lib/presenceState.ts`).
Per ora lo fa il Music Quiz: quiz, domanda, punti, modalità in diretta. Le altre pagine usano il loro nome.

## 1. PreMiD (stato su Discord mentre navighi il sito)

File: `premid/websites/V/Vinili & Caffè/` (`metadata.json`, `presence.ts`, `tsconfig.json`), già nel formato del repository di PreMiD.

Provarla:
1. Installa l'estensione PreMiD e l'app per il computer (premid.app).
2. Clona `https://github.com/PreMiD/Activities`, `npm install`, copia la cartella `websites/V/Vinili & Caffè`.
3. `npx pmd dev "Vinili & Caffè"`, attiva «Activity Developer Mode» nell'estensione e apri il sito.

Pubblicarla: pull request su `PreMiD/Activities` con la cartella. Il nome mostrato su Discord («Sta giocando a …»)
è quello dell'applicazione Discord `1329118940110127204`. Se vuoi un nome diverso crea un'applicazione apposta
e cambia `clientId` in `presence.ts`.

## 2. Attività di Discord (Music Quiz dentro Discord)

Il sito capisce da solo quando è aperto dentro Discord (`*.discordsays.com`): fa il login con Discord,
parte dal Music Quiz e aggiorna «Sta giocando a …» con quiz, domanda e punti.

Da fare una volta nel Developer Portal, applicazione `1329118940110127204`:

1. **Activities → Settings**: attiva le Attività.
2. **Activities → URL Mappings**:
   | Prefisso | Destinazione |
   |---|---|
   | `/` (root) | `www.viniliecaffe.it` |
   | `/dzpreview` | `cdnt-preview.dzcdn.net` |
   | `/dzimg` | `cdn-images.dzcdn.net` |
   | `/dzimg2` | `e-cdns-images.dzcdn.net` |
   | `/discordcdn` | `cdn.discordapp.com` |
   | `/vcapi` | `api.viniliecaffe.it` |
   | `/vccdn` | `cdn.viniliecaffe.it` |
3. **OAuth2 → Redirects**: aggiungi `https://127.0.0.1` (richiesto dall'SDK, non viene usato).
4. **Installation**: l'app deve essere nel server; l'Attività si avvia dal pulsante 🚀 in un canale vocale.

I prefissi devono restare uguali a `ACTIVITY_URL_MAPPINGS` in `WebSite/src/lib/discordActivity.ts`.
