/** Notifiche del sito: salvataggio della inbox di un utente (e migrazione dal formato vecchio). */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { normalizeUserId, normalizeKind, isVoteRegisteredNotification } = require("./notifKinds") as typeof import("./notifKinds");

const NOTIF = SITE_DOCUMENT_TYPE.IN_APP_NOTIFICATION;
const MAX_PER_USER = 150;
const DEDUPE_KEY_MAX = 120;

async function saveInboxItems(userId?, items?) {
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

function legacyFlatQuery(userId?) {
  return {
    docType: NOTIF,
    userId,
    inAppNotifAggregate: { $ne: true },
  };
}

function inboxQuery(userId?) {
  return { docType: NOTIF, userId, inAppNotifAggregate: true };
}

function flatDocToItem(doc?) {
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

function mergeItemsSortTrim(items?) {
  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a?, b?) => (new Date(b.createdAt || 0) as any) - (new Date(a.createdAt || 0) as any));
  return arr.slice(0, MAX_PER_USER);
}

async function migrateLegacyInAppNotificationsForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  const legacy = await SiteDocument.find(legacyFlatQuery(uid))
    .sort({ createdAt: 1 })
    .lean()
    .catch(() => []);
  if (!Array.isArray(legacy) || !legacy.length) return;
  const items = mergeItemsSortTrim(
    legacy
      .filter((d?) => String(d.title || "").trim() && String(d.body || "").trim())
      .map(flatDocToItem),
  );
  if (!items.length) {
    await SiteDocument.deleteMany({ _id: { $in: legacy.map((d?) => d._id) } }).catch(() => null);
    return;
  }
  const legacyIds = legacy.map((d?) => d._id);
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

function itemMatchesDedupeWindow(item?, dedupeKeyRaw?, since?) {
  if (!item || String(item.dedupeKey || "") !== dedupeKeyRaw) return false;
  const t = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return t >= since.getTime();
}

function isReminderNotificationKind(kind?, title?, body?) {
  const k = normalizeKind(kind);
  if (k === "vote_reminder") return true;
  if (isVoteRegisteredNotification({ kind, title, body })) return false;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  return /promemoria|reminder|puoi votare|pozioni disponibili|puoi tornare in aula/.test(hay);
}

async function pushInboxItemAtomic(userId?, newItem?, dedupe = null) {
  const uid = normalizeUserId(userId);
  if (!uid || !newItem) return { ok: false, inserted: false };
  const dedupeKey = dedupe?.dedupeKey ? String(dedupe.dedupeKey).trim() : "";
  const since = dedupe?.since instanceof Date ? dedupe.since : null;
  const exclusiveKey = dedupe?.exclusiveKey === true;

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

  const filter: Record<string, any> = { ...inboxQuery(uid) };
  /* notifDigestRace1: per replaceDedupe create, un solo item con stesso dedupeKey */
  if (dedupeKey && exclusiveKey) {
    filter.$nor = [{ inAppNotifItems: { $elemMatch: { dedupeKey } } }];
  } else if (dedupeKey && since) {
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
  ).catch((err?) => {
    global.logger?.warn?.("[siteInAppNotifications] atomic push failed:", err?.message || err);
    return null;
  });
  if (res) return { ok: true, inserted: true };

  if (dedupeKey && (exclusiveKey || since)) {
    const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    if (exclusiveKey && items.some((it?) => String(it?.dedupeKey || "") === dedupeKey)) {
      return { ok: true, inserted: false };
    }
    if (since && items.some((it?) => itemMatchesDedupeWindow(it, dedupeKey, since))) {
      return { ok: true, inserted: false };
    }
  }

  const inbox = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  const existing = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (exclusiveKey && dedupeKey && existing.some((it?) => String(it?.dedupeKey || "") === dedupeKey)) {
    return { ok: true, inserted: false };
  }
  if (dedupeKey && since && existing.some((it?) => itemMatchesDedupeWindow(it, dedupeKey, since))) {
    return { ok: true, inserted: false };
  }
  const saved = await saveInboxItems(uid, [...existing, newItem]);
  return { ok: Boolean(saved), inserted: Boolean(saved) };
}

export = { NOTIF, MAX_PER_USER, DEDUPE_KEY_MAX, legacyFlatQuery, inboxQuery, mergeItemsSortTrim, migrateLegacyInAppNotificationsForUser, itemMatchesDedupeWindow, pushInboxItemAtomic };
