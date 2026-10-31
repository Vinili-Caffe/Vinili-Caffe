# Plugin evento halloween

Codice sotto `archivio/halloween/src/Vinili/` (layout Hogwarts).

## Live (`Bots/src/Vinili`)

**Shim rimasti (solo plugin):**
- `EventPlugins/halloween/register.ts`
- `EventPlugins/halloween/runtimeKillSwitch.ts`

**Stub locale (evento staccato):**
- `Utils/Minigames/halloweenMinigameHooks.ts` — export invariati, tutti i gate Halloween disattivati; bank vuote.

**Rimosso dal live** (solo in archivio sotto):
- `Data/Minigames/halloweenMinigameBanks.ts`
- `Services/Community/halloweenCandyService.ts`
- `Services/Community/halloweenEmojiHuntService.ts`
- `Services/Community/halloweenReactLeaderboardService.ts`
- `Services/Minigames/minigameHalloweenGames.ts`
- `Services/Minigames/minigameHalloweenShowcaseService.ts`
- `Services/Minigames/minigameTrickOrTreat.ts`
- `Utils/Eventi/halloweenCandyCatalog.ts`
- `Utils/Eventi/halloweenEventConfig.ts`
- `Utils/Minigames/halloweenCandyAlternate.ts`
- `Utils/Minigames/halloweenEmojiHuntUi.ts`
- `Utils/Minigames/halloweenFindGhostUi.ts`
- `Utils/Minigames/halloweenTrickOrTreatUi.ts`

Riattivazione: ripristinare shim + wiring minigame/reazioni/API profilo come in archivio.
