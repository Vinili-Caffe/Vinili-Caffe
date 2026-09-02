const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { shouldSkipSiteInAppNotif, buildSkipContext } = require("./siteNotifPrefs");

const NOTIF = SITE_DOCUMENT_TYPE.IN_APP_NOTIFICATION;
const MAX_PER_USER = 150;
const DEDUPE_KEY_MAX = 120;

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function normalizeKind(kind) {
  const k = String(kind || "info").trim().toLowerCase();
  if (["vote", "vote_reminder", "success", "info", "review", "mod", "suggestion", "web_ticket", "web_ticket_mention"].includes(k)) return k;
  return "info";
}

const TICKET_ID_RE = /^[a-f0-9]{24}$/i;

function normalizeTicketId(raw) {
  const tid = String(raw || "").trim().toLowerCase();
  return TICKET_ID_RE.test(tid) ? tid : "";
}

function ticketIdFromOpenUrl(openUrl) {
  const raw = String(openUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://www.viniliecaffe.it");
    const hash = String(u.hash || "").replace(/^#/, "").trim().toLowerCase();
    if (TICKET_ID_RE.test(hash)) return hash;
    const q = String(u.searchParams.get("ticketId") || "").trim().toLowerCase();
    if (TICKET_ID_RE.test(q)) return q;
  } catch (_) {
    const m = raw.match(/#([a-f0-9]{24})\b/i);
    if (m) return String(m[1]).toLowerCase();
  }
  return "";
}

function inboxItemMatchesTicket(it, ticketId) {
  const tid = normalizeTicketId(ticketId);
  if (!tid || !it) return false;
  if (normalizeTicketId(it.ticketId) === tid) return true;
  return ticketIdFromOpenUrl(it.openUrl) === tid;
}

function normalizeFromName(raw) {
  return String(raw || "").trim().slice(0, 80);
}

function mergeNotifFromNames(existing, incoming) {
  const next = [];
  const seen = new Set();
  const add = (name) => {
    const s = normalizeFromName(name);
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    next.push(s);
  };
  add(incoming);
  for (const n of Array.isArray(existing) ? existing : []) add(n);
  return next.slice(0, 8);
}

function formatNotifFromNames(names) {
  const list = mergeNotifFromNames(names, "");
  if (!list.length) return "qualcuno";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list[0]} e altri`;
}

function buildCollapsedTicketChatCopy({ count, fromNames, ticketLabel, fallbackTitle, fallbackBody, preview }) {
  const from = formatNotifFromNames(fromNames);
  const rawPreview = String(preview || fallbackBody || "").trim();
  const fromPrefix = from && from !== "qualcuno" ? `${from}: ` : "";
  const text =
    rawPreview && fromPrefix && rawPreview.toLowerCase().startsWith(fromPrefix.toLowerCase())
      ? rawPreview.slice(fromPrefix.length).trim()
      : rawPreview;
  return {
    title: (from !== "qualcuno" ? from : String(fallbackTitle || "Nuovo messaggio").trim()).slice(0, 120),
    body: (text || rawPreview || "Nuovo messaggio").slice(0, 500),
  };
}

const lastDismissPushAt = new Map();

function fireNotifDismissPush(userId, spec = {}) {
  try {
    const uid = normalizeUserId(userId);
    if (!uid) return;
    const key = spec.all === true ? `${uid}:all` : `${uid}:${String(spec.ticketId || spec.id || "").trim() || "x"}`;
    const now = Date.now();
    const prev = Number(lastDismissPushAt.get(key) || 0);
    if (now - prev < 12000) return;
    lastDismissPushAt.set(key, now);
    if (lastDismissPushAt.size > 400) {
      for (const [k, at] of lastDismissPushAt) {
        if (now - Number(at || 0) > 120000) lastDismissPushAt.delete(k);
      }
    }
    const { sendWebPushToUser } = require("./siteWebPushService");
    void sendWebPushToUser(uid, {
      type: "dismiss",
      ticketId: String(spec.ticketId || "").trim(),
      id: String(spec.id || "").trim(),
      all: spec.all === true,
    });
  } catch (_) {}
}

async function saveInboxItems(userId, items) {
  const uid = normalizeUserId(userId);
  if (!uid) return false;
  const merged = mergeItemsSortTrim(items);
  const existing = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (existing) {
    existing.inAppNotifItems = merged;
    try {
      await existing.save();
      return true;
    } catch (err) {
      global.logger?.warn?.("[siteInAppNotifications] inbox save failed:", err?.message || err);
      return false;
    }
  }
  try {
    await SiteDocument.create({
      docType: NOTIF,
      userId: uid,
      guildId: "",
      inAppNotifAggregate: true,
      inAppNotifItems: merged,
    });
    return true;
  } catch (err) {
    if (Number(err?.code) === 11000) {
      const again = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
      if (!again) return false;
      again.inAppNotifItems = mergeItemsSortTrim([...(again.inAppNotifItems || []), ...merged]);
      try {
        await again.save();
        return true;
      } catch (saveErr) {
        global.logger?.warn?.("[siteInAppNotifications] inbox retry save failed:", saveErr?.message || saveErr);
        return false;
      }
    }
    global.logger?.warn?.("[siteInAppNotifications] inbox create failed:", err?.message || err);
    return false;
  }
}

function legacyFlatQuery(userId) {
  return {
    docType: NOTIF,
    userId,
    inAppNotifAggregate: { $ne: true },
  };
}

function inboxQuery(userId) {
  return { docType: NOTIF, userId, inAppNotifAggregate: true };
}

function flatDocToItem(doc) {
  return {
    _id: doc._id,
    guildId: String(doc.guildId || "").trim() || "",
    title: String(doc.title || "").trim().slice(0, 120),
    body: String(doc.body || "").trim().slice(0, 500),
    notifKind: normalizeKind(doc.notifKind || doc.kind),
    openUrl: String(doc.openUrl || "").trim().slice(0, 400),
    dedupeKey: doc.dedupeKey != null ? String(doc.dedupeKey).trim().slice(0, DEDUPE_KEY_MAX) : null,
    readAt: doc.readAt || null,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

function mergeItemsSortTrim(items) {
  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return arr.slice(0, MAX_PER_USER);
}

async function migrateLegacyInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  const legacy = await SiteDocument.find(legacyFlatQuery(uid))
    .sort({ createdAt: 1 })
    .lean()
    .catch(() => []);
  if (!Array.isArray(legacy) || !legacy.length) return;
  const items = mergeItemsSortTrim(
    legacy
      .filter((d) => String(d.title || "").trim() && String(d.body || "").trim())
      .map(flatDocToItem),
  );
  if (!items.length) {
    await SiteDocument.deleteMany({ _id: { $in: legacy.map((d) => d._id) } }).catch(() => null);
    return;
  }
  const legacyIds = legacy.map((d) => d._id);
  let done = false;
  const existing = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (existing) {
    const merged = mergeItemsSortTrim([...(existing.inAppNotifItems || []), ...items]);
    existing.inAppNotifItems = merged;
    done = await existing.save().then(() => true).catch(() => false);
  } else {
    try {
      await SiteDocument.create({
        docType: NOTIF,
        userId: uid,
        guildId: "",
        inAppNotifAggregate: true,
        inAppNotifItems: items,
      });
      done = true;
    } catch (e) {
      if (Number(e?.code) === 11000) {
        const again = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
        if (again) {
          again.inAppNotifItems = mergeItemsSortTrim([...(again.inAppNotifItems || []), ...items]);
          done = await again.save().then(() => true).catch(() => false);
        }
      }
    }
  }
  if (done) await SiteDocument.deleteMany({ _id: { $in: legacyIds } }).catch(() => null);
}

function itemMatchesDedupeWindow(item, dedupeKeyRaw, since) {
  if (!item || String(item.dedupeKey || "") !== dedupeKeyRaw) return false;
  const t = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return t >= since.getTime();
}

function isReminderNotificationKind(kind, title, body) {
  const k = normalizeKind(kind);
  if (k === "vote_reminder" || k === "vote") return true;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  return /promemoria|reminder|puoi votare|pozioni disponibili|puoi tornare in aula/.test(hay);
}

async function pushInboxItemAtomic(userId, newItem, dedupe = null) {
  const uid = normalizeUserId(userId);
  if (!uid || !newItem) return false;
  const dedupeKey = dedupe?.dedupeKey ? String(dedupe.dedupeKey).trim() : "";
  const since = dedupe?.since instanceof Date ? dedupe.since : null;

    await SiteDocument.updateOne(
    inboxQuery(uid),
    {
      $setOnInsert: {
        docType: NOTIF,
        userId: uid,
        guildId: "",
        inAppNotifAggregate: true,
        inAppNotifItems: [],
      },
    },
    { upsert: true },
  ).catch(() => null);

  const filter = { ...inboxQuery(uid) };
  if (dedupeKey && since) {
    filter.$nor = [
      {
        inAppNotifItems: {
          $elemMatch: {
            dedupeKey,
            createdAt: { $gte: since },
          },
        },
      },
    ];
  }
      const res = await SiteDocument.findOneAndUpdate(
    filter,
    {
      $push: {
        inAppNotifItems: {
          $each: [newItem],
          $slice: -MAX_PER_USER,
        },
      },
    },
    { new: true },
  ).catch((err) => {
    global.logger?.warn?.("[siteInAppNotifications] atomic push failed:", err?.message || err);
    return null;
  });
  if (res) return true;

  if (dedupeKey && since) {
    const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    if (items.some((it) => itemMatchesDedupeWindow(it, dedupeKey, since))) return true;
  }

    const inbox = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  const existing = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (dedupeKey && since && existing.some((it) => itemMatchesDedupeWindow(it, dedupeKey, since))) {
    return true;
  }
  return saveInboxItems(uid, [...existing, newItem]);
}

function broadcastInboxChanged() {
  try {
    const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
    broadcastSiteNotificationsChanged();
  } catch (_) {}
}

function fireNotificationPush(userId, { title, body, openUrl, kind, id, ticketId, messageId }, { push = true } = {}) {
  broadcastInboxChanged();
  if (push === false) return;
  try {
    const { sendWebPushToUser } = require("./siteWebPushService");
    void sendWebPushToUser(userId, {
      title,
      body,
      openUrl: openUrl || "",
      kind,
      id: String(id || ""),
      ticketId: String(ticketId || "").trim(),
      messageId: String(messageId || "").trim(),
    });
  } catch (_) {}
}

async function replaceInboxItemByDedupeKey(userId, dedupeKey, patch) {
  const uid = normalizeUserId(userId);
  const key = String(dedupeKey || "").trim();
  if (!uid || !key) return null;
  const now = new Date();
  const inbox = await SiteDocument.findOne({ ...inboxQuery(uid), "inAppNotifItems.dedupeKey": key })
    .select("inAppNotifItems")
    .lean()
    .catch(() => null);
  const existing = (Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : []).find(
    (it) => String(it?.dedupeKey || "") === key,
  );
  let title = patch.title;
  let body = patch.body;
  let msgCount = 1;
  let fromNames = patch.fromName ? mergeNotifFromNames([], patch.fromName) : [];
  if (patch.collapseChat === true) {
    const wasUnread = Boolean(existing && !existing.readAt);
    if (wasUnread) {
      msgCount = Math.min(99, Math.max(1, Number(existing.notifMsgCount) || 1) + 1);
      fromNames = mergeNotifFromNames(existing.notifFromNames, patch.fromName);
    }
    const copy = buildCollapsedTicketChatCopy({
      count: msgCount,
      fromNames,
      ticketLabel: patch.ticketLabel,
      fallbackTitle: patch.title,
      fallbackBody: patch.body,
      preview: patch.preview,
    });
    title = copy.title;
    body = copy.body;
  }
  const $set = {
    "inAppNotifItems.$.title": title,
    "inAppNotifItems.$.body": body,
    "inAppNotifItems.$.openUrl": patch.openUrl,
    "inAppNotifItems.$.notifKind": patch.notifKind,
    "inAppNotifItems.$.guildId": patch.guildId,
    "inAppNotifItems.$.updatedAt": now,
    "inAppNotifItems.$.notifMsgCount": msgCount,
    "inAppNotifItems.$.notifFromNames": fromNames,
  };
  const patchTicketId = normalizeTicketId(patch.ticketId) || ticketIdFromOpenUrl(patch.openUrl);
  if (patchTicketId) $set["inAppNotifItems.$.ticketId"] = patchTicketId;
  if (patch.resetRead !== false) {
    $set["inAppNotifItems.$.readAt"] = null;
    $set["inAppNotifItems.$.createdAt"] = now;
  }
  const out = await SiteDocument.findOneAndUpdate(
    { ...inboxQuery(uid), "inAppNotifItems.dedupeKey": key },
    { $set },
    { new: true },
  ).catch(() => null);
  if (!out) return null;
  const item = (Array.isArray(out.inAppNotifItems) ? out.inAppNotifItems : []).find(
    (it) => String(it?.dedupeKey || "") === key,
  );
  return item?._id
    ? {
        id: String(item._id),
        title: String(item.title || title || ""),
        body: String(item.body || body || ""),
        ticketId: String(item.ticketId || patchTicketId || ""),
      }
    : { id: "", title, body };
}

async function removeInboxItemByDedupeKey(userId, dedupeKey) {
  const uid = normalizeUserId(userId);
  const key = String(dedupeKey || "").trim();
  if (!uid || !key) return false;
  const res = await SiteDocument.updateOne(inboxQuery(uid), {
    $pull: { inAppNotifItems: { dedupeKey: key } },
  }).catch(() => null);
  const changed = Number(res?.modifiedCount ?? res?.nModified ?? 0) > 0;
  if (changed) broadcastInboxChanged();
  return changed;
}

async function enqueueSiteInAppNotification(opts = {}) {
  const userId = normalizeUserId(opts.userId);
  if (!userId) return false;
  await migrateLegacyInAppNotificationsForUser(userId).catch(() => null);
  const guildId = String(opts.guildId || "").trim() || "global";
  const title = String(opts.title || "").trim().slice(0, 120);
  const body = String(opts.body || "").trim().slice(0, 500);
  if (!title || !body) return false;
  const kind = normalizeKind(opts.kind);
  const openUrl = String(opts.openUrl || "").trim().slice(0, 400);
  const ticketId = normalizeTicketId(opts.ticketId) || ticketIdFromOpenUrl(openUrl);
  const messageId = /^[a-f0-9]{24}$/i.test(String(opts.messageId || "").trim())
    ? String(opts.messageId).trim().toLowerCase()
    : "";
  const dedupeKeyRaw = opts.dedupeKey != null ? String(opts.dedupeKey).trim().slice(0, DEDUPE_KEY_MAX) : "";
  const dedupeWindowMs = Number(opts.dedupeWindowMs) || 0;
  const replaceDedupe = opts.replaceDedupe === true && Boolean(dedupeKeyRaw);

  const prefsGuildId = guildId !== "global" ? guildId : String(IDs.guilds?.main || "").trim();
      const softFiltered = await shouldSkipSiteInAppNotif(prefsGuildId, userId, {
    kind,
    title,
    body,
    dedupeKey: dedupeKeyRaw,
    openUrl,
  }).catch(() => false);
  const sendPush = opts.push !== false && !softFiltered;
  const pushOpts = { push: sendPush };

  if (replaceDedupe) {
    const replaced = await replaceInboxItemByDedupeKey(userId, dedupeKeyRaw, {
      title,
      body,
      openUrl: openUrl || "",
      notifKind: kind,
      guildId,
      ticketId,
      resetRead: sendPush,
      collapseChat: opts.collapseChat === true,
      fromName: opts.fromName,
      ticketLabel: opts.ticketLabel,
      preview: opts.preview,
      messageId,
    });
    if (replaced) {
      fireNotificationPush(
        userId,
        {
          title,
          body,
          openUrl,
          kind,
          id: replaced.id,
          ticketId,
          messageId,
        },
        pushOpts,
      );
      return true;
    }
  }

  if (dedupeKeyRaw && dedupeWindowMs > 0 && !replaceDedupe) {
    const since = new Date(Date.now() - dedupeWindowMs);
    const inbox = await SiteDocument.findOne(inboxQuery(userId)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    const existing = items.find((it) => itemMatchesDedupeWindow(it, dedupeKeyRaw, since));
    if (existing) {
            const shouldRetryPush =
        sendPush &&
        !existing.readAt &&
        (isReminderNotificationKind(existing.notifKind || kind, existing.title || title, existing.body || body) ||
          isReminderNotificationKind(kind, title, body));
      if (shouldRetryPush) {
        fireNotificationPush(
          userId,
          {
            title: String(existing.title || title || ""),
            body: String(existing.body || body || ""),
            openUrl: String(existing.openUrl || openUrl || ""),
            kind: normalizeKind(existing.notifKind || kind),
            id: String(existing._id || ""),
            ticketId,
            messageId,
          },
          pushOpts,
        );
      }
      return true;
    }
    const dupLegacy = await SiteDocument.findOne({
      ...legacyFlatQuery(userId),
      dedupeKey: dedupeKeyRaw,
      createdAt: { $gte: since },
    })
      .select("_id")
      .lean()
      .catch(() => null);
    if (dupLegacy) return true;
  }
  let itemTitle = title;
  let itemBody = body;
  if (opts.collapseChat === true) {
    const copy = buildCollapsedTicketChatCopy({
      count: 1,
      fromNames: opts.fromName ? mergeNotifFromNames([], opts.fromName) : [],
      ticketLabel: opts.ticketLabel,
      fallbackTitle: title,
      fallbackBody: body,
      preview: opts.preview,
    });
    itemTitle = copy.title;
    itemBody = copy.body;
  }
  const newItem = {
    _id: new mongoose.Types.ObjectId(),
    guildId,
    title: itemTitle,
    body: itemBody,
    notifKind: kind,
    openUrl: openUrl || "",
    ticketId: ticketId || "",
    notifMsgCount: 1,
    notifFromNames: opts.collapseChat === true && opts.fromName ? mergeNotifFromNames([], opts.fromName) : [],
    dedupeKey: dedupeKeyRaw || null,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const dedupeOpts =
    dedupeKeyRaw && dedupeWindowMs > 0 && !replaceDedupe
      ? { dedupeKey: dedupeKeyRaw, since: new Date(Date.now() - dedupeWindowMs) }
      : null;
  const saved = await pushInboxItemAtomic(userId, newItem, dedupeOpts);
  if (saved) {
    fireNotificationPush(
      userId,
      {
        title: itemTitle,
        body: itemBody,
        openUrl,
        kind,
        id: String(newItem._id || ""),
        ticketId,
        messageId,
      },
      pushOpts,
    );
    return true;
  }
  global.logger?.warn?.("[siteInAppNotifications] enqueue failed:", { userId, kind, title });
  return false;
}

async function pruneSiteInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (items.length <= MAX_PER_USER) return;
  const sorted = mergeItemsSortTrim(items);
  await SiteDocument.updateOne(inboxQuery(uid), { $set: { inAppNotifItems: sorted } }).catch(() => null);
}

async function deleteSiteInAppNotifications(filter = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return 0;
  const { kind, ...rest } = filter;
  const legacyFilter = { docType: NOTIF, inAppNotifAggregate: { $ne: true }, ...rest };
  if (kind != null && String(kind).trim() !== "") legacyFilter.notifKind = String(kind).trim();
  const delLegacy = await SiteDocument.deleteMany(legacyFilter).catch(() => null);
  let count = Number(delLegacy?.deletedCount ?? delLegacy?.n ?? 0);

  const uid = normalizeUserId(rest.userId);
  const restKeys = Object.keys(rest).filter((k) => rest[k] !== undefined && rest[k] !== null);
  const onlyUser = uid && restKeys.length === 1 && restKeys[0] === "userId";
  if (onlyUser) {
    const delBox = await SiteDocument.deleteOne(inboxQuery(uid)).catch(() => null);
    count += Number(delBox?.deletedCount ?? delBox?.n ?? 0);
  } else {
    const pullSpec = { ...rest };
    if (kind != null && String(kind).trim() !== "") pullSpec.notifKind = String(kind).trim();
    if (Object.keys(pullSpec).length) {
      const res = await SiteDocument.updateMany(
        {
          docType: NOTIF,
          inAppNotifAggregate: true,
          inAppNotifItems: { $elemMatch: pullSpec },
        },
        { $pull: { inAppNotifItems: pullSpec } },
      ).catch(() => null);
      count += Number(res?.modifiedCount ?? res?.nModified ?? 0);
    }
  }
  if (count > 0) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return count;
}

function isValidNotificationId(id) {
  const sid = String(id || "").trim();
  return Boolean(sid) && mongoose.isValidObjectId(sid);
}

async function markSiteInAppNotificationRead(userId, notificationId) {
  const uid = normalizeUserId(userId);
  const nid = String(notificationId || "").trim();
  if (!uid || !isValidNotificationId(nid)) return false;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oid = new mongoose.Types.ObjectId(nid);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const item = (Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : []).find(
    (it) => String(it?._id || "") === nid,
  );
  const ticketId = item ? normalizeTicketId(item.ticketId) || ticketIdFromOpenUrl(item.openUrl) : "";
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": oid }] },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  if (modified) {
    fireNotifDismissPush(uid, { id: nid, ticketId });
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return modified;
}

async function markSiteInAppNotificationsReadMany(userId, notificationIds) {
  const uid = normalizeUserId(userId);
  const ids = Array.isArray(notificationIds)
    ? [...new Set(notificationIds.map((x) => String(x || "").trim()).filter((id) => isValidNotificationId(id)))]
    : [];
  if (!uid || !ids.length) return 0;
  if (ids.length === 1) {
    const ok = await markSiteInAppNotificationRead(uid, ids[0]);
    return ok ? 1 : 0;
  }
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": { $in: oids } }] },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0 ? ids.length : 0;
  if (modified > 0) {
    fireNotifDismissPush(uid, { all: true });
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return modified;
}

async function markAllSiteInAppNotificationsRead(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) return 0;
  let n = 0;
  const now = new Date();
  for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
    const it = doc.inAppNotifItems[i];
    if (it && !it.readAt) {
      it.readAt = now;
      n += 1;
    }
  }
  if (n > 0) {
    await doc.save().catch(() => null);
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
    fireNotifDismissPush(uid, { all: true });
  }
  return n;
}

async function markSiteInAppNotificationsReadForTicket(userId, ticketId) {
  const uid = normalizeUserId(userId);
  const tid = normalizeTicketId(ticketId);
  if (!uid || !tid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) {
    return 0;
  }
  let n = 0;
  const now = new Date();
  for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
    const it = doc.inAppNotifItems[i];
    if (!it || it.readAt) continue;
    if (!inboxItemMatchesTicket(it, tid)) continue;
    it.readAt = now;
    n += 1;
  }
  if (n > 0) {
    await doc.save().catch(() => null);
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
    fireNotifDismissPush(uid, { ticketId: tid });
  }
  return n;
}

async function listSiteInAppNotificationsForUser(userId, limit = 50) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const sorted = items.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  const prefsGuildId = String(IDs.guilds?.main || "").trim();
  const skipCtx = await buildSkipContext(prefsGuildId, uid).catch(() => ({
    mutedKinds: [],
    voteBlocked: { bump: false, vote_topgg: false },
  }));
  const mapped = [];
  for (const doc of sorted) {
    let kind = normalizeKind(doc.notifKind || doc.kind);
    const title = String(doc.title || "");
    const body = String(doc.body || "");
    if (
      kind === "vote" &&
      (/promemoria/i.test(title) || /promemoria/i.test(body) || /puoi votare di nuovo/i.test(body))
    ) {
      kind = "vote_reminder";
    }
    const openUrl = String(doc.openUrl || "").trim();
    const dedupeKey = String(doc.dedupeKey || "").trim();
    const filtered = await shouldSkipSiteInAppNotif(prefsGuildId || doc.guildId, uid, {
      kind,
      title,
      body,
      dedupeKey,
      openUrl,
      mutedKinds: skipCtx.mutedKinds,
      voteBlocked: skipCtx.voteBlocked,
    }).catch(() => false);
    mapped.push({
      id: String(doc._id),
      title,
      body,
      kind,
      at: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
      openUrl,
      ticketId: normalizeTicketId(doc.ticketId) || ticketIdFromOpenUrl(doc.openUrl),
      read: Boolean(doc.readAt),
      readAt: doc.readAt ? new Date(doc.readAt).getTime() : null,
      filtered: Boolean(filtered),
    });
    if (mapped.length >= lim) break;
  }
  return mapped;
}

async function deleteSiteInAppNotificationForUser(userId, notificationId) {
  const uid = normalizeUserId(userId);
  const nid = String(notificationId || "").trim();
  if (!uid || !isValidNotificationId(nid)) return false;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oid = new mongoose.Types.ObjectId(nid);
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $pull: { inAppNotifItems: { _id: oid } } },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  if (modified) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return modified;
}

async function deleteAllSiteInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  let count = 0;
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").catch(() => null);
  if (inbox) {
    count += Array.isArray(inbox.inAppNotifItems) ? inbox.inAppNotifItems.length : 0;
    inbox.inAppNotifItems = [];
    await inbox.save().catch(() => null);
    await SiteDocument.deleteOne({ _id: inbox._id }).catch(() => null);
  } else {
    const emptied = await SiteDocument.updateOne(inboxQuery(uid), { $set: { inAppNotifItems: [] } }).catch(() => null);
    count += Number(emptied?.modifiedCount ?? emptied?.nModified ?? 0);
    await SiteDocument.deleteOne(inboxQuery(uid)).catch(() => null);
  }
  const delLegacy = await SiteDocument.deleteMany(legacyFlatQuery(uid)).catch(() => null);
  count += Number(delLegacy?.deletedCount ?? delLegacy?.n ?? 0);
  if (count > 0) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return count;
}

module.exports = {
  enqueueSiteInAppNotification,
  removeInboxItemByDedupeKey,
  listSiteInAppNotificationsForUser,
  pruneSiteInAppNotificationsForUser,
  deleteSiteInAppNotifications,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
  markSiteInAppNotificationRead,
  markSiteInAppNotificationsReadMany,
  markAllSiteInAppNotificationsRead,
  markSiteInAppNotificationsReadForTicket,
  migrateLegacyInAppNotificationsForUser,
};