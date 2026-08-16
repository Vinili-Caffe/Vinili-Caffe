const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter");
const { getGuildPartnershipScores } = require("../../Services/Partner/tenantLeaderboardService");
const { resolveGuildInviteUrl } = require("./tenantLeaderboardRuntime");
const { guildIconUrl } = require("../Discord/guildDiscordIdentity");
const { listConfiguredPartnershipGuildIds } = require("../../MultiGuild/core/tenantPartnershipSettings");
const { buildTenantLookupNotFoundPayload } = require("./tenantLookupNotFoundRuntime");
const { t } = require("./tenantPartnershipI18n");
const IDs = require("../Config/ids");
const { isPartnershipOperational } = require("./partnershipConfigResolver");
const SNOWFLAKE_RE = /^\d{16,20}$/;

function inlineCode(value) {
  return `\`${String(value ?? "").replace(/`/g, "'")}\``;
}

function parseServerInfoArgs(args = []) {
  const tokens = (Array.isArray(args) ? args : [])
    .map((token) => String(token || "").trim())
    .filter(Boolean);
  const guildId = tokens.find((token) => SNOWFLAKE_RE.test(token)) || null;
  const invalidId = tokens.find((token) => /^\d+$/.test(token) && !SNOWFLAKE_RE.test(token)) || null;
  return { guildId, invalidId };
}

function listPartnershipGuildIdsForDiscovery() {
  const ids = new Set();
  const mainId = String(IDs.guilds?.main || "").trim();
  if (mainId && isPartnershipOperational(mainId)) ids.add(mainId);
  for (const gid of listConfiguredPartnershipGuildIds()) {
    ids.add(String(gid));
  }
  return Array.from(ids);
}

function isKnownPartnershipGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!SNOWFLAKE_RE.test(gid)) return false;
  const mainId = String(IDs.guilds?.main || "").trim();
  if (mainId && gid === mainId) return isPartnershipOperational(mainId);
  return listConfiguredPartnershipGuildIds().includes(gid);
}

async function resolveTargetGuild(client, sourceGuild, guildId) {
  const explicit = String(guildId || "").trim();
  if (SNOWFLAKE_RE.test(explicit)) {
    return (
      client?.guilds?.cache?.get(explicit) ||
      (await client?.guilds?.fetch?.(explicit).catch(() => null))
    );
  }
  return sourceGuild || null;
}

async function buildTenantServerInfoPayload(client, sourceGuild, options = {}) {
  const lang = options.lang || "it";
  const lookupContext = { guild: sourceGuild, client, lang };
  const explicitLookup = Boolean(options.guildId);

  if (options.invalidId) {
    return buildTenantLookupNotFoundPayload("server", lookupContext);
  }

  const requestedGuildId = explicitLookup
    ? String(options.guildId).trim()
    : String(sourceGuild?.id || "").trim();

  if (!isKnownPartnershipGuild(requestedGuildId)) {
    return buildTenantLookupNotFoundPayload("server", lookupContext);
  }

  const guild = await resolveTargetGuild(client, sourceGuild, explicitLookup ? options.guildId : null);
  const targetGuildId = guild?.id || requestedGuildId;
  if (!SNOWFLAKE_RE.test(targetGuildId)) {
    return {
      content:
        "<:vegax:1443934876440068179> Specifica un server con `+server info` o `+server info <guildId>`.",
      allowedMentions: { repliedUser: false },
    };
  }

  const [scores, owner, inviteUrl] = await Promise.all([
    getGuildPartnershipScores(targetGuildId),
    guild?.fetchOwner?.().catch(() => null) ?? Promise.resolve(null),
    resolveGuildInviteUrl(client, targetGuildId),
  ]);

  const displayName = guild?.name || `Server ${targetGuildId}`;
  const ownerMention = owner?.id ? `<@${owner.id}>` : t(lang, "serverInfo_na");
  const icon = guild ? guildIconUrl(guild, { size: 256 }) : null;

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(icon || null)
    .setDescription(
      [
        `<:926683website:1524730518481141901> **${t(lang, "serverInfo_name")}:** ${inlineCode(displayName)}`,
        `<:808239search:1524730540983582728> **${t(lang, "serverInfo_id")}:** ${inlineCode(targetGuildId)}`,
        `<:861752staff:1524730539129438258> **${t(lang, "serverInfo_owner")}:** ${ownerMention}`,
        "",
        `<:981353partner:1524730506531311688> **${t(lang, "serverInfo_count")}:** ${inlineCode(scores.total)}`,
        `<:709897bolt:1524730543122681988> **${t(lang, "serverInfo_daily")}:** ${inlineCode(scores.daily)}`,
        `<:7619planet:1524730515436077187> **${t(lang, "serverInfo_weekly")}:** ${inlineCode(scores.weekly)}`,
      ].join("\n"),
    );

  const components = [];
  if (inviteUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t(lang, "serverInfo_join"))
          .setEmoji("<:981353partner:1524730506531311688>")
          .setURL(inviteUrl),
      ),
    );
  }

  const brandingGuild = guild || sourceGuild;
  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [embed],
        components,
        allowedMentions: { repliedUser: false, users: owner?.id ? [owner.id] : [] },
      },
      explicitLookup && !guild ? null : brandingGuild,
    ),
    { guildId: targetGuildId, guild: guild || (explicitLookup ? null : sourceGuild), client },
  );
}

function pickRandomOperationalPartnershipGuildId(excludeGuildId = null) {
  const exclude = String(excludeGuildId || "").trim();
  const pool = listPartnershipGuildIdsForDiscovery().filter(
    (gid) => !exclude || String(gid) !== exclude,
  );
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

module.exports = { parseServerInfoArgs, buildTenantServerInfoPayload, pickRandomOperationalPartnershipGuildId, isKnownPartnershipGuild };