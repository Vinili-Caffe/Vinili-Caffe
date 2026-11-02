/** Ticket dal sito: menzioni di utenti, ruoli e canali (chi si può menzionare e cosa si vede). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ChannelType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { SiteWebTicketMessage } = require("../../features/tickets/data/siteWebTicketSchemas") as typeof import("../../features/tickets/data/siteWebTicketSchemas");
const { sanitizeDiscordChannelName } = require("../../Utils/Discord/discordDisplayName") as typeof import("../../Utils/Discord/discordDisplayName");
const { displayNameForMember, avatarForMember, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { resolveStaffRoleForMember, resolveCommunityRoleForMember, resolveClientGuild, listAddedUsers } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");

let channelMentionCache = { guildId: "", at: 0, channels: [] };
const CHANNEL_MENTION_CACHE_TTL_MS = 20_000;

function collectMentionUserIdsFromMessages(messages?) {
  const ids = new Set();
  const re = /<@!?(\d{5,32})>/g;
  for (const msg of Array.isArray(messages) ? messages : []) {
    const text = String(msg?.content || "");
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) ids.add(String(m[1]));
    }
  }
  return [...ids];
}

function parseMentionTargets(content?) {
  const userIds = new Set();
  const roleIds = new Set();
  const re = /<@!?(\d{5,32})>|<@&(\d{5,32})>/g;
  let m;
  const s = String(content || "");
  while ((m = re.exec(s))) {
    if (m[1]) userIds.add(String(m[1]));
    if (m[2]) roleIds.add(String(m[2]));
  }
  return { userIds: [...userIds], roleIds: [...roleIds] };
}

function collectTicketParticipantUserIds(ticket?, { messageAuthorIds = [] } = {}) {
  const ids = new Set();
  const owner = String(ticket?.userId || "").trim();
  if (owner) ids.add(owner);
  const claimer = String(ticket?.claimedBy || "").trim();
  if (claimer) ids.add(claimer);
  for (const u of listAddedUsers(ticket)) {
    if (u?.id) ids.add(String(u.id));
  }
  for (const raw of messageAuthorIds) {
    const id = String(raw || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function listTicketMessageAuthorIds(ticketId?) {
  const tid = ticketId && mongoose.isValidObjectId(ticketId) ? ticketId : null;
  if (!tid) return [];
  const rows = await SiteWebTicketMessage.find({ ticketId: tid, authorKind: { $ne: "system" } })
    .select("authorId")
    .lean()
    .catch(() => []);
  return [...new Set(rows.map((r?) => String(r?.authorId || "").trim()).filter(Boolean))];
}

async function collectTicketParticipantRoleIds(guild?, userIds?) {
  const roleIds = new Set();
  if (!guild || !userIds?.size) return roleIds;
  const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
  for (const uid of userIds) {
    const member = await getGuildMemberCached(guild, uid).catch(() => null);
    if (!member?.roles?.cache) continue;
    for (const role of member.roles.cache.values()) {
      const rid = String(role?.id || "").trim();
      if (!rid || rid === String(guild.id)) continue;
      roleIds.add(rid);
    }
  }
  return roleIds;
}

async function resolveTicketMentionScope(client?, ticket?, { extraUserIds = [] } = {}) {
  const guildId = String(ticket?.guildId || resolveGuildId(client) || "").trim();
  const guild = guildId ? await resolveClientGuild(client, guildId) : null;
  const messageAuthorIds = ticket?._id ? await listTicketMessageAuthorIds(ticket._id) : [];
  const allowedUserIds = collectTicketParticipantUserIds(ticket, { messageAuthorIds });
  for (const raw of extraUserIds) {
    const id = String(raw || "").trim();
    if (id) allowedUserIds.add(id);
  }
  const allowedRoleIds = await collectTicketParticipantRoleIds(guild, allowedUserIds);
  return { guild, allowedUserIds, allowedRoleIds };
}

function memberCanViewChannelId(member?, guild?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!member || !guild || !cid) return false;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  } catch {
      }
  const ch = guild.channels?.cache?.get?.(cid) || null;
  if (!ch) return false;
  try {
    return Boolean(ch.permissionsFor?.(member)?.has?.(PermissionFlagsBits.ViewChannel));
  } catch {
    return false;
  }
}

function memberMentionRow(member?) {
  if (!member || member.user?.bot) return null;
  const id = String(member.id || member.user?.id || "").trim();
  if (!id) return null;
  const role =
    resolveStaffRoleForMember(member, member?.guild?.id) || resolveCommunityRoleForMember(member);
  return {
    type: "user",
    id,
    name: displayNameForMember(member),
    username: String(member.user?.username || "").trim() || null,
    avatarUrl: avatarForMember(member) || "",
    markup: `<@${id}>`,
    roleId: role?.id || null,
    roleName: role?.name || null,
    roleKey: role?.key || null,
  };
}

function channelTypeMeta(type?) {
  const t = Number(type);
  if (t === ChannelType.GuildVoice || t === 2) return { rank: 4, label: "Vocale", icon: "voice" };
  if (t === ChannelType.GuildStageVoice || t === 13) return { rank: 5, label: "Palco", icon: "stage" };
  if (t === ChannelType.GuildForum || t === 15) return { rank: 2, label: "Forum", icon: "forum" };
  if (t === ChannelType.GuildMedia || t === 16) return { rank: 3, label: "Media", icon: "media" };
  if (t === ChannelType.AnnouncementThread || t === 10) return { rank: 6, label: "Thread", icon: "thread" };
  if (t === ChannelType.PublicThread || t === 11) return { rank: 6, label: "Thread", icon: "thread" };
  if (t === ChannelType.PrivateThread || t === 12) return { rank: 7, label: "Thread privato", icon: "thread" };
  if (t === ChannelType.GuildAnnouncement || t === 5) return { rank: 1, label: "Annunci", icon: "news" };
  return { rank: 0, label: "Testo", icon: "text" };
}

function isThreadChannelType(type?) {
  const t = Number(type);
  return t === 10 || t === 11 || t === 12;
}

async function listGuildMentionChannels(client?, guildId?) {
  const gid = String(guildId || "").trim();
  const now = Date.now();
  if (
    channelMentionCache.guildId === gid &&
    now - channelMentionCache.at < CHANNEL_MENTION_CACHE_TTL_MS &&
    Array.isArray(channelMentionCache.channels) &&
    channelMentionCache.channels.length
  ) {
    return channelMentionCache.channels;
  }

  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  if (!guild?.channels) return [];

  try {
    if (typeof guild.channels.fetch === "function") {
      await guild.channels.fetch();
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] channels fetch:", err?.message || err);
  }

  const byId = new Map();
  const put = (ch?) => {
    if (!ch?.id) return;
    const type = Number(ch.type);
    if (type === ChannelType.GuildCategory || type === 4) return;
    if (type === ChannelType.DM || type === 1 || type === ChannelType.GroupDM || type === 3) return;
    byId.set(String(ch.id), ch);
  };

  if (guild.channels.cache) {
    for (const ch of guild.channels.cache.values()) {
      put(ch);
      const nested = ch.threads?.cache;
      if (nested && typeof nested.values === "function") {
        for (const th of nested.values()) put(th);
      }
    }
  }

  try {
    if (typeof guild.channels.fetchActiveThreads === "function") {
      const active = await guild.channels.fetchActiveThreads();
      const threads = active?.threads;
      if (threads && typeof threads.values === "function") {
        for (const th of threads.values()) put(th);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] active threads:", err?.message || err);
  }

  const rows = [];
  for (const ch of byId.values()) {
    const type = Number(ch.type);
    const meta = channelTypeMeta(type);
    const directParentId = ch.parentId ? String(ch.parentId) : "";
    const directParent = directParentId ? guild.channels.cache.get(directParentId) : null;
    const thread = isThreadChannelType(type);
    const category =
      directParent && Number(directParent.type) === 4
        ? directParent
        : directParent?.parentId
          ? guild.channels.cache.get(String(directParent.parentId))
          : null;
    const parentLabel = thread
      ? String(directParent?.name || "").trim()
      : String(category?.name || "").trim();
    const catPos = Number(
      category?.rawPosition ?? category?.position ?? (thread ? directParent?.rawPosition : -1),
    );
    const pos = Number(ch.rawPosition ?? ch.position);
    rows.push({
      type: "channel",
      id: String(ch.id),
      name: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
      markup: `<#${ch.id}>`,
      channelType: type,
      channelKind: meta.label,
      channelIcon: meta.icon,
      parentName: parentLabel || null,
      _cat: Number.isFinite(catPos) ? catPos : thread ? 0 : -1,
      _parent: directParentId,
      _kind: meta.rank,
      _pos: Number.isFinite(pos) ? pos : 0,
    });
  }

  channelMentionCache = { guildId: gid, at: now, channels: rows };
  return rows;
}

export = { collectMentionUserIdsFromMessages, parseMentionTargets, listTicketMessageAuthorIds, resolveTicketMentionScope, memberCanViewChannelId, memberMentionRow, listGuildMentionChannels };
