# Codice morto — Integrations / Counting / AI

Non caricato a runtime. Solo riferimento se serve ripristinare.

## Integrations
- `src/Vinili/Services/Integrations/morgamesDiscordGiveawayVerify.ts` — verify Discord↔Morgames per giveaway  
  Live: requisito giveaway spento (`requireMorgames` ignorato in `giveawayService`).

## Counting
- `src/Vinili/Utils/Community/countingChannelBanService.ts`
- `src/Vinili/Utils/Community/countingRestoreService.ts`
- `src/Vinili/Buttons/countingRestore.ts`
- `src/Vinili/Utils/Message/officialMessageCommunityHandlers.counting.ts` — logica messaggio/catch-up/sanction estratta dal handler live  
  Live: wiring rimosso da `Events/ready|messageCreate|messageUpdate|messageDelete|messageDeleteBulk` e dal body di `officialMessageCommunityHandlers.ts`.  
  Schema/GDPR/bucket counting restano (dati storici); `IDs.channels.counting` resta in config.

## AI
- `src/Vinili/Data/AI/*` — chatbot/persona bot (già archiviato)

## OG meta (legacy HTML)
- `src/Vinili/Config/og-meta.json` — titoli/descrizioni i18n per path (serveva a `siteLinkUnfurlService`, già morto).  
  Live sito: meta OG da React (`WebSite/src/lib/og.ts` + `layout`).

## site.config (retired)
- `src/Vinili/Config/site.config.full-legacy.json` — snapshot.  
  Live: niente file; film URL in `siteSeratafilmAccessApi` (+ env `VC_SERATAFILM_FILM_URL`).

## Ticket Discord main (orphan reconcile)
- `src/Vinili/Services/Ticket/ticketOrphanReconcileService.ts` — sync canali orfani solo sulla main guild.  
  Live: spento (`ready`); ticket main = sito; tenant usano ancora `ticketMaintenanceService`.

## Services morti / migration (2026-10-31)
- `Services/Community/economyGuiSessionStore.ts`
- `Services/Guild/guildFeatureBucketPollModel.ts`
- `Services/Staff/staffWarnChannelMigrationService.ts` (+ unwire `ready`)
- `Services/Staff/staffNegativesWarnConversionMigrationService.ts` (+ unwire `ready`)

## Tenant Partner
Spostati live in `src/Vinili/MultiGuild/services/Partner/tenant*.ts` (non più sotto `Services/Partner`).
Utils tenant UI/runtime/i18n in `src/Vinili/MultiGuild/utils/Partner/tenant*` (+ `tenantModLogChannel` in `MultiGuild/utils/`).

## Utils morti (2026-10-31)
- `Utils/Text/replyMessages.ts`
- `Utils/Ticket/ticketFormModalRuntime.ts` / `ticketTeamOverwrites.ts` / `ticketReopenOutsideSession.ts`
- `Utils/Eventi/starWarsEventConfig.ts` (shim → pack starwars)
- `Utils/Minigames/halloweenMinigameHooks.ts` (live stub; pack halloween ha l’originale)
- cartella vuota `Utils/Utility/`

## Ripristino counting (checklist)
1. Riportare i 3 file ChannelBan/Restore/Button sotto `Bots/src/Vinili/...`
2. Reinserire lo snapshot `.counting.ts` in `officialMessageCommunityHandlers.ts` + export
3. Re-wire Events (handleCounting / maybePunish* / processPending* su ready)
