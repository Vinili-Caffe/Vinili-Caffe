const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const {
  setTenantQuoteChannel,
  setTenantModLogChannel,
  getTenantChannelMapSync,
  refreshTenantGuildSettingsCache,
} = require("../../MultiGuild/core/tenantGuildSettings");
const { resolveQuoteChannelId } = require("../../Utils/Quote/quotePostChannel");
const { resolveModLogChannelId } = require("../../Utils/Moderation/tenantModLogChannel");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");
const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry");
const DASHBOARD_COLOR = "#6f4e37";
const ICON_OK = "<:vegacheckmark:1443666279058772028>";
const ICON_WARN = "<:vegax:1443934876440068179>";
const ICON_ARROW = "<a:VC_Arrow:1482706699365257397>";
const SETTING_KEYS = [ { id: "quotes", label: "Quote / Repost", resolveId: resolveQuoteChannelId, hint: "Bacheca per `+quote` e `+repost`" }, { id: "modlogs", label: "Log moderazione", resolveId: resolveModLogChannelId, hint: "Case ban, warn, mute, …" } ];
const CLEAR_TOKENS = new Set(["off", "none", "reset", "disable", "disabled", "remove", "clear"]);
const HERE_TOKENS = new Set(["here", "this", "current"]);

function memberCanManageSettings(member) {
  if (!member?.permissions) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function normalizeChannelLookupName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, "-");
}

function findTextChannelByName(guild, rawArg) {
  const query = normalizeChannelLookupName(rawArg);
  if (!query) return null;
  return (
    guild.channels.cache.find(
      (ch) =>
        ch?.isTextBased?.() &&
        (String(ch.name || "").toLowerCase() === query ||
          normalizeChannelLookupName(ch.name) === query),
    ) || null
  );
}

async function resolveSettingsChannel(message, rawArg) {
  const guild = message.guild;
  if (!guild) return { channel: null, error: "guild_missing" };
  const raw = String(rawArg || "").trim();
  if (!raw) return { channel: null, error: "missing_channel" };
  const lower = raw.toLowerCase();
  if (CLEAR_TOKENS.has(lower)) return { channel: null, clear: true };
  if (HERE_TOKENS.has(lower)) {
    const here = message.channel;
    if (!here?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
    return { channel: here };
  }
  const mentionFromMessage = message.mentions?.channels?.first?.();
  if (mentionFromMessage?.isTextBased?.()) return { channel: mentionFromMessage };
  const mention = raw.match(/^<#(\d{16,20})>$/);
  const channelId = mention ? mention[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (channelId) {
    const channel =
      guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
    return { channel };
  }
  const byName = findTextChannelByName(guild, raw);
  if (byName) return { channel: byName };
  return { channel: null, error: "invalid_channel" };
}

function botCanPostInChannel(guild, channel) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
    perms?.has(PermissionFlagsBits.SendMessages),
  );
}

async function resolveSettingCard(guild, channelId) {
  if (!channelId) {
    return {
      configured: false,
      healthy: false,
      channelLine: "`—`",
      statusLine: `${ICON_WARN} Non configurato`,
    };
  }
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    return {
      configured: true,
      healthy: false,
      channelLine: `\`${channelId}\``,
      statusLine: `${ICON_WARN} Canale non trovato`,
    };
  }
  const canPost = botCanPostInChannel(guild, channel);
  return {
    configured: true,
    healthy: canPost,
    channelLine: `<#${channel.id}>`,
    statusLine: canPost ? `${ICON_OK} Attivo` : `${ICON_WARN} Bot senza permessi`,
  };
}

function buildProgressBar(configured, total) {
  const slots = Math.max(1, total);
  const filled = Math.min(slots, Math.max(0, configured));
  const bar = "▰".repeat(filled) + "▱".repeat(slots - filled);
  return `\`${bar}\` **${filled}/${slots}**`;
}

function buildFeatureSummary(guildId) {
  try {
    const access = resolveGuildAccess(guildId);
    const features = access?.entry?.features;
    if (!features || typeof features !== "object") return null;
    const enabled = Object.entries(features).filter(([, on]) => on === true).length;
    const total = Object.keys(features).length;
    if (!total) return null;
    return `${enabled} funzioni attive`;
  } catch {
    return null;
  }
}

function resolveDashboardChannelIds(guild, options = {}) {
  const tenantMap = getTenantChannelMapSync(guild.id);
  return {
    quoteId: options.quoteChannelId ?? tenantMap.quotes ?? resolveQuoteChannelId(guild.id) ?? null,
    modLogId: options.modLogChannelId ?? tenantMap.modLogs ?? resolveModLogChannelId(guild.id) ?? null,
  };
}

async function buildSettingsDashboard(guild, options = {}) {
  if (!options.skipCacheRefresh) {
    await refreshTenantGuildSettingsCache().catch(() => null);
  }
  const { quoteId, modLogId } = resolveDashboardChannelIds(guild, options);
  const quoteCard = await resolveSettingCard(guild, quoteId);
  const modLogCard = await resolveSettingCard(guild, modLogId);
  const readyCount = [quoteCard, modLogCard].filter((c) => c.configured && c.healthy).length;
  const setCount = [quoteCard, modLogCard].filter((c) => c.configured).length;
  const progress = buildProgressBar(readyCount, 2);
  const featureSummary = buildFeatureSummary(guild.id);
  const guildIcon = guildIconUrl(guild, { size: 256 });
  const nowSec = Math.floor(Date.now() / 1000);

  const headline = options?.flash
    ? `${ICON_OK} **${options.flash}**\n\n`
    : "";

  const description = [
    headline,
    `Panoramica configurazione per **${guild.name}**.`,
    `${ICON_ARROW} ${progress} canali operativi · **${setCount}/2** impostati`,
    featureSummary ? `${ICON_ARROW} ${featureSummary} nel registry tenant` : null,
    `${ICON_ARROW} Ultimo aggiornamento <t:${nowSec}:R>`,
  ]
    .filter(Boolean)
    .join("\n");

  const commandsBlock = [
    "```",
    "+settings                    → questa dashboard",
    "+settings quotes #canale     → canale quote",
    "+settings quotes here        → canale corrente",
    "+settings quotes off         → disattiva",
    "+settings modlogs #canale    → log moderazione",
    "+settings modlogs here|off   → come sopra",
    "```",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(DASHBOARD_COLOR)
    .setAuthor({
      name: "Pannello configurazione tenant",
      iconURL: guildIcon || undefined,
    })
    .setTitle("Dashboard impostazioni")
    .setDescription(description)
    .setThumbnail(guildIcon || null)
    .addFields(
      {
        name: "Quote",
        value: [
          quoteCard.statusLine,
          quoteCard.channelLine,
          "",
          `*${SETTING_KEYS[0].hint}*`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Moderazione",
        value: [
          modLogCard.statusLine,
          modLogCard.channelLine,
          "",
          `*${SETTING_KEYS[1].hint}*`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "\u200b",
        value: [
          "**Stato rapido**",
          quoteCard.configured ? "Quote · impostata" : "Quote · solo nel comando",
          modLogCard.configured ? "Mod log · canale dedicato" : "Mod log · solo database",
        ].join("\n"),
        inline: true,
      },
      {
        name: "Comandi rapidi",
        value: commandsBlock,
        inline: false,
      },
    )
    .setFooter({
      text: `Tenant · ${guild.id} · Gestisci server richiesto`,
      iconURL: guildIconUrl(guild, { size: 64 }) || undefined,
    })
    .setTimestamp();
}

module.exports = {
  name: "settings",
  tenantOnly: true,
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Impostazioni bot per server tenant (canale quote, ecc.).",
  usage: "+settings [show | quotes | modlogs <canale | here | off>]",
  examples: [
    "+settings",
    "+settings quotes #quote",
    "+settings modlogs #mod-log",
    "+settings modlogs here",
    "+settings modlogs off",
  ],
  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    if (isViniliFullFeatureGuild(message.guild.id)) {
      return safeMessageReply(message, {
        content: `${ICON_WARN} \`+settings\` è disponibile solo sui server tenant.`,
        allowedMentions: { repliedUser: false },
      });
    }
    if (!memberCanManageSettings(message.member)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(DASHBOARD_COLOR)
            .setTitle("Accesso negato")
            .setDescription(
              `${ICON_WARN} Ti serve il permesso **Gestisci server** (o **Amministratore**) per aprire la dashboard.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const sub = String(args[0] || "show").trim().toLowerCase();
    if (sub === "show" || sub === "list" || !sub) {
      const embed = await buildSettingsDashboard(message.guild);
      return safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    }

    const isQuotes = sub === "quotes" || sub === "quote";
    const isModLogs = sub === "modlogs" || sub === "modlog";
    if (!isQuotes && !isModLogs) {
      const embed = await buildSettingsDashboard(message.guild);
      return safeMessageReply(message, {
        embeds: [
          embed,
          new EmbedBuilder()
            .setColor(DASHBOARD_COLOR)
            .setDescription(
              `${ICON_WARN} Sezione sconosciuta. Usa \`quotes\` o \`modlogs\` dopo \`+settings\`.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const channelArg = args.slice(1).join(" ").trim();
    if (!channelArg) {
      const embed = await buildSettingsDashboard(message.guild);
      return safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    }

    const resolved = await resolveSettingsChannel(message, channelArg);
    if (resolved.error === "invalid_channel") {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(DASHBOARD_COLOR)
            .setTitle("Canale non valido")
            .setDescription(
              [
                `${ICON_WARN} Canale non trovato.`,
                "",
                "Usa il **mention** del canale (`#mod-logs` selezionato da Discord), l'**ID numerico**, il **nome** (`mod-logs`) oppure `here` / `off`.",
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const setChannel = isQuotes ? setTenantQuoteChannel : setTenantModLogChannel;
    const sectionLabel = isQuotes ? "Quote" : "Log moderazione";

    if (resolved.clear) {
      const result = await setChannel(message.guild.id, null);
      if (!result.ok) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(DASHBOARD_COLOR)
              .setTitle("Salvataggio non riuscito")
              .setDescription(`${ICON_WARN} Riprova tra qualche secondo.`),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
      const embed = await buildSettingsDashboard(message.guild, {
        flash: `${sectionLabel} disattivato`,
      });
      return safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    }

    const channel = resolved.channel;
    if (!channel || !botCanPostInChannel(message.guild, channel)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(DASHBOARD_COLOR)
            .setTitle("Permessi insufficienti")
            .setDescription(
              `${ICON_WARN} Non posso inviare messaggi in ${channel || "quel canale"}. Controlla i permessi del bot.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const result = await setChannel(message.guild.id, channel.id);
    if (!result.ok) {
      const persistHint =
        result.reason === "mongo_not_ready"
          ? "Database non disponibile."
          : result.reason === "persist_failed" || result.reason === "persist_verify_failed"
            ? "Impostazione non salvata su database."
            : "Riprova tra qualche secondo.";
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(DASHBOARD_COLOR)
            .setTitle("Salvataggio non riuscito")
            .setDescription(`${ICON_WARN} ${persistHint}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const dashOpts = {
      flash: `${sectionLabel} → ${channel}`,
      skipCacheRefresh: true,
    };
    if (isQuotes) dashOpts.quoteChannelId = channel.id;
    if (isModLogs) dashOpts.modLogChannelId = channel.id;
    const embed = await buildSettingsDashboard(message.guild, dashOpts);
    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};