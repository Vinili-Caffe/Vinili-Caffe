const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply, safeInteractionUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const {
  rejectIfPartnershipToolkitBlocked,
  isMainPartnershipPrefixGuild,
} = require("../../core/partnershipPrefixToolkit") as typeof import("../../core/partnershipPrefixToolkit");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const { getTenantProfileSnapshot } = require("../../services/tenantProfileProgressService") as typeof import("../../services/tenantProfileProgressService");
const { t } = require("../../tenant/tenantProfileConstants") as typeof import("../../tenant/tenantProfileConstants");
const {
  resolveTenantLanguageForMessage,
  resolveTenantLanguageForInteraction,
  tenantNoPermissionError,
  tenantNoticePayload,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const {
  resolveEmbedColorForGuild,
} = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");

const NO_REPLY_MENTIONS = { repliedUser: false, parse: [] };
const PRIVATE_FLAG = 1 << 6;
const BADGES_PER_PAGE = 6;

function formatPageNumber(index?) {
  return String(Math.max(0, Number(index) || 0)).padStart(2, "0");
}

function chunkRows(items?, size?) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function formatBadgeEntry(badge?) {
  const title = String(badge?.title || badge?.id || "Badge").trim();
  const desc = String(badge?.desc || "").trim() || "—";
  const emoji = String(badge?.emoji || "🎯").trim();
  const safeDesc = desc.replace(/`/g, "'");
  return `${emoji} **${title}**\n| \`${safeDesc}\``;
}

function buildBadgesDescription(lang?, badges?, pageIndex?, options: Record<string, any> = {}) {
  const viewOther = Boolean(options.viewOther);
  const header = viewOther
    ? t(lang, "badgesViewOnlyTitle")
    : "Ecco la **lista** di tutti i **badge** ottenuti.";
  const chunks = chunkRows(badges, BADGES_PER_PAGE);
  const pageItems = chunks[pageIndex] || [];
  if (!badges.length) {
    return `${header}\n\n<:vegax:1443934876440068179> Nessun badge sbloccato per ora.`;
  }
  const body = pageItems.map(formatBadgeEntry).join("\n\n");
  return `${header}\n\n${body}`.trim();
}

function buildNavigationRow(ownerId?, targetId?, currentIndex?, total?) {
  const base = `badges:${ownerId}:${targetId}:${currentIndex}:${total}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:prev`)
      .setEmoji("<a:vegaleftarrow:1462914743416131816>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:page`)
      .setLabel(formatPageNumber(currentIndex))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${base}:next`)
      .setEmoji("<a:vegarightarrow:1443673039156936837>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex >= total - 1),
  );
}

function buildBadgesPayload(badges?, pageIndex?, ownerId?, targetId?, context?) {
  const total = Math.max(1, Math.ceil((badges.length || 0) / BADGES_PER_PAGE));
  const safePage = Math.min(total - 1, Math.max(0, pageIndex));
  const embed = new EmbedBuilder()
    .setColor(resolveEmbedColorForGuild(context.guildId))
    .setDescription(
      buildBadgesDescription(context.lang, badges, safePage, {
        viewOther: context.viewOther,
      }),
    );

  return {
    embeds: [embed],
    components: total > 1 ? [buildNavigationRow(ownerId, targetId, safePage, total)] : [],
    allowedMentions: NO_REPLY_MENTIONS,
  };
}

function parseBadgesCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "badges" || parts.length < 6) return null;
  const [, ownerId, targetId, pageRaw, totalRaw, action] = parts;
  if (!/^\d{16,20}$/.test(ownerId) || !/^\d{16,20}$/.test(targetId)) return null;
  if (!["prev", "next", "page"].includes(action)) return null;
  return {
    ownerId,
    targetId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    total: Math.max(1, Math.floor(Number(totalRaw) || 1)),
    action,
  };
}

function memberCanUseBadges(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function resolveTargetUser(message?, args = []) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const raw = String(Array.isArray(args) ? args.join(" ") : "").trim();
  if (!raw) return message?.author || null;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  return message?.author || null;
}

async function handleBadgesNavInteraction(interaction?) {
  const parsed = parseBadgesCustomId(interaction.customId);
  if (!parsed) return false;
  if (parsed.action === "page") {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Puoi usare i bottoni solo sul tuo messaggio.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => null);
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) return true;
  const lang = await resolveTenantLanguageForInteraction(interaction).catch(() => "it");
  const snapshot = await getTenantProfileSnapshot(guildId, parsed.targetId, {
    client: interaction.client,
    langUserId: interaction.user.id,
    discordLocale: interaction.locale,
  });
  const badges = Array.isArray(snapshot?.unlockedBadges) ? snapshot.unlockedBadges : [];
  let page = parsed.page;
  if (parsed.action === "prev") page = Math.max(0, page - 1);
  else if (parsed.action === "next") page = page + 1;

  const context = {
    guildId,
    lang: snapshot?.lang || lang,
    viewOther: String(parsed.targetId) !== String(parsed.ownerId),
  };
  await safeInteractionUpdate(
    interaction,
    buildBadgesPayload(badges, page, parsed.ownerId, parsed.targetId, context),
  );
  return true;
}

export = {
  name: "badges",
  allowEmptyArgs: true,
  description: "Elenca i badge partnership sbloccati da un Partner Manager.",
  usage: "+badges [@utente]",
  examples: ["+badges", "+badges @utente"],
  parseBadgesCustomId,
  handleBadgesNavInteraction,

  async execute(message?, args = []) {
    if (isMainPartnershipPrefixGuild(message?.guild?.id)) {
      return executeMainBadges(message, args);
    }
    return executeTenantBadges(message, args);
  },
};

async function runBadges(message?, args = []) {
  if (!message?.guild || !message?.author || !message?.member) return;
  await message.channel.sendTyping().catch(() => null);

  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);

  if (await rejectIfPartnershipToolkitBlocked(message, "+badges", NO_REPLY_MENTIONS)) return;

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUseBadges(message.member, message.guild)) {
    return safeMessageReply(message, {
      ...(await tenantNoPermissionError(message, "`+badges`")),
      allowedMentions: NO_REPLY_MENTIONS,
    });
  }

  const targetUser = await resolveTargetUser(message, args);
  if (!targetUser) {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "profile_userNotFound")),
      allowedMentions: NO_REPLY_MENTIONS,
    });
  }

  if (targetUser.bot) {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "profile_botNotAllowed")),
      allowedMentions: NO_REPLY_MENTIONS,
    });
  }

  const snapshot = await getTenantProfileSnapshot(guildId, targetUser.id, {
    client: message.client,
    langUserId: message.author.id,
    discordLocale: message.author?.locale,
  });
  const badges = Array.isArray(snapshot?.unlockedBadges) ? snapshot.unlockedBadges : [];

  const context = {
    guildId,
    lang: snapshot?.lang || lang,
    viewOther: String(targetUser.id) !== String(message.author.id),
  };

  await safeMessageReply(
    message,
    buildBadgesPayload(badges, 0, message.author.id, targetUser.id, context),
  );
}

async function executeMainBadges(message?, args = []) {
  return runBadges(message, args);
}

async function executeTenantBadges(message?, args = []) {
  return runBadges(message, args);
}
