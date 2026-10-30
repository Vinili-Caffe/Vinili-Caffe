# Plugin evento Star Wars

Pack gestito come Hogwarts: **kill-switch + register lazy**.

- Contratto live: `Bots/src/Vinili/EventPlugins/starwars/`
- Config: `starWarsRuntime.disabled` (default **true** fuori evento) + `starWarsEvent`
- Core entry: `EventPlugins/registerEventPlugins.ts`
- Prefix pubblici (`ordine66`, `conquista`, `punta`) gated da `assertPlugin`
- `+swspawn` resta High Staff per anteprima

Moduli feature (oggi sotto `src/Vinili`, loop solo se plugin on):

- `Services/Community/starWars*`
- `Utils/Eventi/starWars*`
- `Web/siteStarWarsEventoApi.ts`
- `Prefix/Minigames/{ordine66,conquista,punta,swspawn}.ts`
- `Buttons/starWarsMinigames.ts`

Riattivare stagione: `starWarsRuntime.disabled = false` (e/o `starWarsEvent` live) + restart.
