const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { resolveGuildAccess } = require("../core/guildRegistry");
const { mapCategoryToFeature } = require("../core/accessPolicy");

const HELP_COLOR = "#6f4e37";
const ERROR_COLOR = "Red";
const NO_REPLY_MENTIONS = { repliedUser: false, parse: [] };
const MUSIC_OWNER_NOTE = " *Solo chi ha avviato la riproduzione può usarlo.*";
const MUSIC_OWNER_COMMANDS = new Set(["skip", "stop", "pause", "resume", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart"]);

const CATEGORY_LABELS = {
  utility: "Utility",
  music: "Musica",
  tts: "TTS",
  minigames: "Minigiochi",
  moderation: "Moderazione",
};

const CATEGORY_ORDER = ["utility", "music", "tts", "minigames", "moderation"];

const TENANT_COMMAND_CATALOG = {
  utility: [
    { invoke: "+help", description: "Mostra i comandi disponibili su questo server." },
    { invoke: "+help <comando>", description: "Scheda rapida su un comando." },
    { invoke: "+settings", description: "Mostra le impostazioni del server (canale quote, ecc.)." },
    { invoke: "+settings quotes <#canale | here | off>", description: "Canale bacheca per quote e repost (+repost)." },
    { invoke: "+ping", description: "Mostra latenza bot, database e uptime." },
    { invoke: "+avatar [utente]", description: "Mostra l'avatar di un utente." },
    { invoke: "+banner [utente]", description: "Mostra il banner di un utente." },
    { invoke: "+afk [messaggio]", description: "Imposta il tuo stato AFK con un messaggio personalizzato." },
    { invoke: "+snipe", description: "Recupera l'ultimo messaggio eliminato nel canale." },
    { invoke: "+quote [messaggio]", description: "Genera una quote da un messaggio (o rispondendo a uno)." },
    { invoke: "+repost", description: "Condivide un messaggio sulla bacheca (rispondi al messaggio)." },
    { invoke: "+myrepost [utente] [pagina]", description: "Elenco dei repost pubblicati su questo server." },
  ],
  music: [
    { invoke: "+play <brano | url>", description: "Avvia o accoda musica nel tuo canale vocale." },
    { invoke: "+pause", description: "Mette in pausa la traccia in riproduzione.", ownerOnly: true },
    { invoke: "+resume", description: "Riprende la traccia in pausa.", ownerOnly: true },
    { invoke: "+skip", description: "Salta la traccia corrente.", ownerOnly: true },
    { invoke: "+stop", description: "Ferma la musica e svuota la coda.", ownerOnly: true },
    { invoke: "+volume <0-200>", description: "Imposta il volume della musica.", ownerOnly: true },
    { invoke: "+shuffle", description: "Mescola i brani in coda.", ownerOnly: true },
    { invoke: "+clear", description: "Svuota la coda in attesa.", ownerOnly: true },
    { invoke: "+repeat [enable | disable | queue]", description: "Gestisce la ripetizione traccia o coda.", ownerOnly: true },
    { invoke: "+previous", description: "Torna al brano precedente.", ownerOnly: true },
    { invoke: "+rewind", description: "Riavvia la traccia corrente.", ownerOnly: true },
    { invoke: "+restart", description: "Riavvia la traccia dall'inizio.", ownerOnly: true },
    { invoke: "+now [playing]", description: "Mostra il brano in riproduzione." },
    { invoke: "+next [up]", description: "Mostra il prossimo brano in coda." },
    { invoke: "+queue", description: "Mostra la coda attuale." },
    { invoke: "+lyrics", description: "Cerca i testi del brano in riproduzione." },
    { invoke: "+requested", description: "Mostra chi ha richiesto i brani in coda." },
    { invoke: "+upcoming", description: "Anteprima dei prossimi brani in coda." },
  ],
  tts: [
    { invoke: "+join", description: "Fa entrare il bot nel tuo canale vocale." },
    { invoke: "+leave", description: "Fa uscire il bot dal canale vocale." },
    { invoke: "+voices", description: "Mostra le voci TTS disponibili." },
    { invoke: "+set voice <codice | reset>", description: "Imposta la lingua TTS personale." },
    { invoke: "+set autojoin <on | off>", description: "Attiva o disattiva l'autojoin TTS." },
  ],
  minigames: [
    { invoke: "+ship <utente1> <utente2>", description: "Calcola la compatibilità tra due utenti." },
  ],
  moderation: [
    { invoke: "+ban <utente> [durata] <motivo>", description: "Banna un utente (motivo obbligatorio)." },
    { invoke: "+kick <utente> <motivo>", description: "Espelle un utente dal server." },
    { invoke: "+mute <utente> <durata> <motivo>", description: "Silenzia un utente per un periodo (es. 10m, 2h, 1d)." },
    { invoke: "+unmute <utente> [motivo]", description: "Rimuove il silenzio da un utente." },
    { invoke: "+unban <utente> [motivo]", description: "Revoca il ban di un utente." },
    { invoke: "+warn <utente> <motivo>", description: "Aggiunge un warn con motivo." },
    { invoke: "+warnings <utente>", description: "Elenco warn attivi di un utente." },
    { invoke: "+purge <numero | all> [@utente]", description: "Elimina messaggi nel canale corrente." },
    { invoke: "+modlogs <utente>", description: "Storico moderazione di un utente." },
    { invoke: "+case <id>", description: "Dettaglio di un case moderazione." },
    { invoke: "+lock [#canale]", description: "Blocca la scrittura in un canale." },
    { invoke: "+unlock [#canale]", description: "Sblocca un canale." },
    { invoke: "+settings modlogs #canale", description: "Imposta il canale per i log moderazione (Gestisci server)." },
  ],
};

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[/+?!.\-]+/, "")
    .replace(/\s+/g, " ");
}

function resolveCommandToken(invoke) {
  const normalized = normalizeQuery(invoke);
  const token = normalized.split(" ")[0] || "";
  return token.replace(/[<>[\]|]/g, "").split(/[\s/|]/)[0] || "";
}

function formatCatalogEntry(entry) {
  const token = resolveCommandToken(entry.invoke);
  let description = String(entry.description || "").trim();
  if (entry.ownerOnly || MUSIC_OWNER_COMMANDS.has(token)) {
    if (!description.includes("Solo chi ha avviato")) {
      description += MUSIC_OWNER_NOTE;
    }
  }
  return `- \`${entry.invoke}\` — ${description}`;
}

function resolveTenantHelpFeatures(guildId) {
  const access = resolveGuildAccess(guildId);
  if (access?.protected) return null;
  if (!access?.allowed) return {};
  const features = access.entry?.features && typeof access.entry.features === "object"
    ? access.entry.features
    : {};
  const out = {};
  for (const category of CATEGORY_ORDER) {
    const featureKey = mapCategoryToFeature(category);
    out[category] = featureKey ? features[featureKey] === true : false;
  }
  return out;
}

function buildTenantHelpEntries(guildId) {
  const enabled = resolveTenantHelpFeatures(guildId);
  if (!enabled) return [];
  const entries = [];
  for (const category of CATEGORY_ORDER) {
    if (!enabled[category]) continue;
    const rows = TENANT_COMMAND_CATALOG[category] || [];
    for (const row of rows) {
      entries.push({ ...row, category });
    }
  }
  return entries;
}

function buildTenantHelpOverviewEmbed(guild, entries) {
  if (!entries.length) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle("Comandi disponibili")
      .setDescription("<:vegax:1443934876440068179> Nessun comando attivo su questo server.");
  }
  const grouped = new Map();
  for (const entry of entries) {
    const key = String(entry.category || "misc");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  const sections = [];
  for (const category of CATEGORY_ORDER) {
    const rows = grouped.get(category);
    if (!rows?.length) continue;
    sections.push(`**${CATEGORY_LABELS[category] || category}**\n${rows.map(formatCatalogEntry).join("\n")}`);
  }
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setTitle("Comandi disponibili")
    .setDescription(
      [
        "Ecco i comandi prefix attivi su questo server.",
        "Usa `+help <comando>` per i dettagli rapidi.",
        "",
        sections.join("\n\n"),
      ].join("\n"),
    )
    .setFooter({ text: `${guild?.name || "Server"} • prefix +` });
}

function buildTenantHelpMiniEmbed(query, entries) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const token = normalized.split(" ")[0] || "";
  const matches = entries.filter((entry) => {
    const invoke = normalizeQuery(entry.invoke);
    const commandToken = resolveCommandToken(entry.invoke);
    return invoke === normalized
      || invoke.startsWith(`${normalized} `)
      || commandToken === token
      || invoke.startsWith(`${token} `);
  });
  if (!matches.length) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle("Mini Help")
      .setDescription(`<:vegax:1443934876440068179> Nessun comando trovato per \`${query}\`.`);
  }
  const limited = matches.slice(0, 12);
  const lines = limited.map(formatCatalogEntry);
  const extra = matches.length > limited.length
    ? `\n\n...e altri **${matches.length - limited.length}** risultati.`
    : "";
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setTitle(`Mini Help: ${query}`)
    .setDescription(`${lines.join("\n")}${extra}`);
}

async function executeTenantHelp(message, args) {
  if (!message?.guild) return;
  await message.channel.sendTyping().catch(() => {});
  const entries = buildTenantHelpEntries(message.guild.id);
  const query = Array.isArray(args) ? args.join(" ").trim() : "";
  const embed = query.length
    ? buildTenantHelpMiniEmbed(query, entries)
    : buildTenantHelpOverviewEmbed(message.guild, entries);
  if (!embed) return;
  await safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: NO_REPLY_MENTIONS,
  });
}

module.exports = {
  TENANT_COMMAND_CATALOG,
  buildTenantHelpEntries,
  executeTenantHelp,
};