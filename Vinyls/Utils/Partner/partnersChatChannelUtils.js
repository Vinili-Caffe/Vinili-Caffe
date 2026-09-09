const IDs = require("../Config/ids");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { scheduleMessageDeletion, EPHEMERAL_TTL_SHORT_MS } = require("../Config/ephemeralMessageTtl");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { getPartnersChatChannelId, getPmCommandsCategoryIds, tenantPmCommandsZoneConfigured, getPartnershipChannelId } = require("./partnershipConfigResolver");
const {
  isChannelOrThreadUnderStaffCmds,
  isStaffCmdsPmCommandsThread,
  getStaffCmdsThreadIdsCache,
} = require("../Staff/staffCmdsChannelUtils");
const { isChannelOrThreadUnderStaffChat } = require("../Staff/staffChatChannelUtils");
const { getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket");

function partnersChatChannelId(guildId) {
  const gid = String(guildId || "").trim();
  if (gid && !isViniliFullFeatureGuild(gid)) {
    return String(getPartnersChatChannelId(gid) || "").trim();
  }
  return String(IDs.channels?.partnersChat || "").trim();
}

function isChannelOrThreadUnderPartnersChat(channel) {
  const guildId = String(channel?.guild?.id || channel?.guildId || "").trim();
  const chat = partnersChatChannelId(guildId);
  if (!channel) return false;
  const id = String(channel.id);
  if (chat && id === chat) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (chat && parent === chat) return true;
  }
  return false;
}

function isChannelOrThreadUnderTargetChannel(channel, targetChannelId) {
  const target = String(targetChannelId || "").trim();
  if (!target || !channel) return false;
  if (String(channel.id) === target) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    return String(channel.parentId || "") === target;
  }
  return false;
}

function isChannelOrThreadUnderCategory(channel, categoryId) {
  const category = String(categoryId || "").trim();
  if (!category || !channel) return false;
  let base = channel;
  if (typeof base.isThread === "function" && base.isThread()) {
    base = base.parent ?? base.guild?.channels?.cache?.get(base.parentId) ?? null;
  }
  return String(base?.parentId || "").trim() === category;
}

function isChannelAllowedInTenantPmZone(channel, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || isViniliFullFeatureGuild(gid)) return true;
  if (!tenantPmCommandsZoneConfigured(gid)) return true;

  const chatChannelId = getPartnersChatChannelId(gid);
  if (chatChannelId && isChannelOrThreadUnderTargetChannel(channel, chatChannelId)) return true;

  for (const zoneId of getPmCommandsCategoryIds(gid)) {
    if (isChannelOrThreadUnderTargetChannel(channel, zoneId)) return true;
    if (isChannelOrThreadUnderCategory(channel, zoneId)) return true;
  }
  return false;
}

function formatTenantPmCommandsZoneHint(guildId, guild) {
  const gid = String(guildId || "").trim();
  const parts = [];
  const chatChannelId = getPartnersChatChannelId(gid);
  const seen = new Set();
  if (chatChannelId) {
    parts.push(`<#${chatChannelId}>`);
    seen.add(String(chatChannelId));
  }
  for (const zoneId of getPmCommandsCategoryIds(gid)) {
    const id = String(zoneId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ch = guild?.channels?.cache?.get(id);
    if (ch?.isTextBased?.()) {
      parts.push(`<#${id}>`);
      continue;
    }
    parts.push(ch?.name ? `categoria **${ch.name}**` : `categoria \`${id}\``);
  }
  return parts.join(" o ");
}

async function isPartnerPmDailyCommandsThread(channel) {
  return isStaffCmdsPmCommandsThread(channel);
}

async function isOpenPartnershipTicketChannel(channel) {
  const id = String(channel?.id || "").trim();
  if (!/^\d{16,22}$/.test(id)) return false;
  const doc = await Ticket.findOne({ channelId: id, open: true }, { ticketType: 1 }).lean().catch(() => null);
  return String(doc?.ticketType || "").toLowerCase() === "partnership";
}

async function resolvePmCommandsThreadId() {
  const cached = getStaffCmdsThreadIdsCache().pm;
  if (cached && /^\d{16,22}$/.test(String(cached))) return String(cached);
  const ids = await getStaffCmdsThreadIds();
  return ids?.pm && /^\d{16,22}$/.test(String(ids.pm)) ? String(ids.pm) : "";
}

function formatChannelMention(channelId) {
  const id = String(channelId || "").trim();
  return /^\d{16,22}$/.test(id) ? `<#${id}>` : null;
}

function formatChannelMentionFromChannel(channel) {
  if (!channel) return null;
  return formatChannelMention(channel.id);
}

async function resolvePmCommandsChannelMention(guildId = null) {
  const threadMention = formatChannelMention(await resolvePmCommandsThreadId());
  if (threadMention) return threadMention;
  const staffCmdsMention = formatChannelMention(IDs.channels?.staffCmds);
  if (staffCmdsMention) return staffCmdsMention;
  const gid = String(guildId || "").trim();
  if (gid && !isViniliFullFeatureGuild(gid)) {
    const tenantPm = formatChannelMention(getPartnersChatChannelId(gid));
    if (tenantPm) return tenantPm;
  }
  return "**Comandi Partner Manager**";
}

function isPartnershipPublishChannel(channel) {
  const guildId = String(channel?.guild?.id || channel?.guildId || "").trim();
  const publishId = String(getPartnershipChannelId(guildId) || "").trim();
  if (!publishId || !channel) return false;
  const channelId = String(channel.id || "");
  if (channelId === publishId) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    return String(channel.parentId || "") === publishId;
  }
  return false;
}

const PARTNERSHIP_PUBLISH_CHANNEL_ALLOWED_COMMANDS = new Set([
  "segnala",
  "elimina partnership",
]);

function partnershipPublishChannelCommandsDeniedReplyContent(channel, options = {}) {
  if (!isPartnershipPublishChannel(channel)) return null;
  const cmd = String(options.commandName || options.command || "")
    .trim()
    .toLowerCase();
  if (cmd && PARTNERSHIP_PUBLISH_CHANNEL_ALLOWED_COMMANDS.has(cmd)) return null;
  return (
    "<:vegax:1443934876440068179> Nel **canale partnership** non puoi usare **comandi**. " +
    "Pubblica qui solo la **descrizione** della partner (con **link d'invito Discord**) oppure usa i comandi nel **canale Partner Manager** configurato."
  );
}

async function partnersChatPartnerCommandDeniedReplyContent(channel, options = {}) {
  if (options.allowPartnership === true && channel?.__webTicketPartnership) return null;
  const guildId = String(channel?.guild?.id || channel?.guildId || "").trim();
  if (guildId && !isViniliFullFeatureGuild(guildId)) {
    if (!tenantPmCommandsZoneConfigured(guildId)) return null;
    if (isChannelAllowedInTenantPmZone(channel, guildId)) return null;
    const hint = formatTenantPmCommandsZoneHint(guildId, channel?.guild);
    return (
      `<:vegax:1443934876440068179> I comandi **Partner Manager** vanno usati solo in ${hint || "i canali configurati"} (e nei thread sotto).`
    );
  }
  if (options.allowPartnership === true && (await isOpenPartnershipTicketChannel(channel))) return null;
  if (await isStaffCmdsPmCommandsThread(channel)) return null;
  const inPartnersChat = isChannelOrThreadUnderPartnersChat(channel);
  const inStaffCmdsZone = isChannelOrThreadUnderStaffCmds(channel);
  const inStaffChatZone = isChannelOrThreadUnderStaffChat(channel);
  if (!inPartnersChat && !inStaffCmdsZone && !inStaffChatZone) return null;
  const tid = await resolvePmCommandsThreadId();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const hint = tid
    ? ` Spostati in <#${tid}> (sotto <#${staffCmdsId}>).`
    : staffCmdsId
      ? ` Apri il thread **Comandi Partner Manager** sotto <#${staffCmdsId}>.`
      : " Apri il thread **Comandi Partner Manager** sotto #staff-cmds.";
  const chatWarn = inStaffChatZone && staffChatId
    ? ` Non usare i comandi PM nel thread **Chat** sotto <#${staffChatId}>.`
    : "";
  return (
    "<:vegax:1443934876440068179> Partnership, classifica PM, blacklist e pannello profilo staff/PM vanno usati solo nel **thread Comandi Partner Manager**, non qui." +
    chatWarn +
    hint
  );
}

async function sendPartnersChatDeniedPrefixCleanup(message, content) {
  const ttl = EPHEMERAL_TTL_SHORT_MS;
  const { buildSimpleNoticePayload } = require("../Embeds/simpleNoticeEmbed");
  const payload = buildSimpleNoticePayload(content, message?.guild, {
    allowedMentions: { repliedUser: false },
  });
  let sent = null;
  try {
    if (message && typeof message.reply === "function") {
      sent = await message.reply(payload);
    }
  } catch (_) {}
  if (!sent && message?.channel?.send) {
    try {
      sent = await message.channel.send(payload);
    } catch (_) {}
  }
  if (sent) scheduleMessageDeletion(sent, ttl);
  if (message?.deletable) scheduleMessageDeletion(message, ttl);
  return sent;
}

function schedulePartnersDeniedDeleteReply(interaction, ttlMs = EPHEMERAL_TTL_SHORT_MS) {
  const t = Number(ttlMs) > 0 ? ttlMs : EPHEMERAL_TTL_SHORT_MS;
  const timer = setTimeout(() => {
    interaction?.deleteReply?.().catch(() => {});
  }, t);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  partnersChatChannelId,
  isChannelOrThreadUnderPartnersChat,
  isPartnerPmDailyCommandsThread,
  isOpenPartnershipTicketChannel,
  partnersChatPartnerCommandDeniedReplyContent,
  partnershipPublishChannelCommandsDeniedReplyContent,
  PARTNERSHIP_PUBLISH_CHANNEL_ALLOWED_COMMANDS,
  isPartnershipPublishChannel,
  sendPartnersChatDeniedPrefixCleanup,
  schedulePartnersDeniedDeleteReply,
  resolvePmCommandsThreadId,
  resolvePmCommandsChannelMention,
  formatChannelMentionFromChannel,
};