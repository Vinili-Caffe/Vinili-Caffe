/** Automod: canali, ruoli e bot esclusi dai controlli. */
const { UserFlagsBitField, MessageReferenceType } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isSecurityProfileImmune, hasAdminsProfileCapability, hasModeratorsProfileCapability } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { isChannelInTicketCategory } = require("../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../MultiGuild/tickets/discord/ticketCategoryUtils");
const { nowMs } = require("./automodText") as typeof import("./automodText");
const { isAutomodExemptChannel } = require("../utils/automodChannelExemptions") as typeof import("../utils/automodChannelExemptions");

const USER_STATE = new Map();
const BAD_USER_CACHE = new Map();
const VERIFIED_BOT_USER_CACHE = new Map();
const VERIFIED_BOT_IDS = new Set(Object.values(IDs?.bots || {}).filter(Boolean).map(String),);
const EXEMPT_CHANNEL_IDS = new Set([IDs.channels.staffChat, IDs.channels.staffCmds, IDs.channels.modLogs, IDs.channels.activityLogs, IDs.channels.midChat, IDs.channels.streamerChat, IDs.channels.automodExemptExtra].filter(Boolean).map(String),);
const EXEMPT_CATEGORY_IDS = new Set(["1442569074310643845"]);

function isTicketLikeCategory(category?) {
  const name = String(category?.name || "").toLowerCase().trim();
  if (!name) return false;
  return (
    name.includes("ticket") ||
    name.includes("tickets") ||
    name.includes("support tickets")
  );
}

function isTicketLikeChannel(channel?) {
  if (!channel) return false;
  if (isChannelInTicketCategory(channel)) return true;
  const channelName = String(channel?.name || "").toLowerCase().trim();
  if (channelName.includes("ticket")) return true;
  const parent = channel?.parent || channel?.parentChannel || channel?.parentThread || null;
  if (parent && isTicketLikeCategory(parent)) return true;
  const grandParent = parent?.parent || parent?.parentChannel || null;
  if (grandParent && isTicketLikeCategory(grandParent)) return true;
  return false;
}

function isUnderExemptCategory(channel?) {
  if (!channel) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.parentId || ""))) return true;
  return false;
}

function isWhitelistedByCategory(channel?, setRef?) {
  if (!channel) return false;
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  if (set.has(String(channel.id || ""))) return true;
  if (set.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (set.has(String(parent.id || ""))) return true;
  if (set.has(String(parent.parentId || ""))) return true;
  return false;
}

function resolveProfileKey(message?) {
  const channelId = String(message?.channelId || "");
  const parentId = String(message?.channel?.parentId || "");
  const mediaChannelId = String(IDs?.channels?.media || "");
  if (isTicketLikeChannel(message?.channel)) return "ticket";
  if (channelId && (channelId === mediaChannelId || parentId === mediaChannelId))
    return "media";
  if (
    EXEMPT_CHANNEL_IDS.has(channelId) ||
    EXEMPT_CHANNEL_IDS.has(parentId) ||
    isStaffZoneExemptChannel(message?.channel) ||
    isAutomodExemptChannel(message?.channel, message?.guild, message?.client) ||
    isUnderExemptCategory(message?.channel)
  ) {
    return "staff";
  }
  return "default";
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function getCachedBadUser(userId?, at = nowMs()) {
  const cached = BAD_USER_CACHE.get(String(userId));
  if (!cached) return undefined;
  if (cached.expiresAt < at) {
    BAD_USER_CACHE.delete(String(userId));
    return undefined;
  }
  return cached.value;
}

function setCachedBadUser(userId?, value?, ttlMs = 60_000) {
  BAD_USER_CACHE.set(String(userId), {
    value,
    expiresAt: nowMs() + ttlMs,
  });
}

function isStaffZoneExemptChannel(channel?) {
  if (!channel) return false;
  try {
    const { isChannelOrThreadUnderStaffChat } = require("../../Staff/utils/staffChatChannelUtils") as typeof import("../../Staff/utils/staffChatChannelUtils");
    const { isChannelOrThreadUnderStaffCmds } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
    return isChannelOrThreadUnderStaffChat(channel) || isChannelOrThreadUnderStaffCmds(channel);
  } catch {
    return false;
  }
}

async function isVerifiedBotMessage(message?) {
  if (!message) return false;
  const authorId = String(message.author?.id || "");
  const applicationId = String(message.applicationId || "");
  if (authorId && VERIFIED_BOT_IDS.has(authorId)) return true;
  if (applicationId && VERIFIED_BOT_IDS.has(applicationId)) return true;
  if (message.author?.bot) {
    try {
      const flags = message.author.flags || (typeof message.author.fetchFlags === "function" ? await message.author.fetchFlags().catch(() => null) : null);
      if (flags?.has?.(UserFlagsBitField.Flags.VerifiedBot)) return true;
    } catch (err) {
      global.logger?.warn?.("[automod] ", err?.message || err);
    }
  }
  return false;
}

function isCrossServerForwardedMessage(message?) {
  const currentGuildId = String(message?.guildId || message?.guild?.id || "").trim();
  if (!currentGuildId) return false;
  const ref = message?.reference;
  const refType = Number(ref?.type);
  if (ref && refType === MessageReferenceType?.Default) return false;
  if (ref && Number.isFinite(refType) && refType === 0) return false;
  const isDiscordForward =
    refType === MessageReferenceType?.Forward ||
    (Number.isFinite(refType) && refType === 1);
  const hasForwardSnapshots = Number(message?.messageSnapshots?.size || 0) > 0;
  if (!isDiscordForward && !hasForwardSnapshots) return false;
  const sourceGuildId = String(ref?.guildId || "").trim();
  if (sourceGuildId && sourceGuildId === currentGuildId) return false;
  if (sourceGuildId && sourceGuildId !== currentGuildId) return true;
  if (hasForwardSnapshots) return true;
  return false;
}

async function isVerifiedBotUserId(client?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (VERIFIED_BOT_IDS.has(id)) return true;
  if (VERIFIED_BOT_USER_CACHE.has(id)) {
    return VERIFIED_BOT_USER_CACHE.get(id);
  }
  let verified = false;
  try {
    const user = client?.users?.cache?.get?.(id) || (await client?.users?.fetch?.(id).catch(() => null));
    if (user?.bot) {
      const flags = user.flags || (typeof user.fetchFlags === "function" ? await user.fetchFlags().catch(() => null) : null);
      verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
    }
  } catch {
    verified = false;
  }
  VERIFIED_BOT_USER_CACHE.set(id, verified);
  return verified;
}

function isAutoModRoleExemptMember(guild?, member?) {
  if (!guild || !member) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), String(member.id || ""))) {
    return true;
  }
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (hasAdminsProfileCapability(member, "automodImmunity")) return true;
  if (hasModeratorsProfileCapability(member, "automodImmunity")) return true;
  if (CORE_EXEMPT_USER_IDS.has(String(member.id || ""))) return true;
  return false;
}

function isLikelyCommandMessage(message?) {
  const content = String(message?.content || "").trim();
  if (!content) return false;
  const dynamicPrefixes = [];
  const cfgPrefix = message?.client?.config?.prefix;
  if (Array.isArray(cfgPrefix)) {
    for (const entry of cfgPrefix) {
      const value = String(entry || "").trim();
      if (value) dynamicPrefixes.push(value);
    }
  } else if (typeof cfgPrefix === "string" && cfgPrefix.trim()) {
    dynamicPrefixes.push(cfgPrefix.trim());
  }
  if (!dynamicPrefixes.length) {
    dynamicPrefixes.push("+");
  }
  return dynamicPrefixes.some((prefix?) => {
    if (!content.startsWith(prefix)) return false;
    return content.length > prefix.length;
  });
}

export = { USER_STATE, BAD_USER_CACHE, EXEMPT_CHANNEL_IDS, isUnderExemptCategory, isWhitelistedByCategory, resolveProfileKey, isDbReady, getCachedBadUser, setCachedBadUser, isStaffZoneExemptChannel, isVerifiedBotMessage, isCrossServerForwardedMessage, isVerifiedBotUserId, isAutoModRoleExemptMember, isLikelyCommandMessage };
