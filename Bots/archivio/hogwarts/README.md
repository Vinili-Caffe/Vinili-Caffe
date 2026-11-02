# Plugin evento Hogwarts (archivio)

Pack completo sotto `archivio/hogwarts/src/Vinili/`.

## Stato live

**Non caricato a boot.** Come Halloween: nessun `EventPlugins/hogwarts` in live, `registerEventPlugins` lo marca `archived/skipped`.

In live resta (dati / GDPR / residui API):
- schema Mongo `profile.events.hogwarts` + docType Hogwarts in `communitySchemas` (**DB non cancellato**)
- webhook `/webhooks/site-hogwarts-sorting` → sempre **410**
- ID canali/ruoli in `ids.ts`, filtri ruoli commemorativi, export/erase GDPR log locali
- pezzi site.config in `Config/site.config.hogwarts.json`

Config live: **tolta**. Snapshot in `Config/config.hogwarts.json` (+ galeoni, premiLaReact, spell hunt, finale, potions, mirror staff, pezzi minigames).

## Contenuto archivio

- sorting / case / galeoni / shop / duel / forbidden books / spell hunt / finale
- minigiochi casa + burrobirra
- API sorting, calendari, kill-switch
- `EventPlugins/hogwarts/register` (spostato qui dal live)

## Riattivazione futura (solo se serve di nuovo)

1. Ripristinare shim/plugin da questo pack verso `Bots/src/Vinili`.
2. Riagganciare `registerEventPlugins` + route sorting (togli il 410).
3. Riabilitare flag/date in `config.json` + merge `Config/site.config.hogwarts.json`.

Non dare per scontato un Hogwarts annuale: può restare archiviato.
