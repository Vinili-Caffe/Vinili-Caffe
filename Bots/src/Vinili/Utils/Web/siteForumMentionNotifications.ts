const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { migrateLegacyInAppNotificationsForUser } = require("./siteInAppNotificationsService") as typeof import("./siteInAppNotificationsService");

const NOTIF = SITE_DOCUMENT_TYPE.IN_APP_NOTIFICATION;
const MAX_INBOX_ITEMS = 150;
const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");

function inboxQuery(userId?) {
  return { docType: NOTIF, userId, inAppNotifAggregate: true };
}

function resolveWebsiteForumChannelId(client?) {
  return String(client?.config?.websiteForum?.channelId || IDs.channels?.forum || "").trim();
}

function isForumThreadMessage(message?, client?) {
  if (!message?.guild || !message?.channel || !message?.id) return false;
  const forumId = resolveWebsiteForumChannelId(client);
  if (!forumId) return false;
  return String(message.channel?.parentId || "") === forumId;
}

function normalizeUserId(userId?) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function buildMentionDedupeKey(messageId?, userId?) {
  return `forum_mention:${String(messageId || "").trim()}:${String(userId || "").trim()}`;
}

function buildMentionBody(message?) {
  const authorName = String(message?.author?.username || "Un utente");
  const threadName = String(message?.channel?.name || "una discussione");
  return `${authorName} ti ha menzionato in "${threadName}".`;
}

function buildMentionOpenUrl(message?) {
  const threadId = String(message?.channelId || "").trim();
  const messageId = String(message?.id || "").trim();
  if (!threadId || !messageId) return "/forum/";
  return `/forum/?thread=${encodeURIComponent(threadId)}&message=${encodeURIComponent(messageId)}`;
}

function extractMentionedHumanUserIds(message?) {
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

function escapeRegex(s?) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function emitNotificationsChangedSafe() {
  try {
    broadcastSiteNotificationsChanged();
  } catch {}
}

async function upsertForumMentionNotification(message?, targetUserId?) {
  const userId = normalizeUserId(targetUserId);
  if (!userId) return false;
  await migrateLegacyInAppNotificationsForUser(userId).catch(() => null);
  const guildId = String(message?.guildId || message?.guild?.id || "").trim() || "global";
  const dedupeKey = buildMentionDedupeKey(message?.id, userId);
  const inbox = await SiteDocument.findOne(inboxQuery(userId)).lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const existing = items.find((it?) => String(it.dedupeKey || "") === dedupeKey);
  if (existing?._id) {
    await SiteDocument.updateOne(
      inboxQuery(userId),
      {
        $set: {
          "inAppNotifItems.$[i].title": "Menzione nel forum",
          "inAppNotifItems.$[i].body": buildMentionBody(message),
          "inAppNotifItems.$[i].notifKind": "info",
          "inAppNotifItems.$[i].openUrl": buildMentionOpenUrl(message),
          "inAppNotifItems.$[i].guildId": guildId,
        },
      },
      { arrayFilters: [{ "i._id": existing._id }] },
    ).catch(() => null);
    return false;
  }
  const newItem = {
    _id: new mongoose.Types.ObjectId(),
    guildId,
    title: "Menzione nel forum",
    body: buildMentionBody(message),
    notifKind: "info",
    openUrl: buildMentionOpenUrl(message),
    dedupeKey,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const res = await SiteDocument.findOneAndUpdate(
    inboxQuery(userId),
    {
      $setOnInsert: {
        docType: NOTIF,
        userId,
        guildId: "",
        inAppNotifAggregate: true,
      },
      $push: {
        inAppNotifItems: {
          $each: [newItem],
          $sort: { createdAt: -1 },
          $slice: MAX_INBOX_ITEMS,
        },
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  return Boolean(res);
}

async function syncForumMentionNotificationsForMessage(message?, client?) {
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

  const dedupeRx = new RegExp(`^forum_mention:${escapeRegex(messageId)}:`);
  const itemMatch = { dedupeKey: dedupeRx };
  const base = { docType: NOTIF, inAppNotifAggregate: true, inAppNotifItems: { $elemMatch: itemMatch } };
  const pull = { inAppNotifItems: itemMatch };
  let removeRes;
  if (mentionedIds.length > 0) {
    removeRes = await SiteDocument.updateMany(
      { ...base, userId: { $nin: mentionedIds } },
      { $pull: pull },
    ).catch(() => null);
  } else {
    removeRes = await SiteDocument.updateMany(base, { $pull: pull }).catch(() => null);
  }
  const legacyRemove = await SiteDocument.deleteMany({
    docType: NOTIF,
    inAppNotifAggregate: { $ne: true },
    dedupeKey: dedupeRx,
    ...(mentionedIds.length > 0 ? { userId: { $nin: mentionedIds } } : {}),
  }).catch(() => null);
  if (Number(removeRes?.modifiedCount || 0) > 0 || Number(legacyRemove?.deletedCount || 0) > 0) {
    changed = true;
  }

  if (changed) await emitNotificationsChangedSafe();
}

async function clearForumMentionNotificationsForMessage(messageOrIds?, client?) {
  const messageId = String(messageOrIds?.id || messageOrIds?.messageId || messageOrIds || "").trim();
  if (!/^\d{17,22}$/.test(messageId)) return;
  if (messageOrIds && typeof messageOrIds === "object" && !isForumThreadMessage(messageOrIds, client)) return;
  const dedupeRx = new RegExp(`^forum_mention:${escapeRegex(messageId)}:`);
  const itemMatch = { dedupeKey: dedupeRx };
  const res = await SiteDocument.updateMany(
    { docType: NOTIF, inAppNotifAggregate: true, inAppNotifItems: { $elemMatch: itemMatch } },
    { $pull: { inAppNotifItems: itemMatch } },
  ).catch(() => null);
  const legacy = await SiteDocument.deleteMany({
    docType: NOTIF,
    inAppNotifAggregate: { $ne: true },
    dedupeKey: dedupeRx,
  }).catch(() => null);
  if (Number(res?.modifiedCount || 0) > 0 || Number(legacy?.deletedCount || 0) > 0) {
    await emitNotificationsChangedSafe();
  }
}

export = {
  syncForumMentionNotificationsForMessage,
  clearForumMentionNotificationsForMessage,
};