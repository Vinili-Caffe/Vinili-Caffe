# bots-ts — sorgente unica dei bot

Qui si **scrivono** Vinyls, Coffee e `shared` (TypeScript).  
`Vinyls/`, `Coffee/`, `shared/`, `loader.js` e `wait-for-lavalink.js` in **radice repo** sono solo il **runtime** generato (come su `/opt/bot`).

## Comandi

```bash
cd bots-ts
npm run build          # src → dist/
npm run promote        # dist → root (Vinyls/, Coffee/, …)
# oppure dalla root del repo:
npm run build:bots
```

Poi avvio come sempre: `npm start` / PM2 su `wait-for-lavalink.js`.

## Posso cancellare Vinyls/, Coffee/, shared/ dalla root?

**Sì, come sorgente.** Dopo il cutover:

1. `npm run build:bots` (ricrea le cartelle root dal TS)
2. Verifica locale che i bot partano
3. Togli dal tracking git (le cartelle restano generabili):

```bash
git rm -r --cached Vinyls Coffee shared loader.js wait-for-lavalink.js
```

4. In `.gitignore` decommenta il blocco `BOTS RUNTIME GENERATO` (vedi `.gitignore` in root)
5. Commit: da quel momento si versiona solo `bots-ts/src/`
6. In locale puoi cancellare le cartelle; prima di start/deploy: `npm run build:bots`
7. Sulla VPS continua a vivere `/opt/bot/Vinyls|Coffee|shared` — aggiornali con `bots-ts/tools/pubblica.sh` (o sync di `dist/`)

**Non cancellare** `bots-ts/src/` né i `node_modules` sotto Vinyls/Coffee finché non hai rifatto `npm run install:bots` dopo un promote.

## Note

- Fix intenzionali TS ≠ vecchio JS: `tools/differenze-volute.json`
- `npm run verify`: se non ci sono più originali JS in git, passa in **source-only** (controlla solo che `dist/` sia completo)
