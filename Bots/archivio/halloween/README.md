# Plugin evento Halloween

Pack gestito come Hogwarts: **kill-switch + register lazy**.

- Contratto live: `Bots/src/Vinili/EventPlugins/halloween/`
- Config: `halloweenRuntime.disabled` (false = on) + `halloweenEvent`
- Core entry: `EventPlugins/registerEventPlugins.ts` (chiamato da `ready`)

Moduli feature (oggi ancora sotto `src/Vinili`, registrati solo se plugin on):

- `Services/Community/halloween*`
- `Utils/Eventi/halloween*`
- `Utils/Minigames/halloween*`
- `Services/Minigames/minigameHalloween*`
- `Data/Minigames/halloweenMinigameBanks.ts`

A fine stagione: `halloweenRuntime.disabled = true` (come `hogwartsRuntime`). Opzionale: spostare i moduli qui sotto `archivio/halloween/src/Vinili/` lasciando shim, come Hogwarts.
