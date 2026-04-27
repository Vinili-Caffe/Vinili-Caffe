const { ChannelType, PermissionFlagsBits } = require("discord.js");
const IDs = require("../Config/ids");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { broadcastSiteRealtime } = require("./siteSuggestionsBroadcast");

const FORUM_FETCH_LIMIT = 50;
const THREAD_MESSAGE_LIMIT = 50;

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function resolveForumChannelId(client) {
  return String(client?.config?.websiteForum?.channelId || IDs.channels?.forum || "").trim();
}

function sanitizeText(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, Math.max(1, Number(maxLen) || 1));
}

function buildAuthorPayload(user) {
  const uid = String(user?.id || "").trim();
  return {
    id: uid,
    username: String(user?.globalName || user?.username || "Utente"),
    avatarUrl: uid && user?.avatar
      ? `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.${String(user.avatar).startsWith("a_") ? "gif" : "png"}?size=128`
      : "",
  };
}

async function resolveForumChannel(client) {
  const guildId = resolveGuildId(client);
  const forumId = resolveForumChannelId(client);
  if (!guildId || !forumId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Forum non configurato." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }
  const channel = guild.channels.cache.get(forumId) || (await guild.channels.fetch(forumId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildForum) {
    return { ok: false, status: 503, error: "forum_unavailable", message: "Canale forum non disponibile." };
  }
  return { ok: true, guild, channel };
}

function serializeThread(thread) {
  const t = thread && typeof thread === "object" ? thread : {};
  const createdAt = t.createdAt ? new Date(t.createdAt).toISOString() : null;
  const archivedAt = t.archiveTimestamp ? new Date(t.archiveTimestamp).toISOString() : null;
  return {
    id: String(t.id || ""),
    title: String(t.name || "Discussione"),
    archived: Boolean(t.archived),
    locked: Boolean(t.locked),
    messageCount: Number(t.messageCount || 0),
    memberCount: Number(t.memberCount || 0),
    createdAt,
    lastActivityAt: archivedAt || createdAt,
    ownerId: String(t.ownerId || ""),
  };
}

async function resolveThreadLastPreview(thread) {
  if (!thread || !thread.messages || typeof thread.messages.fetch !== "function") return "";
  const fetched = await thread.messages.fetch({ limit: 1 }).catch(() => null);
  if (!fetched || fetched.size === 0) return "";
  const msg = fetched.first();
  const text = String(msg?.content || "").trim();
  if (!text) return "";
  return text.slice(0, 160);
}

function serializeForumMessage(msg) {
  const m = msg && typeof msg === "object" ? msg : {};
  const content = String(m.content || "").trim();
  return {
    id: String(m.id || ""),
    content,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
    author: buildAuthorPayload(m.author),
  };
}

async function getSiteForumThreads(client, { limit = FORUM_FETCH_LIMIT } = {}) {
  const resolved = await resolveForumChannel(client);
  if (!resolved.ok) return resolved;
  const forum = resolved.channel;

  const active = await forum.threads.fetchActive().catch(() => null);
  const archived = await forum.threads.fetchArchived({ type: "public", fetchAll: true }).catch(() => null);

  const byId = new Map();
  const putCollection = (col) => {
    if (!col || !col.threads) return;
    for (const thread of col.threads.values()) {
      if (!thread || !thread.id) continue;
      byId.set(String(thread.id), thread);
    }
  };
  putCollection(active);
  putCollection(archived);

  const source = Array.from(byId.values())
    .filter((t) => t && t.type === ChannelType.PublicThread)
    .sort((a, b) => {
      const aa = Number(new Date(a.archiveTimestamp || a.createdAt || 0).getTime() || 0);
      const bb = Number(new Date(b.archiveTimestamp || b.createdAt || 0).getTime() || 0);
      return bb - aa;
    })
    .slice(0, Math.max(1, Math.min(200, Number(limit) || FORUM_FETCH_LIMIT)));
  const items = await Promise.all(
    source.map(async (thread) => {
      const row = serializeThread(thread);
      row.lastMessagePreview = await resolveThreadLastPreview(thread);
      return row;
    }),
  );

  return { ok: true, status: 200, forumId: String(forum.id), threads: items };
}

async function getSiteForumThreadMessages(client, { threadId, limit = THREAD_MESSAGE_LIMIT, before = "" } = {}) {
  const resolved = await resolveForumChannel(client);
  if (!resolved.ok) return resolved;
  const forum = resolved.channel;
  const tid = String(threadId || "").trim();
  if (!/^\d{17,22}$/.test(tid)) {
    return { ok: false, status: 400, error: "invalid_thread", message: "Thread non valido." };
  }
  const thread = forum.threads.cache.get(tid) || (await forum.threads.fetch(tid).catch(() => null));
  if (!thread || thread.parentId !== forum.id) {
    return { ok: false, status: 404, error: "thread_not_found", message: "Discussione non trovata." };
  }
  const fetchOptions = {
    limit: Math.max(1, Math.min(100, Number(limit) || THREAD_MESSAGE_LIMIT)),
  };
  const beforeId = String(before || "").trim();
  if (/^\d{17,22}$/.test(beforeId)) fetchOptions.before = beforeId;
  const fetched = await thread.messages.fetch(fetchOptions).catch(() => null);
  const rows = fetched
    ? Array.from(fetched.values()).sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0)).map(serializeForumMessage)
    : [];
  const oldestId = rows.length ? String(rows[0].id || "") : "";
  let hasMore = false;
  if (oldestId) {
    const older = await thread.messages.fetch({ limit: 1, before: oldestId }).catch(() => null);
    hasMore = Boolean(older && older.size > 0);
  }
  return {
    ok: true,
    status: 200,
    thread: serializeThread(thread),
    messages: rows,
    paging: { before: oldestId || null, hasMore },
  };
}

async function createSiteForumThread(client, { accessToken, title, content }) {
  const resolvedForum = await resolveForumChannel(client);
  if (!resolvedForum.ok) return resolvedForum;
  const auth = await resolveWebsiteGuildMember(client, accessToken);
  if (!auth.ok) return auth;
  const forum = resolvedForum.channel;
  const member = auth.member;
  const cleanTitle = sanitizeText(title, 100);
  const cleanContent = sanitizeText(content, 2000);
  if (cleanTitle.length < 3) {
    return { ok: false, status: 400, error: "title_too_short", message: "Titolo troppo corto (min 3 caratteri)." };
  }
  if (cleanContent.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Messaggio troppo corto." };
  }
  const perms = forum.permissionsFor(member);
  if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per scrivere nel forum." };
  }
  const created = await forum.threads.create({
    name: cleanTitle,
    message: { content: cleanContent },
    reason: `Website forum thread by ${member.user?.tag || member.id}`,
  }).catch(() => null);
  if (!created) {
    return { ok: false, status: 500, error: "create_failed", message: "Non sono riuscito a creare la discussione." };
  }
  broadcastSiteRealtime({ type: "forum_changed", at: new Date().toISOString(), threadId: String(created.id) });
  return { ok: true, status: 200, thread: serializeThread(created) };
}

async function createSiteForumMessage(client, { accessToken, threadId, content }) {
  const resolvedForum = await resolveForumChannel(client);
  if (!resolvedForum.ok) return resolvedForum;
  const auth = await resolveWebsiteGuildMember(client, accessToken);
  if (!auth.ok) return auth;
  const forum = resolvedForum.channel;
  const member = auth.member;
  const tid = String(threadId || "").trim();
  if (!/^\d{17,22}$/.test(tid)) {
    return { ok: false, status: 400, error: "invalid_thread", message: "Thread non valido." };
  }
  const thread = forum.threads.cache.get(tid) || (await forum.threads.fetch(tid).catch(() => null));
  if (!thread || thread.parentId !== forum.id) {
    return { ok: false, status: 404, error: "thread_not_found", message: "Discussione non trovata." };
  }
  const cleanContent = sanitizeText(content, 2000);
  if (cleanContent.length < 1) {
    return { ok: false, status: 400, error: "content_too_short", message: "Messaggio vuoto." };
  }
  const perms = thread.permissionsFor(member);
  if (!perms || !perms.has(PermissionFlagsBits.SendMessagesInThreads)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per scrivere in questa discussione." };
  }
  const msg = await thread.send({ content: cleanContent }).catch(() => null);
  if (!msg) {
    return { ok: false, status: 500, error: "send_failed", message: "Non sono riuscito a inviare il messaggio." };
  }
  broadcastSiteRealtime({ type: "forum_changed", at: new Date().toISOString(), threadId: tid, messageId: String(msg.id) });
  return { ok: true, status: 200, message: serializeForumMessage(msg) };
}

module.exports = {
  getSiteForumThreads,
  getSiteForumThreadMessages,
  createSiteForumThread,
  createSiteForumMessage,
};