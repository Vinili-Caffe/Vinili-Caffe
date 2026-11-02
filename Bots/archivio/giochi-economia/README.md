# Giochi / economia Discord (archivio)

Comandi prefix, button GUI, canvas e **core servizi** usati un tempo per economia/gambling su Discord.

Non sono caricati dal bot live. Restano qui solo per riferimento o eventuale ripristino.
In live resta solo uno stub `activeEconomyService` (sempre off) per wiki/ACL.

IDE: i `.ts` in archivio non sono nel `Bots/tsconfig` (solo `src/`). Se Cursor li apre e segnala rumore tipizzato, metti `// @ts-nocheck` in cima al file.

Include:
- Prefix / Buttons / Utils GUI+canvas: `bal` / `work` / `daily` / `weekly` / `monthly`, shop, rob, slots, roulette, blackjack, coinflip, rps, tris, scratch
- Services: `serverWalletService`, `serverEconomyService`, `serverShopService`, `serverEconomyGamblingRob`, `activeEconomyService`, `economyGuiSessionStore`, `slotsGuiSessionStore`
- Utils: `economyDisplayHelpers`, `serverShopCatalog` + runtime GUI
