const IDs = require("../Config/ids");
const { SiteInAppNotification } = require("../../Schemas/Community/communitySchemas");
const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");

function resolveWebsiteForumChannelId(client) {
  return String(client?.config?.websiteForum?.channelId || IDs.channels?.forum || "").trim();
}

function isForumThreadMessage(message, client) {
  if (!message?.guild || !message?.channel || !message?.id) return false;
  const forumId = resolveWebsiteForumChannelId(client);
  if (!forumId) return false;
  return String(message.channel?.parentId || "") === forumId;
}

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function buildMentionDedupeKey(messageId, userId) {
  return `forum_mention:${String(messageId || "").trim()}:${String(userId || "").trim()}`;
}

function buildMentionBody(message) {
  const authorName = String(message?.author?.username || "Un utente");
  const threadName = String(message?.channel?.name || "una discussione");
  return `${authorName} ti ha menzionato in "${threadName}".`;
}

function buildMentionOpenUrl(message) {
  const threadId = String(message?.channelId || "").trim();
  const messageId = String(message?.id || "").trim();
  if (!threadId || !messageId) return "/forum/";
  return `/forum/?thread=${encodeURIComponent(threadId)}&message=${encodeURIComponent(messageId)}`;
}

function extractMentionedHumanUserIds(message) {
  const out = [];
  const seen = new Set();
  const authorId = normalizeUserId(message?.author?.id);
  const users = message?.mentions?.users;
  if (!users || typeof users.values !== "function") return out;
  for (const user of users.values()) {
    const uid = normalizeUserId(user?.id);
    if (!uid || uid === authorId) continue;
    if (user?.bot) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

async function emitNotificationsChangedSafe() {
  try {
    broadcastSiteNotificationsChanged();
  } catch {}
}

async function upsertForumMentionNotification(message, targetUserId) {
  const userId = normalizeUserId(targetUserId);
  if (!userId) return false;
  const guildId = String(message?.guildId || message?.guild?.id || "").trim() || "global";
  const dedupeKey = buildMentionDedupeKey(message?.id, userId);
  const existing = await SiteInAppNotification.findOne({ userId, dedupeKey }).select("_id").lean().catch(() => null);
  await SiteInAppNotification.findOneAndUpdate(
    { userId, dedupeKey },
    {
      $setOnInsert: {
        guildId,
        userId,
        dedupeKey,
      },
      $set: {
        title: "Menzione nel forum",
        body: buildMentionBody(message),
        kind: "info",
        openUrl: buildMentionOpenUrl(message),
      },
    },
    { upsert: true, new: true },
  )
    .select("_id")
    .lean()
    .catch(() => null);
  return !Boolean(existing?._id);
}

async function syncForumMentionNotificationsForMessage(message, client) {
  if (!isForumThreadMessage(message, client)) return;
  if (message?.author?.bot || message?.webhookId || message?.system) return;
  const mentionedIds = extractMentionedHumanUserIds(message);
  const messageId = String(message?.id || "").trim();
  if (!messageId) return;

  let changed = false;
  for (let i = 0; i < mentionedIds.length; i += 1) {
    const created = await upsertForumMentionNotification(message, mentionedIds[i]);
    if (created) changed = true;
  }

  const removeFilter = {
    dedupeKey: { $regex: `^forum_mention:${messageId}:` },
  };
  if (mentionedIds.length > 0) {
    removeFilter.userId = { $nin: mentionedIds };
  }
  const removeRes = await SiteInAppNotification.deleteMany(removeFilter).catch(() => null);
  if (Number(removeRes?.deletedCount || 0) > 0) changed = true;

  if (changed) await emitNotificationsChangedSafe();
}

async function clearForumMentionNotificationsForMessage(messageOrIds, client) {
  const messageId = String(messageOrIds?.id || messageOrIds?.messageId || messageOrIds || "").trim();
  if (!/^\d{17,22}$/.test(messageId)) return;
  if (messageOrIds && typeof messageOrIds === "object" && !isForumThreadMessage(messageOrIds, client)) return;
  const res = await SiteInAppNotification.deleteMany({
    dedupeKey: { $regex: `^forum_mention:${messageId}:` },
  }).catch(() => null);
  if (Number(res?.deletedCount || 0) > 0) await emitNotificationsChangedSafe();
}

module.exports = {
  syncForumMentionNotificationsForMessage,
  clearForumMentionNotificationsForMessage,
};