# Bot TypeScript rewrite — inventario keep / kill

Data bozza: 2026-10-27 · **Your call** aggiornata 2026-10-27 (decisioni utente: no notifica resoconti / weekly DM; Hogwarts+SW+Halloween = Event plugin archivio).  
Scope: gateway Vinyls + Coffee + worker PM2 legati ai bot (non React).  
JS live (`Vinyls/`, `Coffee/`) resta intatto finché non c’è cutover esplicito.

## Come usare questo doc

1. Colonna **Suggested** = proposta iniziale tecnica.
2. Colonna **Your call** = decisione rewrite (`Keep` | `Kill` | `Later` | `Event`). Già precompilata — rivedi e modifica.
3. Finché una riga resta `Kill` / vuota di proposito, **non** si migra in `bots-ts/`.
4. Dopo ok: apri il primo dominio `Keep` (consiglio: Utility/ping + core boot).

Legenda:
- **Keep** — core / Discord-native / alimenta il sito
- **Later** — dopo il gateway TS, o resta JS a lungo
- **Event** — plugin stagionale, non nel core
- **Kill** — non portare in TS (sito lo sostituisce, morto, o one-shot)

Conteggi grezzi oggi: Vinyls Services ~220 file (Community 105), Prefix ~100, Events ~65; Coffee più piccolo.

### Principi usati per precompilare
- UI Discord con gate “vai sul sito” (`DISCORD_*_UI` off) → **Kill** (backend ticket/activity resta Keep).
- Hogwarts / SW / Halloween → **Event** plugin archivio (off di default, riusabile).
- Notifica resoconti + weekly DM reminder → **Kill**.
- Worker site/vote/backup → **Later** (restano JS).
- Economy GIF pesanti → **Later** (core wallet Keep; GUI slim solo se serve).
- Markov Coffee → **Keep**.
- Economy GIF → **Keep** (come JS).

---

## A. Processi PM2

| Feature | Path / entry | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Gateway Vinyls | `loader.js` → `Vinyls/index.js` | bots-vinyls | Keep | Keep | Discord, Mongo, Lavalink | Entry principale |
| Gateway Coffee | `loader.js` → `Coffee/index.js` | bots-coffee | Keep | Keep | Discord, Mongo, Lavalink | Music+TTS + Markov |
| Community poll worker | `Vinyls/Services/Web/communityPollWorkerApp.js` | community-poll | Later | Later | Mongo, Discord REST | Twitch/Kick/news/voiceExp |
| Site API | `Vinyls/Services/Web/durableSiteApiApp.js` | site-api | Later | Later | Mongo, Discord | Resta JS a lungo |
| Bot scheduler | `Vinyls/Services/Web/botSchedulerWorkerApp.js` | bot-scheduler | Later | Later | Mongo | |
| Auto backup worker | `Vinyls/Services/Web/autoBackupWorkerApp.js` | auto-backup | Later | Later | Discord, disk | |
| Vote drain | `Vinyls/Services/Web/voteQueueDrainWorkerApp.js` | vote-drain | Later | Later | Mongo | |
| Discadia intake | `Vinyls/Services/Web/discadiaVoteIntakeApp.js` | discadia-votes | Later | Later | HTTP | |
| Top.gg intake | `Vinyls/Services/Web/topggVoteIntakeApp.js` | topgg-votes | Later | Later | HTTP | |
| Partnership migration | `Vinyls/Services/Web/partnershipMigrationWorkerApp.js` | partnership-migration | Kill | Kill | Mongo | One-shot / raro |
| Lavalink | `Lavalink/Lavalink.jar` | lavalink | Keep | Keep | Java | Infra, non rewrite TS |
| Spotify token cache | `Lavalink/spotify-token-cache.js` | spotify-token-cache | Later | Later | HTTP | Resta JS |
| Host watchdog | `deploy/ha/hostWatchdogApp.js` | host-watchdog | Later | Later | PM2 | Ops |
| Host housekeeper | `deploy/ha/hostHousekeeperApp.js` | host-housekeeper | Later | Later | OS | Ops |

---

## B. Core gateway / runtime

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Client boot Vinyls | `Vinyls/index.js` | vinyls | Keep | Keep | discord.js 14 | |
| Client boot Coffee | `Coffee/index.js` | coffee | Keep | Keep | discord.js 14 | |
| Event loader | `Vinyls/Handlers/eventHandler.js` | vinyls | Keep | Keep | Events/* | |
| Prefix loader | `Vinyls/Handlers/prefixHandler.js` | vinyls | Keep | Keep | Prefix/* | |
| Command / button loaders | `Vinyls/Handlers/*` | vinyls | Keep | Keep | Commands, Buttons | Solo handler Keep |
| Logger | `Vinyls/Utils/Moderation/logger.js` | both | Keep | Keep | | |
| Mongo connect | `Vinyls/Utils/Database/mongoConnect.js` | both | Keep | Keep | Mongo | |
| Config / IDs | `Vinyls/Utils/Config/ids`, `config.json` | both | Keep | Keep | env | |
| MultiGuild layer | `Vinyls/MultiGuild/**` | vinyls | Keep | Keep | tenant registry | Multi-server |
| Shared runtime | `shared/runtime/**`, `shared/discord/**` | both | Keep | Keep | | |
| Webhook HTTP bot | `Vinyls/Services/Web/webhookService.js` :3000 | vinyls | Keep | Keep | Express | Health + realtime |
| Coffee health :3011 | Coffee index / health | coffee | Keep | Keep | | |

---

## C. Moderation / security

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Ban / mute / warn / kick / purge | `Vinyls/Prefix/Moderation/*` | vinyls | Keep | Keep | ModCase | Discord-native |
| Cases / modlogs | `modCase*`, Prefix case/modlogs | vinyls | Keep | Keep | Mongo | |
| Automod | `Services/Moderation/automodService.js` | vinyls | Keep | Keep | | |
| Anti-nuke / security panels | `antiNukeService`, `security*` | vinyls | Keep | Keep | | |
| Join gate / raid | `joinGate*`, `joinRaid*` | vinyls | Keep | Keep | | |
| Muted mirror | `mutedMirrorRoleService.js` | vinyls | Keep | Keep | | |
| Discord automod rules sync | `discordAutomodRulesService.js` | vinyls | Later | Later | | |
| Audit log events (ban, channel, role…) | `Vinyls/Events/*` | vinyls | Keep | Keep | | |
| Appelli unban/unmute **UI Discord** | `Buttons/websiteUnban*`, unmute*, handlers | vinyls | Kill | Kill | sito `/appelli/` | Site-first |
| Candidature **UI Discord** | `Buttons/candidature.js`, candidatureApplicationHandlers | vinyls | Kill | Kill | sito `/candidature/` | Site-first |

---

## D. Staff / tickets

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Pause **logica** (Mongo / sync) | pause services / Utils Pause | vinyls | Keep | Keep | site pause | Backend sì |
| Pause **buttons Discord** | `Buttons/pause.js` | vinyls | Kill | Kill | sito `/staff/pause/` | UI site-first |
| Resoconti **service / notifica Discord** | `weeklyStaffResocontoService` | vinyls | Keep | Kill | | Utente: niente più notifiche resoconti |
| Resoconti **buttons Discord** | `Buttons/resoconto.js` | vinyls | Kill | Kill | `/user/?tab=staff` | UI site-first |
| Auto-valutazioni | `staffAutoValutazioniService.js` | vinyls | Keep | Keep | | Discord + Mongo |
| Staffer della settimana | `stafferDellaSettimanaService.js` | vinyls | Keep | Keep | | |
| PM points / badges / history (prefix) | Prefix Staff/* | vinyls | Keep | Keep | | Ancora usati in guild |
| PM shop **buttons Discord** | `partnerManagerShopButtons.js` | vinyls | Kill | Kill | sito staff PM shop | Duplicato sito |
| Staff leaderboard | Prefix Staff/leaderboard | vinyls | Keep | Keep | | |
| Staff threads (chat/cmds) | `staffChatThreadsService`, `staffCmdsThreads*` | vinyls | Keep | Keep | | Discord-native |
| Tickets **backend** (create/claim/close/transcript) | Ticket services + site sync | vinyls | Keep | Keep | site-web-tickets | Sito consuma API |
| Tickets **UI Discord** (panel/open) | Prefix Staff/ticket, Buttons ticket (gated) | vinyls | Kill | Kill | `/tickets/` | Gate Discord off |
| Ticket orphan reconcile | `ticketOrphanReconcileService.js` | vinyls | Later | Later | | |
| Staff panels Discord info | `Buttons/staffPanels.js` | vinyls | Kill | Kill | sito `/staff/` | Duplicato |

---

## E. Activity / levels / EXP

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Message/voice activity | `activityService.js` | vinyls | Keep | Keep | GuildHourly | Alimenta sito |
| EXP / levels | `expService.js` | vinyls | Keep | Keep | | |
| Rank / mstats | Prefix Level/rank, mstats | vinyls | Keep | Keep | | In-chat utile |
| Classifica Discord “vetrina” | Prefix Level/classifica | vinyls | Keep | Later | sito `/classifiche/` | Sito primario |
| Stats me/top/server/channel | Prefix Stats/*, Buttons me | vinyls | Keep | Keep | | |
| Live voice EXP loop | activityService + community-poll | vinyls+worker | Keep | Keep | | |
| Prune old activity | `pruneOldActivityDataService.js` | vinyls | Later | Later | | |
| Daily engagement / member stats | `daily*Stats*`, `dailyEngagement*` | vinyls | Later | Later | | |
| Weekly activity winners / contest | `weeklyActivityWinners*`, `weeklyContest*` | vinyls | Keep | Keep | | |
| Week winner grants | `weekWinnerGrantsService.js` | vinyls | Keep | Keep | custom perks | |

---

## F. Economy (server coins + GUI)

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Bal / daily / weekly / monthly / work | Prefix Economy/* | vinyls | Keep | Keep | wallet | Nessuna economy sito |
| Shop | Prefix Economy/shop | vinyls | Keep | Keep | | |
| Gambling games (slots/roulette/…) **logica** | Prefix Economy + services | vinyls | Keep | Keep | | Discord-native |
| Gambling **GIF canvas** | Utils/Render, Buttons *Gui, shared/render | vinyls | Later | Keep | RAM | Utente: tenere come ora |
| Server economy / wallet / shop backend | `serverEconomy*`, `serverWallet*`, `serverShop*` | vinyls | Keep | Keep | | |
| Active economy / bridge | `activeEconomyService`, `serverEconomyBridge*` | vinyls | Later | Later | | |
| GUI session stores | `economyGuiSessionStore`, `slotsGuiSessionStore` | vinyls | Later | Keep | | Serve ai giochi Keep |

---

## G. Music / TTS / Voice

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Lavalink music Vinyls | `Vinyls/Services/Music/lavalinkMusicService.js` | vinyls | Keep | Keep | Lavalink | |
| Music Coffee wrapper | `Coffee/Services/Music/lavalinkMusicService.js` | coffee | Keep | Keep | hooks | |
| Prefix Music | `Vinyls/Prefix/Music/*` | vinyls+coffee | Keep | Keep | | |
| Lyrics | music lyrics | both | Keep | Keep | | |
| TTS | `*/Services/TTS/*`, Prefix TTS | both | Keep | Keep | | |
| Voice continuous capture | `voiceContinuousCaptureService.js` | vinyls | Keep | Keep | PCM | |
| Voice clip / myclip | `voiceClipService`, Prefix clip | vinyls | Keep | Keep | | |
| PM voice AFK probe | `pmVoiceAfk*` | vinyls | Later | Later | | |
| Coffee transcription | `Coffee/Services/Voice/voiceTranscription*` | coffee | Later | Later | | |
| Coffee stanza voice rooms | `stanzaVoiceRoomsService.js` | coffee | Later | Later | | |

---

## H. Minigames (sempre-on)

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Minigame scheduler / core | `minigameService.js` | vinyls | Keep | Keep | | Moduli, non monolite |
| Minigame scheduler entry | `minigameSchedulerService.js` | vinyls | Keep | Keep | | |
| Wordle Discord | `wordleService.js` | vinyls | Later | Later | sito `/wordle/` | Preferire sito |
| Ship / punta / SW prefix | Prefix Minigames/* | vinyls | Later | Event | | SW → Event; ship Later |
| Counting restore UI | Buttons countingRestore | vinyls | Later | Later | | |

---

## I. Hogwarts (Event plugin — archivio riusabile)

Runtime off di default; codice come **plugin** per riuso futuro (non nel core boot).

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Sorting / houses / points | hogwartsSorting*, MemberHousePoints* | vinyls | Event | Event | | Plugin archivio |
| Shop / boosts / consumabili | hogwartsShop*, Consumable* | vinyls | Event | Event | | |
| House cup / serata film LB | HouseCup*, SerataFilm* | vinyls | Event | Event | | |
| Spell list / react press / forbidden books | SpellList*, ReactPress*, Forbidden* | vinyls | Event | Event | | |
| Basilisk / duel / finale chaos | Basilisk*, Duel*, FinaleChaos* | vinyls | Event | Event | | |
| House channel minigames + burrobirra | HouseChannel*, burrobirra* | vinyls | Event | Event | | |
| Potion / wipe / blacklist / end | Potion*, Wipe*, Blacklist*, EventEnd* | vinyls | Event | Event | | |
| Galeoni / Gringott | galeoni*, gringott* | vinyls | Event | Event | | |
| Halloween showcase (Hogwarts-era) | minigameHalloweenShowcaseService | vinyls | Event | Event | | Opz. sotto Halloween |
| Backfill / rebuild one-shot | *Backfill*, *Rebuild* | vinyls | Kill | Kill | | Non riusare one-shot |

---

## J. Star Wars / Halloween (Event plugin — archivio riusabile)

Stesso modello Hogwarts: plugin caricabile, off di default, riusabile e funzionante.

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| SW Discord minigames | starWarsDiscordMinigamesService | vinyls | Event | Event | sito `/evento/*` | Plugin |
| SW economy / wallet / rewards / transversal | starWarsEconomy*, EventWallet*, Rewards*, Transversal* | vinyls | Event | Event | | |
| SW site games | starWarsSiteGamesService | vinyls | Event | Event | site | |
| Halloween candy | halloweenCandyService | vinyls | Event | Event | | |
| Halloween emoji hunt | halloweenEmojiHuntService | vinyls | Event | Event | | |
| Halloween react leaderboard | halloweenReactLeaderboardService | vinyls | Event | Event | | |

---

## K. Partner / MultiGuild tenants

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Partnership execute / history / blacklist | Services/Partner/* | vinyls | Keep | Keep | | Multi-tenant |
| Partner audit | partnerAuditService | worker | Later | Later | | |
| Tenant objectives / manual / offline recovery | tenant* | vinyls | Keep | Keep | | |
| Test guild mirror sync | testGuildMirrorSyncService | vinyls | Later | Later | | |
| Partner description sync | partnerDescription* | vinyls | Keep | Keep | | |
| Partnership migration worker | partnershipMigrationWorkerApp | worker | Kill | Kill | | |
| Tenant prefix/buttons (points, help, profile) | Buttons tenant* | vinyls | Keep | Keep | | |

---

## L. Community ops

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Birthday | birthdayService | vinyls | Keep | Keep | | |
| Giveaway | Giveaway/*, Commands Admin/giveaway | vinyls | Keep | Keep | | Discord-native |
| Bump / Top.gg / Discadia vote | Bump/*, vote workers | vinyls+worker | Keep | Keep | | |
| AFK | Prefix Utility/afk | vinyls | Keep | Keep | | |
| Quote / repost / myquote / myrepost | Utility + services | vinyls | Keep | Keep | | |
| Snipe | Prefix Utility/snipe | vinyls | Keep | Keep | | |
| Avatar / banner / invite / help / ping / settings | Prefix Utility/* (no profile) | vinyls | Keep | Keep | | Pilota TS |
| Profile **UI Discord** | Prefix Utility/profile, Buttons profile (gated) | vinyls | Kill | Kill | `/personalizza/`, `/user/` | Site-first; `skipLoad` già |
| Custom role / voc **backend** | customRole*, customVoc* | vinyls | Keep | Keep | site roles | Sito + Discord voc |
| Boost announce / recovery | boostAnnounce*, guildMemberUpdateService | vinyls | Keep | Keep | | |
| Clan tag roles | clanTagRoleService | vinyls | Keep | Keep | | |
| Movie night announcements | movieNightAnnouncementService | worker | Later | Later | | |
| Twitch / Kick / game news alerts | *LiveAlert*, gameNews* | community-poll | Later | Later | | |
| Weekly DM reminder | weeklyDmReminderService | community-poll | Later | Kill | | Utente: non voluto più |
| User full state persistence | userFullStatePersistenceService | community-poll | Later | Later | | |
| Auto poll | autoPollService | community-poll | Later | Later | | |
| Idea/bug threads | ideaBugThreadService | vinyls | Later | Later | | |
| Streamer stage guard | streamerStageGuardService | vinyls | Later | Later | | |
| GDPR export / erase | gdprUserData* | vinyls | Keep | Keep | `/dati/` | Compliance |
| Premium / store entitlements | premiumCredits*, entitlement events | vinyls | Later | Later | dashboard premium | |
| Cleanup users not in server | cleanupUsersNotInServerService | vinyls | Later | Later | | |
| DB maintenance | dbMaintenanceService | vinyls | Later | Later | | |
| No-role kick | noRoleKickService | vinyls | Later | Later | | |
| Bot updates relay | botUpdatesRelayService | vinyls | Later | Later | | |
| Contest prize maintenance | contestPrizeMaintenanceService | vinyls | Later | Later | | |
| Custom perks migration / cleanup | customPerks*Migration*, Cleanup* | vinyls | Kill | Kill | | One-shot |
| Sponsor verified requires main | sponsorVerifiedRequiresMainService | vinyls | Keep | Keep | | |
| Global EXP event announcement | globalExpEventAnnouncementService | vinyls | Later | Later | | |
| Poll reaction threads | pollReactionThreadService | vinyls | Later | Later | | |
| Kick subscriber sync | kickSubscriberSyncService | vinyls | Later | Later | | |
| User leave backup | userLeaveBackupService | vinyls | Later | Later | | |
| Discord panel recipe persistence | discordPanelRecipePersistenceService | vinyls | Later | Later | | |
| Community ops umbrella | communityOpsService | vinyls | Keep | Keep | | |
| Effective member join | effectiveMemberJoinService | vinyls | Keep | Keep | welcome | |
| Message EXP bonuses | messageCommunityExpBonusesService | vinyls | Keep | Keep | | |
| Repost roulette | repostRouletteService | vinyls | Later | Later | | |
| Profile store (data) | profileStore.js | vinyls | Keep | Keep | | Dati sì, UI Discord no |

---

## M. Backup

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Server backup / restore | Services/Backup/* | vinyls+auto-backup | Later | Later | disk | |
| Post-restore ID sync | postRestoreIdSyncService | vinyls | Later | Later | | |
| Prefix Admin/backup | Prefix Admin/backup | vinyls | Later | Later | | |

---

## N. Coffee-only (oltre music/TTS)

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Markov collect / generate / auto-send | Coffee/Services/Community/markov* | coffee | Later | Keep | ancora enabled | Utente: tenere |
| Markov keeper HTTP | markovKeeperHttpService | coffee | Later | Keep | | |
| Chat reminder | chatReminderService | coffee | Later | Keep | | |
| Prefix Utility help/ping Coffee | Coffee/Prefix/Utility/* | coffee | Keep | Keep | | |

---

## O. Slash / Dev / Admin

| Feature | Path esempio | Processo | Suggested | Your call | Dipende da | Note |
|---------|--------------|----------|-----------|-----------|------------|------|
| Slash Admin (giveaway, copy, role, …) | Vinyls/Commands/Admin/* | vinyls | Keep | Keep | | |
| Slash Staff | Commands/Staff/* | vinyls | Keep | Keep | | Evitare duplicati UI sito |
| Dev say / notify / quit | Commands/Dev, Prefix Dev | vinyls | Keep | Keep | | Interni |
| Admin setup / security / level | Prefix Admin/* | vinyls | Keep | Keep | | |
| Morgames giveaway verify | Integrations/morgames* | vinyls | Kill | Kill | | Integrazione morta/rara |
| Reminders one-time | Services/Reminders/* | vinyls | Later | Later | | |
| Guild feature buckets | Services/Guild/* | vinyls | Later | Later | | |

---

## P. Events Discord (file) — overview

| Gruppo eventi | Esempi | Suggested | Your call | Note |
|---------------|--------|-----------|-----------|------|
| Lifecycle | ready, clientError | Keep | Keep | |
| Messages | messageCreate/Update/Delete/Bulk | Keep | Keep | |
| Members | guildMemberAdd/Remove/Update | Keep | Keep | |
| Voice / presence | voiceStateUpdate, presenceUpdate | Keep | Keep | |
| Moderation gateway | guildBan*, autoModeration* | Keep | Keep | |
| Channels / roles / threads | channel*, role*, thread* | Keep | Keep | Audit |
| Invites | inviteCreate/Delete | Keep | Keep | |
| Interactions | interactionCreate + handlers | Keep | Keep | Solo handler Keep |
| Emoji / sticker / webhook / stage / scheduled | emoji*, sticker*, … | Later | Later | Audit rari |
| Entitlements | entitlement* | Later | Later | Store |
| MultiGuild events | MultiGuild/Events/* | Keep | Keep | |

---

## Q. Priorità migrazione (con Your call attuale)

1. Core boot + logger + env + mongo stub (`bots-ts`)  
2. Utility (`ping`, `help`) + health HTTP  
3. Moderation base  
4. Music (+ hooks)  
5. Activity / EXP  
6. Staff **backend** + tickets **backend** (no UI Discord site-first)  
7. Economy core (no GIF 1:1)  
8. Partner / MultiGuild  
9. Minigames core (moduli)  
10. Coffee music/TTS (+ Markov solo se Keep)  
11. Event plugins (Hogwarts / SW / Halloween) off-by-default  
12. Worker `Later` uno alla volta  

**Fuori dal primo rewrite:** UI site-first Discord, notifica resoconti, weekly DM, partnership-migration, Morgames, one-shot.  
**Event dopo core:** Hogwarts + SW + Halloween come plugin archivio.

---

## R. Checklist

- [x] **Your call** aggiornata (no resoconti notify / weekly DM; eventi = Event plugin)
- [x] Decisioni: Markov Keep; economy GIF Keep; grafica embed light
- [x] Core Keep scaffold in `bots-ts/` (utility→community→economy→staff→tickets→security→events)
- [ ] Cutover live (token/PM2) — solo dopo ok esplicito
- [x] Lavalink **voice** player (Shoukaku, gated CONNECT+ALLOW_SHARED)
- [x] Economy slots GUI panel (customId live; canvas GIF 1:1 ancora Later-depth)
- [x] Tenant buttons + +profile/+settings deepen
- [x] Worker stubs Later (`bots-ts/src/workers/*` → exit, JS resta)
- [x] Event plugins SW/Halloween/Hogwarts (prefix live gated VC_PLUGINS)
- [x] Prefix Keep principali portati (mod/music/economy/staff/utility/stats/admin/TTS)
- [x] Modlog / EXP ignore / shop periods / Lavalink REST / `/api/ts/*`
- [x] TTS Google audio + Markov generateLocal (+ autosend + keeper HTTP)
- [x] interactionCreate + `/giveaway` + vote webhooks + birthday/weekly/staff loops + audit

Scaffold: [`bots-ts/`](../bots-ts/).

### Progress rewrite (`bots-ts/`) — deepen Keep

| Dominio | Stato |
|---------|--------|
| Core boot Vinyls/Coffee | OK |
| Utility (+afk/snipe/avatar/banner/quote/clip) | OK |
| Moderation + ModCase + modlog | OK |
| Music + lyrics + Lavalink REST + Shoukaku voice | OK gated CONNECT+ALLOW_SHARED |
| Activity + EXP + voice + level-up + ignore | OK |
| Automod / antinuke / joingate | OK |
| Economy wallet+shop+periods+slots GUI | OK (GIF canvas 1:1 deepen) |
| Staff / tickets + `/api/ts/*` + profile/loops | OK |
| MultiGuild + tenant buttons + partner | OK deepen |
| Community giveaway/birthday/weekly/ops/audit | OK |
| Coffee Markov + keeper + TTS + chatReminder | OK |
| Event plugins | OK off-by-default + live prefix |
| Workers Later stubs | OK (no dual-run) |
| Health + vote webhooks | OK gated |
| Mongo live schema write / cutover PM2 | **non** (ok esplicito) |
| Live Mongo **read** (`VC_TS_LIVE_MONGO_READ`) | OK gated |
| Economy slots PNG canvas (`@napi-rs/canvas`) | OK (GIF frames deepen) |
| PCM clip ring + ffmpeg mp3 | OK gated `VC_TS_VOICE_CAPTURE` |
| Hogwarts houses/points plugin | OK in-memory + @bot housecup |
| Rank PNG card + help nav buttons | OK |
| Markov disk persist + channel filter | OK |
| Slash `/music` `/partnership` `/say` | OK gated guild register |
| Admin `+setup` reale (canali/ruoli) | OK |
| **Cutover live stesso token** | Solo con PM2 JS spento (`VC_TS_CUTOVER`) |
