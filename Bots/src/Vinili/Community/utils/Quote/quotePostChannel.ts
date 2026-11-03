const { resolveGuildAccess } = require("../../../MultiGuild/core/guildRegistry") as typeof import("../../../MultiGuild/core/guildRegistry");
const {
  getTenantChannelMapSync,
  resolveTenantBoardChannelIdSync,
} = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

function normalizeQuoteChannelId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeBoardKind(kind?) {
  const k = String(kind || "quote").trim().toLowerCase();
  if (k === "repost" || k === "clip" || k === "quote") return k;
  return "quote";
}

function resolveBoardChannelId(guildId?, kind = "quote") {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  /* bachecaSite1: il server principale usa la Bacheca del sito (il canale #bacheca non c'è più).
     Gli altri server, protetti compresi, usano il canale che impostano dalla dashboard. */
  if (String(IDs.guilds?.main || "").trim() === gid) {
    const { isBachecaSiteGuild } = require("../../../site/bacheca/bachecaSite") as typeof import("../../../site/bacheca/bachecaSite");
    if (isBachecaSiteGuild(gid)) return null;
    return normalizeQuoteChannelId(IDs.channels?.quotes);
  }
  const boardKind = normalizeBoardKind(kind);
  const fromBoards = normalizeQuoteChannelId(resolveTenantBoardChannelIdSync(gid, boardKind));
  if (fromBoards) return fromBoards;
  const fromTenantSettings = normalizeQuoteChannelId(getTenantChannelMapSync(gid).quotes);
  if (fromTenantSettings) return fromTenantSettings;
  try {
    const access: any = resolveGuildAccess(gid);
    return normalizeQuoteChannelId(access?.entry?.channelMap?.quotes);
  } catch {
      }
  return null;
}

function resolveQuoteChannelId(guildId?) {
  return resolveBoardChannelId(guildId, "quote");
}

async function resolveBoardPostChannel(guild?, kind = "quote") {
  if (!guild?.id) return null;
  const channelId = resolveBoardChannelId(guild.id, kind);
  if (!channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

async function resolveQuotePostChannel(guild?) {
  return resolveBoardPostChannel(guild, "quote");
}

export = {
  resolveQuoteChannelId,
  resolveQuotePostChannel,
  resolveBoardPostChannel,
};
