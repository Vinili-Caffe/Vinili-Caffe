# MultiGuild (layer sperimentale)

Cartella **isolata** per server **tenant** (nuovi). **Non tocca** main, test né sponsor.

## Guild protette (mai MultiGuild)

Lette automaticamente da `config.json` + `Utils/Config/ids.js`:

| Tipo | Origine |
|------|---------|
| **Main** | `mainGuildId` / `IDs.guilds.main` |
| **Test** | `IDs.guilds.test` |
| **Sponsor** | `config.sponsorGuildIds` (Luna, Cash, …) |

Su queste guild il layer:

- **non** legge `registry.json` (voci ignorate + warning se presenti)
- **non** applica feature gate ai comandi
- **non** esegue automazioni tenant
- **rifiuta** il bridge `services.*` (errore `MULTI_GUILD_PROTECTED`)

Il bot ufficiale continua con il codice Vinyls esistente (`commandPermissions`, `messageCreate`, ecc.).

## Registry = solo tenant

`config/registry.json` ha `guilds: {}` di default. **Non inserire** main/test/sponsor.

Solo ID di **nuovi server** con `mode: "tenant"`.

## Attivazione

```env
MULTI_GUILD_LAYER=1
```

Log atteso con un server tenant: `protette: 8 | tenant registry: 1` (8 = 1 main + 1 test + 6 sponsor).

Con `MULTI_GUILD_LAYER=1`, ogni guild **non protetta** dove è il bot viene registrata automaticamente in MongoDB (`multiGuildTenantRegistry`) al boot e su `guildCreate`. Disattiva con `MULTI_GUILD_AUTO_REGISTER=0`.

## Alert nuova guild (bot invitato)

Con layer ON, su ogni **guild non protetta**:

1. Embed dettagliato nel canale `1507363435489394738` (`config/joinAlert.json`)
2. Creazione invito **permanente** (`maxAge: 0`, `maxUses: 0`)
3. Se l’invito viene eliminato → rigenerato automaticamente + messaggio nel canale log

Main / test / sponsor **esclusi**.

## Musica, TTS, Utility, Minigiochi e Moderazione (solo su server tenant)

Con `MULTI_GUILD_LAYER=1`, su **ogni guild non protetta** (tenant):

- **Solo** comandi prefix **Musica**, **TTS**, **Utility** (`help`, `settings`, `ping`, `avatar`, `banner`, `afk`, `snipe`, `quote`), **Minigiochi** (`ship`) e **Moderazione** (`ban`, `kick`, `mute`, `warn`, `purge`, `modlogs`, …) — niente economia, level, altri minigiochi, … (**nemmeno con Administrator** fuori da queste categorie)
- **Nessun** minigioco / counting / automod community / EXP / bump su messaggio
- Musica / TTS / utility / minigiochi: **senza** gate `permissions.json` (canali/ruoli staff della main)
- Moderazione: permessi **Discord nativi** del membro (es. Banna membri, Modera membri, Gestisci messaggi); non usa i ruoli Vinili di `permissions.json`
- Risposte AFK su menzione attive anche sui tenant

**Main, test e sponsor** = bot completo come prima (`permissions.json` + automazioni).

Guild non in registry: stesse regole tenant. Flag `music` / `tts` / `utility` / `minigames` / `moderation` in `registry.json` per disabilitare singole categorie.

### Log moderazione (tenant)

Imposta il canale log con `+settings modlogs #canale` (serve **Gestisci server**). In `registry.json`:

```json
"channelMap": {
  "modLogs": "ID_CANALE_MOD_LOG"
}
```

Senza canale, i case vengono salvati nel database ma non inviati in un canale dedicato.

### Canale quote (tenant)

`+quote` risponde sempre nel canale del comando. Una **copia** nel canale quote dedicato viene inviata solo se configurato e diversa dal canale corrente.

**In-game (consigliato):** chi ha **Gestisci server** può usare:

- `+settings quotes #canale` — imposta il canale quote
- `+settings quotes here` — usa il canale corrente
- `+settings quotes off` — disattiva la copia nel canale dedicato
- `+settings` — mostra la configurazione attuale

**Manuale (registry):** in `registry.json` per il tenant:

```json
"channelMap": {
  "quotes": "ID_CANALE_QUOTE"
}
```

Senza canale quote valido, la quote resta solo nel canale dove è stato usato il comando.

### Help tenant

Su server tenant, `+help` mostra solo i comandi attivi per quel server (rispetta i flag `features` del registry). Mini-help: `+help <comando>`.

## API

```js
if (client.multiGuild.isViniliProtectedGuild(guild.id)) {
  return; // flusso Vinyls normale
}
if (!client.multiGuild.shouldUseMultiGuildCommandGate(guild.id)) {
  return; // idem per protette o layer off
}
const gate = client.multiGuild.canInvokePrefixCommand(guild.id, "music");
if (!gate.ok) return;
```

## Aggiungere un tenant

**Automatico (default):** invita il bot su un server non protetto → compare nel registry al prossimo restart (o subito su `guildCreate`).

**Manuale** in `config/registry.json` (override o guild senza auto-register):

```json
"NUOVO_GUILD_ID": {
  "label": "Server partner X",
  "mode": "tenant",
  "enabled": true,
  "features": {
    "utility": true,
    "music": true,
    "tts": true,
    "minigames": true,
    "moderation": true
  },
  "channelMap": {
    "quotes": "ID_CANALE_QUOTE_OPZIONALE",
    "modLogs": "ID_CANALE_MOD_LOG_OPZIONALE"
  }
}
```

## Garanzie

- Layer **OFF** di default → zero effetto.
- Layer **ON** → main/test/sponsor restano `protected`, separati dal registry.
- `MULTI_GUILD_ALLOW_UNKNOWN=1` non si applica alle guild protette.