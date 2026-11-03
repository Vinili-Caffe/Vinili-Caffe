const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { getUserPartnershipScores } = require("../services/tenantLeaderboardService") as typeof import("../services/tenantLeaderboardService");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { buildTenantLookupNotFoundPayload } = require("./tenantLookupNotFoundRuntime") as typeof import("./tenantLookupNotFoundRuntime");
const { t } = require("../i18n/tenantPartnershipI18n/index") as typeof import("../i18n/tenantPartnershipI18n/index");
const SNOWFLAKE_RE = /^\d{16,20}$/;
const USER_MENTION_RE = /^<@!?(\d{16,20})>$/;

function inlineCode(value?) {
  return `\`${String(value ?? "").replace(/`/g, "'")}\``;
}

function parseUserInfoArgs(args = [], message = null) {
  const mention = message?.mentions?.users?.first?.();
  if (mention?.id) {
    return { userId: String(mention.id), invalidId: null };
  }

  const tokens = (Array.isArray(args) ? args : [])
    .map((token?) => String(token || "").trim())
    .filter(Boolean);

  for (const token of tokens) {
    const fromMention = token.match(USER_MENTION_RE);
    if (fromMention?.[1]) {
      return { userId: fromMention[1], invalidId: null };
    }
  }

  const userId = tokens.find((token?) => SNOWFLAKE_RE.test(token)) || null;
  const invalidId = tokens.find((token?) => /^\d+$/.test(token) && !SNOWFLAKE_RE.test(token)) || null;
  return { userId, invalidId };
}

async function resolveTargetUser(client?, guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!SNOWFLAKE_RE.test(uid)) return { member: null, user: null };

  const member =
    guild?.members?.cache?.get(uid) ||
    (await guild?.members?.fetch?.(uid).catch(() => null));
  if (member?.user) return { member, user: member.user };

  const user =
    client?.users?.cache?.get(uid) ||
    (await client?.users?.fetch?.(uid).catch(() => null));
  return { member: null, user };
}

async function buildTenantUserInfoPayload(client?, sourceGuild?, options: Record<string, any> = {}) {
  const lang = options.lang || "it";
  const lookupContext = { guild: sourceGuild, client, lang };
  const explicitUserId = options.userId ? String(options.userId).trim() : null;

  if (options.invalidId || (explicitUserId && !SNOWFLAKE_RE.test(explicitUserId))) {
    return buildTenantLookupNotFoundPayload("user", lookupContext);
  }

  const targetUserId = explicitUserId || String(options.fallbackUserId || "").trim();
  if (!SNOWFLAKE_RE.test(targetUserId)) {
    return {
      content:
        "<:vegax:1443934876440068179> Specifica un utente con `+user info`, `+user info <userId>` o una menzione.",
      allowedMentions: { repliedUser: false },
    };
  }

  const { member, user } = await resolveTargetUser(client, sourceGuild, targetUserId);
  if (explicitUserId && !user && !member) {
    return buildTenantLookupNotFoundPayload("user", lookupContext);
  }

  const scores = await getUserPartnershipScores(targetUserId);

  const displayUser = user || member?.user || null;
  const username = memberDisplayName(member || displayUser) || `User ${targetUserId}`;
  const avatarUrl = userAvatarUrlDynamic(member || displayUser, { size: 256 }) || null;
  const profileUrl = `https://discord.com/users/${targetUserId}`;

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(avatarUrl || null)
    .setDescription(
      [
        `<:861752staff:1524730539129438258> **${t(lang, "userInfo_username")}:** ${inlineCode(username)}`,
        `<:808239search:1524730540983582728> **${t(lang, "userInfo_id")}:** ${inlineCode(targetUserId)}`,
        "",
        `<:981353partner:1524730506531311688> **${t(lang, "userInfo_count")}:** ${inlineCode(scores.total)}`,
        `<:709897bolt:1524730543122681988> **${t(lang, "userInfo_daily")}:** ${inlineCode(scores.daily)}`,
        `<:7619planet:1524730515436077187> **${t(lang, "userInfo_weekly")}:** ${inlineCode(scores.weekly)}`,
      ].join("\n"),
    );

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(t(lang, "userInfo_openProfile"))
        .setEmoji("<:808239search:1524730540983582728>")
        .setURL(profileUrl),
    ),
  ];

  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [embed],
        components,
        allowedMentions: { repliedUser: false, users: [targetUserId] },
      },
      sourceGuild,
    ),
    { guildId: sourceGuild?.id, guild: sourceGuild, client },
  );
}

export = { parseUserInfoArgs, buildTenantUserInfoPayload };