# Plugin evento Halloween (archivio)

Pack completo sotto `archivio/halloween/src/Vinili/`.

## Stato live (post 2026)

**Non caricato a boot.** Il core Vinili non registra più `EventPlugins/halloween` e non `require` il pack.

In live resta solo:
- `Utils/Minigames/halloweenMinigameHooks.ts` — stub locale (gate/tema off, bank vuote)
- `profile.events.halloween` come **Mixed** (candy wallet storico in Mongo, **nessuna cancellazione DB**)
- rami restore/handler per tipi `halloween*` già persistiti (chiudono / rispondono “terminato”)
- contest `sfondi-halloween` → vedi `archivio/contest-sfondi/` (EVENTS live vuoto)

Config live: **tolta**. Snapshot in `Config/config.halloween.json` (runtime/event/emojiHunt + pezzi minigames).

## Contenuto archivio

- candy / emoji hunt / react leaderboard
- minigiochi Halloween + Trick or Treat + showcase
- banks, catalog, event config, UI
- `EventPlugins/halloween/register` + `runtimeKillSwitch`

## Riattivazione futura (solo se serve di nuovo)

1. Ripristinare shim da questo pack verso `Bots/src/Vinili` (plugin, hunt service, games, ToT, hooks reali).
2. Riagganciare `registerEventPlugins`, `messageReactionAdd`, starter in `minigameService`.
3. Riabilitare date/flag in `config.json`.
4. Se serve di nuovo lo schema candy tipizzato, ripristinare i path sotto `profile.events.halloween` (oggi Mixed).

Non dare per scontato un Halloween annuale: il 2027 può restare archiviato.
