const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry");
const {
  getTenantChannelMapSync,
  resolveTenantBoardChannelIdSync,
} = require("../../MultiGuild/core/tenantGuildSettings");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const IDs = require("../Config/ids");

function normalizeQuoteChannelId(value) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeBoardKind(kind) {
  const k = String(kind || "quote").trim().toLowerCase();
  if (k === "repost" || k === "clip" || k === "quote") return k;
  return "quote";
}

function resolveBoardChannelId(guildId, kind = "quote") {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliProtectedGuild(gid)) {
    return normalizeQuoteChannelId(IDs.channels?.quotes);
  }
  const boardKind = normalizeBoardKind(kind);
  const fromBoards = normalizeQuoteChannelId(resolveTenantBoardChannelIdSync(gid, boardKind));
  if (fromBoards) return fromBoards;
  const fromTenantSettings = normalizeQuoteChannelId(getTenantChannelMapSync(gid).quotes);
  if (fromTenantSettings) return fromTenantSettings;
  try {
    const access = resolveGuildAccess(gid);
    return normalizeQuoteChannelId(access?.entry?.channelMap?.quotes);
  } catch {
    // registry unavailable
  }
  return null;
}

function resolveQuoteChannelId(guildId) {
  return resolveBoardChannelId(guildId, "quote");
}

async function resolveBoardPostChannel(guild, kind = "quote") {
  if (!guild?.id) return null;
  const channelId = resolveBoardChannelId(guild.id, kind);
  if (!channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

async function resolveQuotePostChannel(guild) {
  return resolveBoardPostChannel(guild, "quote");
}

module.exports = {
  resolveQuoteChannelId,
  resolveQuotePostChannel,
  resolveBoardChannelId,
  resolveBoardPostChannel,
};
