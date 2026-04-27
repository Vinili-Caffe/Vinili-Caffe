const { ChannelType, PermissionFlagsBits, ChannelFlagsBitField } = require("discord.js");
const IDs = require("../Config/ids");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { broadcastSiteRealtime } = require("./siteSuggestionsBroadcast");

const FORUM_FETCH_LIMIT = 50;
const THREAD_MESSAGE_LIMIT = 50;
const WEBSITE_FORUM_WEBHOOK_NAME = "VC Website Forum Bridge";
const FORUM_MAX_MEDIA_FILES = 6;
let cachedForumWebhookByChannel = new Map();

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

function sanitizeFileName(name, fallback = "media.bin") {
  const safe = String(name || "")
    .replace(/[\r\n\0]/g, "")
    .trim()
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return safe || fallback;
}

function normalizeIncomingMedia(files) {
  if (!Array.isArray(files) || !files.length) return [];
  return files
    .slice(0, FORUM_MAX_MEDIA_FILES)
    .map((f, idx) => {
      if (!f || typeof f !== "object") return null;
      const rawData = String(f.data || "");
      if (!rawData) return null;
      let payload = rawData;
      const commaIdx = rawData.indexOf(",");
      if (rawData.startsWith("data:") && commaIdx >= 0) payload = rawData.slice(commaIdx + 1);
      let buffer = null;
      try {
        buffer = Buffer.from(payload, "base64");
      } catch {
        buffer = null;
      }
      if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
      const name = sanitizeFileName(f.name, `media_${idx + 1}.bin`);
      return {
        attachment: buffer,
        name,
      };
    })
    .filter(Boolean);
}

function normalizeTagIds(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? String(raw).split(",")
      : [];
  return Array.from(
    new Set(
      arr
        .map((x) => String(x || "").trim())
        .filter((x) => /^\d{17,22}$/.test(x)),
    ),
  );
}

function isHighStaffMember(member) {
  const roleId = String(IDs.roles?.HighStaff || "").trim();
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function buildAuthorPayload(user, member = null) {
  const uid = String(user?.id || member?.id || "").trim();
  let avatarUrl = "";
  if (member?.displayAvatarURL && typeof member.displayAvatarURL === "function") {
    avatarUrl = String(member.displayAvatarURL({ size: 128 }) || "");
  }
  if (!avatarUrl && uid && user?.avatar) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.${String(user.avatar).startsWith("a_") ? "gif" : "png"}?size=128`;
  }
  return {
    id: uid,
    username: String(user?.username || member?.user?.username || "Utente"),
    avatarUrl,
  };
}

async function getOrCreateForumWebhook(forumChannel) {
  const cid = String(forumChannel?.id || "").trim();
  if (!cid) return null;
  if (cachedForumWebhookByChannel.has(cid)) {
    return cachedForumWebhookByChannel.get(cid) || null;
  }
  const me = forumChannel.guild?.members?.me || null;
  const canManageWebhooks = Boolean(
    me &&
      forumChannel
        .permissionsFor(me)
        ?.has(PermissionFlagsBits.ManageWebhooks),
  );
  if (!canManageWebhooks) return null;
  const existing = await forumChannel.fetchWebhooks().catch(() => null);
  let hook = null;
  if (existing) {
    hook =
      existing.find((w) => String(w.name || "") === WEBSITE_FORUM_WEBHOOK_NAME) ||
      existing.find((w) => Boolean(w && w.token)) ||
      null;
  }
  if (!hook) {
    hook = await forumChannel
      .createWebhook({
        name: WEBSITE_FORUM_WEBHOOK_NAME,
        reason: "Website forum bridge webhook",
      })
      .catch(() => null);
  }
  if (hook && hook.token) {
    cachedForumWebhookByChannel.set(cid, hook);
    return hook;
  }
  return null;
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
  const pinnedFlag = ChannelFlagsBitField?.Flags?.Pinned;
  const pinned = pinnedFlag != null && t?.flags?.has ? Boolean(t.flags.has(pinnedFlag)) : false;
  return {
    id: String(t.id || ""),
    title: String(t.name || "Discussione"),
    archived: Boolean(t.archived),
    pinned,
    locked: Boolean(t.locked),
    messageCount: Number(t.messageCount || 0),
    memberCount: Number(t.memberCount || 0),
    createdAt,
    lastActivityAt: archivedAt || createdAt,
    ownerId: String(t.ownerId || ""),
    appliedTagIds: Array.isArray(t.appliedTags) ? t.appliedTags.map((id) => String(id)) : [],
  };
}

async function resolveThreadLastMeta(thread) {
  if (!thread || !thread.messages || typeof thread.messages.fetch !== "function") {
    return { preview: "", createdAt: null };
  }
  const fetched = await thread.messages.fetch({ limit: 1 }).catch(() => null);
  if (!fetched || fetched.size === 0) return { preview: "", createdAt: null };
  const msg = fetched.first();
  const text = String(msg?.content || "").trim();
  const createdAt = msg?.createdAt ? new Date(msg.createdAt).toISOString() : null;
  if (!text) return { preview: "", createdAt };
  return { preview: text.slice(0, 160), createdAt };
}

function serializeForumMessage(msg) {
  const m = msg && typeof msg === "object" ? msg : {};
  const content = String(m.content || "").trim();
  const member = m.member && typeof m.member === "object" ? m.member : null;
  const mentionUsers = m?.mentions?.users;
  const mentions = mentionUsers && typeof mentionUsers.values === "function"
    ? Array.from(mentionUsers.values()).map((u) => ({
      id: String(u?.id || ""),
      username: String(u?.username || ""),
    })).filter((u) => u.id && u.username)
    : [];
  return {
    id: String(m.id || ""),
    content,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
    author: buildAuthorPayload(m.author, member),
    attachments: Array.isArray(m.attachments)
      ? m.attachments.map((a) => ({
        id: String(a?.id || ""),
        name: String(a?.name || ""),
        url: String(a?.url || ""),
        contentType: String(a?.contentType || ""),
      }))
      : [],
    mentions,
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
      const last = await resolveThreadLastMeta(thread);
      row.lastMessagePreview = last.preview;
      row.lastMessageAt = last.createdAt;
      const ownerId = String(row.ownerId || "").trim();
      if (ownerId && /^\d{17,22}$/.test(ownerId)) {
        const ownerMember =
          resolved.guild.members.cache.get(ownerId) ||
          (await resolved.guild.members.fetch(ownerId).catch(() => null));
        if (ownerMember?.user) {
          row.owner = buildAuthorPayload(ownerMember.user, ownerMember);
        } else {
          row.owner = { id: ownerId, username: "Utente", avatarUrl: "" };
        }
      } else {
        row.owner = { id: "", username: "Utente", avatarUrl: "" };
      }
      return row;
    }),
  );

  const availableTags = Array.isArray(forum.availableTags)
    ? forum.availableTags.map((tag) => ({
      id: String(tag?.id || ""),
      name: String(tag?.name || "Tag"),
      moderated: Boolean(tag?.moderated),
      emoji:
        tag?.emoji?.name || tag?.emoji?.id
          ? {
            name: String(tag?.emoji?.name || ""),
            id: String(tag?.emoji?.id || ""),
          }
          : null,
    }))
    : [];
  return { ok: true, status: 200, forumId: String(forum.id), threads: items, availableTags };
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

async function getSiteForumThreadMessagesAuthed(client, { accessToken, threadId, limit = THREAD_MESSAGE_LIMIT, before = "" } = {}) {
  const base = await getSiteForumThreadMessages(client, { threadId, limit, before });
  if (!base?.ok) return base;
  const auth = await resolveWebsiteGuildMember(client, accessToken);
  if (!auth?.ok || !auth.member) {
    return {
      ...base,
      permissions: {
        canEditTitle: false,
        canEditContent: false,
        canArchive: false,
        canLock: false,
      },
    };
  }
  const threadOwnerId = String(base.thread?.ownerId || "").trim();
  const memberId = String(auth.member.id || "").trim();
  const isOwner = Boolean(threadOwnerId && memberId && threadOwnerId === memberId);
  const isHighStaff = isHighStaffMember(auth.member);
  return {
    ...base,
    permissions: {
      canEditTitle: Boolean(isHighStaff || isOwner),
      canEditContent: Boolean(isHighStaff),
      canArchive: Boolean(isHighStaff),
      canLock: Boolean(isHighStaff),
    },
  };
}

async function createSiteForumThread(client, { accessToken, title, content, media = [], tagIds = [] }) {
  const resolvedForum = await resolveForumChannel(client);
  if (!resolvedForum.ok) return resolvedForum;
  const auth = await resolveWebsiteGuildMember(client, accessToken);
  if (!auth.ok) return auth;
  const forum = resolvedForum.channel;
  const member = auth.member;
  const cleanTitle = sanitizeText(title, 100);
  const cleanContent = sanitizeText(content, 2000);
  const mediaFiles = normalizeIncomingMedia(media);
  const selectedTagIds = normalizeTagIds(tagIds);
  if (cleanTitle.length < 3) {
    return { ok: false, status: 400, error: "title_too_short", message: "Titolo troppo corto (min 3 caratteri)." };
  }
  if (cleanContent.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Descrizione troppo corta (min 2 caratteri)." };
  }
  if (!selectedTagIds.length) {
    return { ok: false, status: 400, error: "tag_required", message: "Seleziona almeno un tag." };
  }
  const perms = forum.permissionsFor(member);
  if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per scrivere nel forum." };
  }
  const authorName =
    String(member.user?.username || "Utente").slice(0, 80) ||
    "Utente";
  const avatarUrl = String(member.displayAvatarURL?.({ size: 128 }) || buildAuthorPayload(member.user).avatarUrl || "") || null;
  let created = null;
  const hook = await getOrCreateForumWebhook(forum);
  if (hook && hook.token && selectedTagIds.length === 0) {
    const sent = await hook
      .send({
        content: cleanContent || null,
        threadName: cleanTitle,
        username: authorName,
        avatarURL: avatarUrl,
        ...(mediaFiles.length ? { files: mediaFiles } : {}),
        allowedMentions: { parse: [] },
      })
      .catch(() => null);
    const tid = String(sent?.channelId || "").trim();
    if (tid) {
      created = forum.threads.cache.get(tid) || (await forum.threads.fetch(tid).catch(() => null));
    }
  }
  if (!created) {
    created = await forum.threads
      .create({
        name: cleanTitle,
        message: { content: cleanContent || null, ...(mediaFiles.length ? { files: mediaFiles } : {}) },
        ...(selectedTagIds.length ? { appliedTags: selectedTagIds } : {}),
        reason: `Website forum thread by ${member.user?.tag || member.id}`,
      })
      .catch(() => null);
  }
  if (!created) {
    return { ok: false, status: 500, error: "create_failed", message: "Non sono riuscito a creare la discussione." };
  }
  if (created && selectedTagIds.length && typeof created.setAppliedTags === "function") {
    await created.setAppliedTags(selectedTagIds, "Website forum tags").catch(() => null);
  }
  broadcastSiteRealtime({ type: "forum_changed", at: new Date().toISOString(), threadId: String(created.id) });
  return { ok: true, status: 200, thread: serializeThread(created) };
}

async function createSiteForumMessage(client, { accessToken, threadId, content, media = [] }) {
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
  const mediaFiles = normalizeIncomingMedia(media);
  if (cleanContent.length < 1 && !mediaFiles.length) {
    return { ok: false, status: 400, error: "content_too_short", message: "Messaggio vuoto." };
  }
  const perms = thread.permissionsFor(member);
  if (!perms || !perms.has(PermissionFlagsBits.SendMessagesInThreads)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per scrivere in questa discussione." };
  }
  const authorName =
    String(member.user?.username || "Utente").slice(0, 80) ||
    "Utente";
  const avatarUrl = String(member.displayAvatarURL?.({ size: 128 }) || buildAuthorPayload(member.user).avatarUrl || "") || null;
  let msg = null;
  const hook = await getOrCreateForumWebhook(forum);
  if (hook && hook.token) {
    msg = await hook
      .send({
        content: cleanContent || null,
        threadId: thread.id,
        username: authorName,
        avatarURL: avatarUrl,
        ...(mediaFiles.length ? { files: mediaFiles } : {}),
        allowedMentions: { parse: [] },
      })
      .catch(() => null);
  }
  if (!msg) {
    msg = await thread.send({ content: cleanContent || null, ...(mediaFiles.length ? { files: mediaFiles } : {}) }).catch(() => null);
  }
  if (!msg) {
    return { ok: false, status: 500, error: "send_failed", message: "Non sono riuscito a inviare il messaggio." };
  }
  broadcastSiteRealtime({ type: "forum_changed", at: new Date().toISOString(), threadId: tid, messageId: String(msg.id) });
  return { ok: true, status: 200, message: serializeForumMessage(msg) };
}

async function resolveThreadStarterMessage(thread) {
  if (!thread) return null;
  if (typeof thread.fetchStarterMessage === "function") {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (starter) return starter;
  }
  const fetched = await thread.messages.fetch({ limit: 1, after: "0" }).catch(() => null);
  if (!fetched || fetched.size === 0) return null;
  return fetched.first() || null;
}

async function updateSiteForumThread(client, { accessToken, threadId, title, content, archived, locked }) {
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

  const isOwner = String(thread.ownerId || "") === String(member.id || "");
  const isHighStaff = isHighStaffMember(member);
  if (!isOwner && !isHighStaff) {
    return { ok: false, status: 403, error: "forbidden", message: "Non puoi modificare questa discussione." };
  }

  const nextTitleRaw = title == null ? null : sanitizeText(title, 100);
  const nextContentRaw = content == null ? null : sanitizeText(content, 2000);
  const nextArchived = archived == null ? null : Boolean(archived);
  const nextLocked = locked == null ? null : Boolean(locked);

  if (nextTitleRaw != null && nextTitleRaw.length < 3) {
    return { ok: false, status: 400, error: "title_too_short", message: "Titolo troppo corto (min 3 caratteri)." };
  }
  if (nextContentRaw != null && nextContentRaw.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Testo troppo corto (min 2 caratteri)." };
  }

  if (!isHighStaff && (nextContentRaw != null || nextArchived != null || nextLocked != null)) {
    return { ok: false, status: 403, error: "forbidden_owner_scope", message: "Sul tuo thread puoi modificare solo il titolo." };
  }

  if (nextTitleRaw != null) {
    await thread.setName(nextTitleRaw, `Website forum update by ${member.user?.tag || member.id}`).catch(() => null);
  }
  if (isHighStaff && nextArchived != null) {
    await thread.setArchived(nextArchived, `Website forum update by ${member.user?.tag || member.id}`).catch(() => null);
  }
  if (isHighStaff && nextLocked != null) {
    await thread.setLocked(nextLocked, `Website forum update by ${member.user?.tag || member.id}`).catch(() => null);
  }
  if (isHighStaff && nextContentRaw != null) {
    const starter = await resolveThreadStarterMessage(thread);
    if (starter && typeof starter.edit === "function") {
      await starter.edit({ content: nextContentRaw }).catch(() => null);
    }
  }

  const refetch = forum.threads.cache.get(tid) || (await forum.threads.fetch(tid).catch(() => thread));
  broadcastSiteRealtime({ type: "forum_changed", at: new Date().toISOString(), threadId: tid });
  return { ok: true, status: 200, thread: serializeThread(refetch || thread) };
}

module.exports = {
  getSiteForumThreads,
  getSiteForumThreadMessages,
  getSiteForumThreadMessagesAuthed,
  createSiteForumThread,
  createSiteForumMessage,
  updateSiteForumThread,
};