# Plugin evento starwars

Codice sotto `archivio/starwars/src/Vinili/` (layout Hogwarts).
Shim in `src/Vinili/…` re-exportano da qui per API sito / plugin register.

**Discord minigame shims rimossi dal live** (non ricaricare):  
`Buttons/starWarsMinigames`, `Prefix/Minigames/{conquista,swspawn,punta,ordine66}`,  
`Services/Community/starWarsDiscordMinigamesService`, `Utils/Eventi/starWarsMinigamesRegistry`.  
Restano in archivio; comandi in `REMOVED_PREFIX`.

Shim ancora in live (sito/evento):
- `Web/siteStarWarsEventoApi.ts`
- `EventPlugins/starwars/{register,runtimeKillSwitch,assertPlugin}.ts`
- servizi/utils Eventi non Discord-minigame
