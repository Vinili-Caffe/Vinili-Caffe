const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply, safeInteractionUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const { resolveGuildAccess } = require("../core/guildRegistry") as typeof import("../core/guildRegistry");
const { mapCategoryToFeature } = require("../core/accessPolicy") as typeof import("../core/accessPolicy");
const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
const {
  resolveCommandPrefixForGuild,
  rewriteDefaultCommandPrefix,
} = require("../core/tenantGuildSettings") as typeof import("../core/tenantGuildSettings");
const { TENANT_EMBED_COLOR } = require("./tenantEmbedBranding") as typeof import("./tenantEmbedBranding");
const { t } = require("../../Vinili/Partner/i18n/tenantPartnershipI18n/index") as typeof import("../../Vinili/Partner/i18n/tenantPartnershipI18n/index");
const { resolveTenantLanguageForMessage } = require("../../Vinili/Partner/tenant/tenantPartnershipPrefixMessages") as typeof import("../../Vinili/Partner/tenant/tenantPartnershipPrefixMessages");
const HELP_COLOR = TENANT_EMBED_COLOR;
const ERROR_COLOR = "Red";
const NO_REPLY_MENTIONS = { repliedUser: false, parse: [] };
const PRIVATE_FLAG = 1 << 6;
const COMMANDS_PER_PAGE = 4;
const MUSIC_OWNER_NOTE = " *Solo chi ha avviato la riproduzione può usarlo.*";
const MUSIC_OWNER_COMMANDS = new Set(["skip", "stop", "pause", "resume", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart"]);
const CATEGORY_ORDER = ["partnership", "bacheca", "utility", "music", "tts", "minigames", "moderation"];

const TENANT_PARTNERSHIP_CATALOG = [
  { id: "invite", invoke: "+invite", example: "+invite", permissions: null },
  { id: "help", invoke: "+help", syntaxKey: "help_cmd_help_syntax", example: "+help setup", permissions: null },
  { id: "setup", invoke: "+setup", example: "+setup", permissions: "manage_server" },
  { id: "settings", invoke: "+settings", example: "+settings", permissions: "manage_server" },
  { id: "leave_partnership", invoke: "+leave", syntaxKey: "help_cmd_leave_partnership_syntax", example: "+leave partnership", permissions: "manage_server" },
  { id: "description", invoke: "+description", example: "+description", permissions: "partner_manager" },
  { id: "ctx_partnership", invoke: "Partner messaggio", example: "Tasto destro → Apps → Partner messaggio", permissions: "partner_manager" },
  { id: "slash_partnership", invoke: "/partnership", example: "/partnership", permissions: "partner_manager" },
  { id: "ctx_delete_partnership", invoke: "Elimina partnership", example: "Tasto destro sul messaggio → Apps → Elimina partnership", permissions: "admin_or_manage" },
  { id: "points", invoke: "+points", syntaxKey: "help_cmd_points_syntax", example: "+points", permissions: "partner_manager" },
  { id: "ctx_add_points", invoke: "Aggiungi punti", example: "Tasto destro sull'utente → Apps → Aggiungi punti", permissions: "administrator" },
  { id: "ctx_remove_points", invoke: "Rimuovi punti", example: "Tasto destro sull'utente → Apps → Rimuovi punti", permissions: "administrator" },
  { id: "profile", invoke: "+profile", syntaxKey: "help_cmd_profile_syntax", example: "+profile", permissions: "partner_manager" },
  { id: "badges", invoke: "+badges", syntaxKey: "help_cmd_badges_syntax", example: "+badges", permissions: "partner_manager" },
  { id: "history", invoke: "+history", syntaxKey: "help_cmd_history_syntax", example: "+history 7", permissions: "partner_manager" },
  { id: "leaderboard", invoke: "+leaderboard", example: "+leaderboard", permissions: "partner_manager" },
  { id: "random", invoke: "+random", syntaxKey: "help_cmd_random_syntax", example: "+random server", permissions: "partner_manager" },
  {
    id: "blacklist",
    invoke: "+blacklist",
    syntaxKey: "help_cmd_blacklist_syntax",
    example: "+blacklist add discord.gg/esempio motivo",
    permissions: "partner_manager",
  },
  { id: "server_info", invoke: "+server", syntaxKey: "help_cmd_server_info_syntax", example: "+server info 123456789012345678", permissions: "partner_manager" },
  { id: "user_info", invoke: "+user", syntaxKey: "help_cmd_user_info_syntax", example: "+user info 123456789012345678", permissions: "partner_manager" },
];

const TENANT_COMMAND_CATALOG = {
  partnership: TENANT_PARTNERSHIP_CATALOG,
  bacheca: [
    { invoke: "+quote", syntax: "(messaggio)", description: "Genera una quote da un messaggio (o rispondendo a uno).", example: "+quote", permissions: null },
    { invoke: "+repost", description: "Condivide un messaggio sulla bacheca (rispondi al messaggio).", example: "+repost", permissions: null },
    { invoke: "+clip", description: "Pubblica una clip vocale sulla bacheca (allegato o risposta).", example: "+clip", permissions: null },
  ],
  utility: [
    { invoke: "+afk", syntax: "(messaggio)", description: "Imposta il tuo stato AFK con un messaggio personalizzato.", example: "+afk sono via", permissions: null },
    { invoke: "+avatar", syntax: "(utente)", description: "Mostra l'avatar di un utente.", example: "+avatar", permissions: null },
    { invoke: "+banner", syntax: "(utente)", description: "Mostra il banner di un utente.", example: "+banner", permissions: null },
    { invoke: "+snipe", description: "Recupera l'ultimo messaggio eliminato nel canale.", example: "+snipe", permissions: null },
  ],
  music: [
    { invoke: "+clear", description: "Svuota la coda in attesa.", example: "+clear", permissions: null, ownerOnly: true },
    { invoke: "+lyrics", description: "Cerca i testi del brano in riproduzione.", example: "+lyrics", permissions: null },
    { invoke: "+next", syntax: "(up)", description: "Mostra il prossimo brano in coda.", example: "+next", permissions: null },
    { invoke: "+now", syntax: "(playing)", description: "Mostra il brano in riproduzione.", example: "+now", permissions: null },
    { invoke: "+pause", description: "Mette in pausa la traccia in riproduzione.", example: "+pause", permissions: null, ownerOnly: true },
    { invoke: "+play", syntax: "[brano | url]", description: "Avvia o accoda musica nel tuo canale vocale.", example: "+play never gonna give you up", permissions: null },
    { invoke: "+previous", description: "Torna al brano precedente.", example: "+previous", permissions: null, ownerOnly: true },
    { invoke: "+queue", description: "Mostra la coda attuale.", example: "+queue", permissions: null },
    { invoke: "+repeat", syntax: "(enable | disable | queue)", description: "Gestisce la ripetizione traccia o coda.", example: "+repeat enable", permissions: null, ownerOnly: true },
    { invoke: "+requested", description: "Mostra chi ha richiesto i brani in coda.", example: "+requested", permissions: null },
    { invoke: "+restart", description: "Riavvia la traccia dall'inizio.", example: "+restart", permissions: null, ownerOnly: true },
    { invoke: "+resume", description: "Riprende la traccia in pausa.", example: "+resume", permissions: null, ownerOnly: true },
    { invoke: "+rewind", description: "Riavvia la traccia corrente.", example: "+rewind", permissions: null, ownerOnly: true },
    { invoke: "+shuffle", description: "Mescola i brani in coda.", example: "+shuffle", permissions: null, ownerOnly: true },
    { invoke: "+skip", description: "Salta la traccia corrente.", example: "+skip", permissions: null, ownerOnly: true },
    { invoke: "+stop", description: "Ferma la musica e svuota la coda.", example: "+stop", permissions: null, ownerOnly: true },
    { invoke: "+upcoming", description: "Anteprima dei prossimi brani in coda.", example: "+upcoming", permissions: null },
    { invoke: "+volume", syntax: "[0-200]", description: "Imposta il volume della musica.", example: "+volume 80", permissions: null, ownerOnly: true },
  ],
  tts: [
    { invoke: "+join", description: "Fa entrare il bot nel tuo canale vocale.", example: "+join", permissions: null },
    { invoke: "+leave", description: "Fa uscire il bot dal canale vocale.", example: "+leave", permissions: null },
    { invoke: "+set", syntax: "autojoin [on | off]", description: "Attiva o disattiva l'autojoin TTS.", example: "+set autojoin on", permissions: null },
    { invoke: "+set", syntax: "voice [codice | reset]", description: "Imposta la lingua TTS personale.", example: "+set voice it", permissions: null },
    { invoke: "+voices", description: "Mostra le voci TTS disponibili.", example: "+voices", permissions: null },
  ],
  minigames: [
    { invoke: "+ship", syntax: "[utente1] [utente2]", description: "Calcola la compatibilità tra due utenti.", example: "+ship @utente1 @utente2", permissions: null },
  ],
  moderation: [
    { invoke: "+ban", syntax: "[utente] (durata) [motivo]", description: "Banna un utente (motivo obbligatorio).", example: "+ban @utente 1d spam", permissions: "BanMembers" },
    { invoke: "+case", syntax: "[id]", description: "Dettaglio di un case moderazione.", example: "+case 42", permissions: "ModerateMembers" },
    { invoke: "+kick", syntax: "[utente] [motivo]", description: "Espelle un utente dal server.", example: "+kick @utente motivo", permissions: "KickMembers" },
    { invoke: "+softban", syntax: "[utente] [motivo]", description: "Ban + unban per cancellare i messaggi recenti.", example: "+softban @utente spam", permissions: "BanMembers" },
    { invoke: "+lock", syntax: "(#canale)", description: "Blocca la scrittura in un canale.", example: "+lock #generale", permissions: "ManageChannels" },
    { invoke: "+modlogs", syntax: "[utente]", description: "Storico moderazione di un utente.", example: "+modlogs @utente", permissions: "ModerateMembers" },
    { invoke: "+mute", syntax: "[utente] [durata] [motivo]", description: "Silenzia un utente per un periodo (es. 10m, 2h, 1d).", example: "+mute @utente 30m flood", permissions: "ModerateMembers" },
    { invoke: "+purge", syntax: "[numero | all] (@utente)", description: "Elimina messaggi nel canale corrente.", example: "+purge 25", permissions: "ManageMessages" },
    { invoke: "+settings", syntax: "modlogs #canale", description: "Imposta il canale per i log moderazione.", example: "+settings modlogs #mod-logs", permissions: "Gestisci server" },
    { invoke: "+unban", syntax: "[utente] (motivo)", description: "Revoca il ban di un utente.", example: "+unban 123456789012345678", permissions: "BanMembers" },
    { invoke: "+unlock", syntax: "(#canale)", description: "Sblocca un canale.", example: "+unlock #generale", permissions: "ManageChannels" },
    { invoke: "+unmute", syntax: "[utente] (motivo)", description: "Rimuove il silenzio da un utente.", example: "+unmute @utente", permissions: "ModerateMembers" },
    { invoke: "+warn", syntax: "[utente] [motivo]", description: "Aggiunge un warn con motivo.", example: "+warn @utente motivo", permissions: "ModerateMembers" },
    { invoke: "+warnings", syntax: "[utente]", description: "Elenco warn attivi di un utente.", example: "+warnings @utente", permissions: "ModerateMembers" },
  ],
};

function normalizeQuery(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[/+?!.\-]+/, "")
    .replace(/\s+/g, " ");
}

function resolveCommandToken(invoke?) {
  const normalized = normalizeQuery(invoke);
  const token = normalized.split(" ")[0] || "";
  return token.replace(/[<>[\]|()]/g, "").split(/[\s/|]/)[0] || "";
}

function resolveLocalizedSyntax(entry?, lang?) {
  if (entry.syntaxKey) return t(lang, entry.syntaxKey);
  return String(entry.syntax || "").trim();
}

function resolveLocalizedDescription(entry?, lang?) {
  if (entry.id) return t(lang, `help_cmd_${entry.id}_desc`);
  let description = String(entry.description || "").trim();
  const token = resolveCommandToken(entry.invoke);
  if (entry.ownerOnly || MUSIC_OWNER_COMMANDS.has(token)) {
    if (!description.includes("Solo chi ha avviato")) {
      description += MUSIC_OWNER_NOTE;
    }
  }
  return description;
}

function resolveLocalizedPermissions(entry?, lang?) {
  if (entry.permissions == null || entry.permissions === "") {
    return t(lang, "help_perm_none");
  }
  const key = String(entry.permissions);
  if (key.startsWith("help_perm_") || ["manage_server", "partner_manager", "administrator", "admin_or_manage"].includes(key)) {
    return t(lang, `help_perm_${key}`);
  }
  return key;
}

function applyEntryPrefix(entry?, prefix?) {
  if (!entry || !prefix || prefix === "+") return entry;
  return {
    ...entry,
    invoke: rewriteDefaultCommandPrefix(entry.invoke, prefix),
    example: rewriteDefaultCommandPrefix(entry.example, prefix),
  };
}

function resolveFullInvoke(entry?, lang?) {
  const base = String(entry?.invoke || "").trim();
  const syntax = resolveLocalizedSyntax(entry, lang);
  if (!base) return "";
  return syntax ? `${base} ${syntax}` : base;
}

function resolveSortKey(entry?, lang?) {
  return normalizeQuery(resolveFullInvoke(entry, lang));
}

function formatCommandBlock(entry?, lang?) {
  const name = resolveFullInvoke(entry, lang) || "comando";
  const description = resolveLocalizedDescription(entry, lang);
  const example = String(entry.example || entry.invoke || name).trim();
  return [
    `**${name}**`,
    description,
    `\`${t(lang, "help_label_example")}:\` ${example}`,
    `\`${t(lang, "help_label_permissions")}:\` ${resolveLocalizedPermissions(entry, lang)}`,
  ].join("\n");
}

function resolveBotStats(client?) {
  const guilds = client?.guilds?.cache;
  if (!guilds?.size) return { servers: 0, users: 0 };
  let users = 0;
  for (const guild of guilds.values()) {
    users += Number(guild.memberCount) || 0;
  }
  return { servers: guilds.size, users };
}

function formatStatsBlock(stats?, lang?) {
  const servers = String(stats.servers || 0);
  const users = String(stats.users || 0);
  const serversLabel = t(lang, "help_stats_servers");
  const usersLabel = t(lang, "help_stats_users");
    return `\`\`\`\n${serversLabel}: ${servers}\n${usersLabel}: ${users}\n\`\`\``;
}

function formatPageNumber(index?) {
  return String(Math.max(0, Number(index) || 0)).padStart(2, "0");
}

function chunkEntries(entries?, size?) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function resolveTenantHelpFeatures(guildId?) {
  const access = resolveGuildAccess(guildId);
  if (access?.protected) return null;
  if (!access?.allowed) return {};
  const features = access.entry?.features && typeof access.entry.features === "object"
    ? access.entry.features
    : {};
  let boardsEnabled = false;
  try {
    const { getTenantBoardsSync } = require("../core/tenantGuildSettings") as typeof import("../core/tenantGuildSettings");
    boardsEnabled = getTenantBoardsSync(guildId)?.enabled === true;
  } catch {
    boardsEnabled = false;
  }
  const out: Record<string, any> = {};
  for (const category of CATEGORY_ORDER) {
    const featureKey = mapCategoryToFeature(category);
    /* Bacheca: solo se attiva dalla dashboard (boards.enabled). */
    out[category] = featureKey ? features[featureKey] === true : category === "bacheca" && boardsEnabled;
  }
  return out;
}

function buildTenantHelpEntries(guildId?, client = null) {
  const enabled = resolveTenantHelpFeatures(guildId);
  if (!enabled) return [];
  const prefix = resolveCommandPrefixForGuild(guildId, client);
  const entries = [];
  for (const category of CATEGORY_ORDER) {
    if (!enabled[category]) continue;
    const rows = TENANT_COMMAND_CATALOG[category] || [];
    for (const row of rows) {
      entries.push(applyEntryPrefix({ ...row, category }, prefix));
    }
  }
  return entries.sort((a?, b?) => {
    const categoryCmp = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryCmp !== 0) return categoryCmp;
    return resolveSortKey(a, "en").localeCompare(resolveSortKey(b, "en"), "en", { sensitivity: "base" });
  });
}

function buildTenantHelpPages(entries?, client?) {
  const pages = [{ type: "home", stats: resolveBotStats(client) }];
  for (const chunk of chunkEntries(entries, COMMANDS_PER_PAGE)) {
    pages.push(({ type: "commands", items: chunk } as any));
  }
  return pages;
}

function buildHomeEmbed(client?, lang?) {
  const stats = resolveBotStats(client);
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setDescription(formatStatsBlock(stats, lang));
}

function buildCommandsEmbed(items?, lang?) {
  const body = (items || []).map((entry?) => formatCommandBlock(entry, lang)).join("\n\n");
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setDescription(body || t(lang, "help_no_commands_page"))
    .setFooter({ text: t(lang, "help_footer_legend") });
}

function buildPageEmbed(page?, client?, lang?) {
  if (page?.type === "home") return buildHomeEmbed(client, lang);
  return buildCommandsEmbed(page?.items || [], lang);
}

function buildNavigationRow(ownerId?, currentIndex?, total?) {
  const base = `thelp:${ownerId}:${currentIndex}:${total}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:home`)
      .setEmoji(E["50738home"])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:prev`)
      .setEmoji(E["4391symbolleftarrow"])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:page`)
      .setLabel(formatPageNumber(currentIndex))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${base}:next`)
      .setEmoji(E["4630symbolrightarrow"])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex >= total - 1),
  );
}

function buildHelpPayload(page?, ownerId?, currentIndex?, total?, context?) {
  const embed = buildPageEmbed(page, context.client, context.lang);
  return {
    embeds: [embed],
    components: total > 1 ? [buildNavigationRow(ownerId, currentIndex, total)] : [],
    allowedMentions: NO_REPLY_MENTIONS,
  };
}

function parseTenantHelpCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "thelp" || parts.length < 5) return null;
  const [, ownerId, pageRaw, totalRaw, action] = parts;
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  if (!["home", "prev", "next", "page"].includes(action)) return null;
  return {
    ownerId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    total: Math.max(1, Math.floor(Number(totalRaw) || 1)),
    action,
  };
}

async function handleTenantHelpNavInteraction(interaction?) {
  const parsed = parseTenantHelpCustomId(interaction.customId);
  if (!parsed) return false;
  if (parsed.action === "page") {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply({ content: t("it", "help_buttons_only_owner"), flags: PRIVATE_FLAG })
      .catch(() => null);
    return true;
  }

  const { resolveTenantLanguageForInteraction } = require("../../Vinili/Partner/tenant/tenantPartnershipPrefixMessages") as typeof import("../../Vinili/Partner/tenant/tenantPartnershipPrefixMessages");
  const lang = await resolveTenantLanguageForInteraction(interaction).catch(() => "it");
  const entries = buildTenantHelpEntries(interaction.guild.id, interaction.client);
  const pages = buildTenantHelpPages(entries, interaction.client);
  const total = pages.length;
  let nextIndex = parsed.page;
  if (parsed.action === "home") nextIndex = 0;
  else if (parsed.action === "prev") nextIndex = Math.max(0, parsed.page - 1);
  else if (parsed.action === "next") nextIndex = Math.min(total - 1, parsed.page + 1);
  nextIndex = Math.min(total - 1, Math.max(0, nextIndex));

  const context = {
    guildId: interaction.guild.id,
    guild: interaction.guild,
    client: interaction.client,
    lang,
  };
  await safeInteractionUpdate(
    interaction,
    buildHelpPayload(pages[nextIndex], parsed.ownerId, nextIndex, total, context),
  );
  return true;
}

function buildTenantHelpMiniEmbed(query?, entries?, lang?) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const token = normalized.split(" ")[0] || "";
  const matches = entries
    .filter((entry?) => {
      const fullInvoke = normalizeQuery(resolveFullInvoke(entry, lang));
      const invoke = normalizeQuery(entry.invoke);
      const commandToken = resolveCommandToken(entry.invoke);
      return fullInvoke === normalized
        || fullInvoke.startsWith(`${normalized} `)
        || invoke === normalized
        || invoke.startsWith(`${normalized} `)
        || commandToken === token
        || fullInvoke.startsWith(`${token} `);
    })
    .sort((a?, b?) => resolveSortKey(a, lang).localeCompare(resolveSortKey(b, lang), lang, { sensitivity: "base" }));
  if (!matches.length) {
    return new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle(t(lang, "help_mini_title"))
      .setDescription(t(lang, "help_mini_not_found", { query }));
  }
  const limited = matches.slice(0, 4);
  const body = limited.map((entry?) => formatCommandBlock(entry, lang)).join("\n\n");
  const extra = matches.length > limited.length
    ? t(lang, "help_mini_more_results", { n: matches.length - limited.length })
    : "";
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setTitle(`${t(lang, "help_mini_title")}: ${query}`)
    .setDescription(`${body}${extra}`)
    .setFooter({ text: t(lang, "help_footer_legend") });
}

async function executeTenantHelp(message?, args?) {
  if (!message?.guild) return;
  await message.channel.sendTyping().catch(() => {});
  const lang = await resolveTenantLanguageForMessage(message);
  const entries = buildTenantHelpEntries(message.guild.id, message.client);
  const query = Array.isArray(args) ? args.join(" ").trim() : "";

  if (query.length) {
    const embed = buildTenantHelpMiniEmbed(query, entries, lang);
    if (!embed) return;
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: NO_REPLY_MENTIONS,
    });
    return;
  }

  const pages = buildTenantHelpPages(entries, message.client);
  if (!pages.length) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor(ERROR_COLOR)
          .setDescription(t(lang, "help_no_active_commands")),
      ],
      allowedMentions: NO_REPLY_MENTIONS,
    });
    return;
  }

  const context = {
    guildId: message.guild.id,
    guild: message.guild,
    client: message.client,
    lang,
  };

  await safeMessageReply(
    message,
    buildHelpPayload(pages[0], message.author.id, 0, pages.length, context),
  );
}

export = {
  executeTenantHelp,
  parseTenantHelpCustomId,
  handleTenantHelpNavInteraction,
};
