# bots-ts

Rewrite TypeScript isolato dei bot Vinili & Caffè. **Non** sostituisce `Vinyls/` / `Coffee/` finché non c’è cutover esplicito.

## Setup

```bash
cd bots-ts
npm install
npm run typecheck
npm run build
npm run dev:vinyls   # o dev:coffee
```

Senza `DISCORD_TOKEN` i moduli bootano e escono (CI/local ok).

## Domini (Keep scaffold)

Solo **prefix che esistono già nel live** (+ store/API interni). Niente comandi inventati.

| Modulo | Prefix live portati / note |
|--------|------|
| Utility | ping, help, afk, snipe, avatar, banner |
| Moderation | kick/ban/mute/warn/case/modlogs/… |
| Music | play/skip/stop/now/queue/lyrics |
| Activity | rank, mstats (+ EXP/voice store) |
| Economy | bal, daily, weekly, monthly, work, shop, coinflip |
| Staff / tickets | store + `/api/ts/*` (no Discord UI Kill) |
| Coffee | music + Markov collector + TTS shell |
| Event plugins | `VC_PLUGINS` archivio, **senza** prefix nuovi |

Inventario: [`docs/bot-ts-inventory.md`](../docs/bot-ts-inventory.md)

## Env

Vedi `.env.example`. Scrive Mongo solo con `VC_TS_MONGO=1` su collezioni `bots_ts_*`.
