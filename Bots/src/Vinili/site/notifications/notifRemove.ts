/** Notifiche del sito: sostituzione e rimozione (per chiave, per filtro, per ticket). */
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { normalizeUserId, resolveNotifChannel } = require("./notifKinds") as typeof import("./notifKinds");
const { normalizeTicketId, ticketIdFromOpenUrl, inboxItemMatchesTicket, mergeNotifFromNames, buildCollapsedTicketChatCopy, buildCollapsedDigestCopy } = require("./notifCopy") as typeof import("./notifCopy");
const { NOTIF, inboxQuery, migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");
const { invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged } = require("./notifPush") as typeof import("./notifPush");

async function replaceInboxItemByDedupeKey(userId?, dedupeKey?, patch?) {
  const uid = normalizeUserId(userId);
  const key = String(dedupeKey || "").trim();
  if (!uid || !key) return null;
  const now = new Date();
  const inbox = await SiteDocument.findOne({ ...inboxQuery(uid), "inAppNotifItems.dedupeKey": key })
    .select("inAppNotifItems")
    .lean()
    .catch(() => null);
  const existing = (Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : []).find(
    (it?) => String(it?.dedupeKey || "") === key,
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
  } else if (patch.collapseDigest === true) {
    const wasUnread = Boolean(existing && !existing.readAt);
    if (wasUnread) {
      msgCount = Math.min(99, Math.max(1, Number(existing.notifMsgCount) || 1) + 1);
    }
    const copy = buildCollapsedDigestCopy({
      count: msgCount,
      queueLabel: patch.digestLabel,
      fallbackTitle: patch.title,
      fallbackBody: patch.body,
    });
    title = copy.title;
    body = copy.body;
  }
  const resolvedChannel = resolveNotifChannel({
    openUrl: patch.openUrl,
    dedupeKey: key,
    channel: patch.channel,
    title,
    body,
    kind: patch.notifKind,
  });
  const patchTicketId = normalizeTicketId(patch.ticketId) || ticketIdFromOpenUrl(patch.openUrl);
  const prevTicketId =
    normalizeTicketId(existing?.ticketId) || ticketIdFromOpenUrl(existing?.openUrl);
  const ticketChanged = Boolean(patchTicketId) && patchTicketId !== prevTicketId;
  const titleChanged = String(existing?.title || "") !== String(title || "");
  const bodyChanged = String(existing?.body || "") !== String(body || "");
  const contentChanged = !existing || ticketChanged || titleChanged || bodyChanged;
  const isQueueKey = /^web_ticket:queue:/i.test(key);
  /* ticketQueueFresh1: coda ticket — se cambia ticket/testo, bump orario + unread
     anche quando il refresh è push:false (claim/close di un altro ticket). */
  const shouldResetRead =
    patch.resetRead !== false || ticketChanged || (isQueueKey && contentChanged);
  const shouldBumpTime = shouldResetRead || contentChanged || patch.bumpTime === true;
  const $set = {
    "inAppNotifItems.$.title": title,
    "inAppNotifItems.$.body": body,
    "inAppNotifItems.$.openUrl": patch.openUrl,
    "inAppNotifItems.$.notifKind": patch.notifKind,
    "inAppNotifItems.$.notifChannel": resolvedChannel,
    "inAppNotifItems.$.guildId": patch.guildId,
    "inAppNotifItems.$.updatedAt": now,
    "inAppNotifItems.$.notifMsgCount": msgCount,
    "inAppNotifItems.$.notifFromNames": fromNames,
  };
  if (patchTicketId) $set["inAppNotifItems.$.ticketId"] = patchTicketId;
  if (shouldResetRead) {
    $set["inAppNotifItems.$.readAt"] = null;
  }
  if (shouldBumpTime) {
    $set["inAppNotifItems.$.createdAt"] = now;
  }
  const out = await SiteDocument.findOneAndUpdate(
    { ...inboxQuery(uid), "inAppNotifItems.dedupeKey": key },
    { $set },
    { new: true },
  ).catch(() => null);
  if (!out) return null;
  const item = (Array.isArray(out.inAppNotifItems) ? out.inAppNotifItems : []).find(
    (it?) => String(it?.dedupeKey || "") === key,
  );
  return item?._id
    ? {
        id: String(item._id),
        title: String(item.title || title || ""),
        body: String(item.body || body || ""),
        ticketId: String(item.ticketId || patchTicketId || ""),
        msgCount,
        existed: Boolean(existing),
        ticketChanged,
        contentChanged,
        shouldResetRead,
      }
    : {
        id: "",
        title,
        body,
        msgCount,
        existed: Boolean(existing),
        ticketChanged,
        contentChanged,
        shouldResetRead,
      };
}

async function removeInboxItemByDedupeKey(userId?, dedupeKey?) {
  const uid = normalizeUserId(userId);
  const key = String(dedupeKey || "").trim();
  if (!uid || !key) return false;
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const hit = items.find((it?) => String(it?.dedupeKey || "") === key);
  const res = await SiteDocument.updateOne(inboxQuery(uid), {
    $pull: { inAppNotifItems: { dedupeKey: key } },
  }).catch(() => null);
  const changed = Number(res?.modifiedCount ?? res?.nModified ?? 0) > 0;
  if (changed) {
    invalidateUnreadCountCache(uid);
    /* notifAutoDismissSync1: unread mirato → badge subito (no fanout cieco) */
    broadcastInboxChanged(uid);
    /* ticketSmartNotif1: rimozione dedupe → dismiss OS su tutti i device */
    const tid = hit ? normalizeTicketId(hit.ticketId) || ticketIdFromOpenUrl(hit.openUrl) : "";
    const nid = hit && hit._id ? String(hit._id) : "";
    const ou = hit ? String(hit.openUrl || "").trim() : "";
    const dk = hit ? String(hit.dedupeKey || "").trim() : "";
    fireNotifDismissPush(uid, {
      id: nid,
      ticketId: tid,
      openUrls: ou ? [ou] : [],
      dedupeKeys: dk ? [dk] : [],
      force: true,
    });
  }
  return changed;
}

function escapeRegexLiteral(s?) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inboxItemMatchesDedupeSpec(it?, { exactKeys = [], prefixes = [], openUrls = [], kinds = [] } = {}) {
  if (!it) return false;
  const key = String(it.dedupeKey || "").trim();
  const open = String(it.openUrl || "").trim();
  const kind = String(it.notifKind || it.kind || "").trim().toLowerCase();
  if (kinds.length && !kinds.includes(kind)) return false;
  if (exactKeys.length || prefixes.length || openUrls.length) {
    if (key && exactKeys.includes(key)) return true;
    if (key && prefixes.some((p?) => p && key.startsWith(p))) return true;
    if (open && openUrls.some((u?) => u && (open === u || open.indexOf(u) !== -1))) return true;
    return false;
  }
  return kinds.length > 0;
}

/**
 * smartNotifLifecycle1: rimuove inbox items per match dedupe/openUrl/kind + dismiss push.
 * Se userId omesso, scansiona inbox aggregate che matchano (max 400).
 */
async function removeSiteInAppNotificationsMatching(opts: Record<string, any> = {}) {
  const exactKeys = [
    ...new Set(
      (Array.isArray(opts.exactKeys) ? opts.exactKeys : [opts.exactKeys])
        .map((k?) => String(k || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 80);
  const prefixes = [
    ...new Set(
      (Array.isArray(opts.prefixes) ? opts.prefixes : [opts.prefixes])
        .map((p?) => String(p || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
  const openUrls = [
    ...new Set(
      (Array.isArray(opts.openUrls) ? opts.openUrls : [opts.openUrls])
        .map((u?) => String(u || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
  const kinds = [
    ...new Set(
      (Array.isArray(opts.kinds) ? opts.kinds : [opts.kinds])
        .map((k?) => String(k || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const forceDismiss = opts.forceDismiss !== false;
  const onlyUserId = normalizeUserId(opts.userId);
  if (!exactKeys.length && !prefixes.length && !openUrls.length && !(onlyUserId && kinds.length)) {
    return { users: 0, removed: 0 };
  }

  const matchSpec = { exactKeys, prefixes, openUrls, kinds };
  const filter: Record<string, any> = { docType: NOTIF, inAppNotifAggregate: true };
  if (onlyUserId) filter.userId = onlyUserId;
  else {
    const or = [];
    if (exactKeys.length) or.push({ "inAppNotifItems.dedupeKey": { $in: exactKeys } });
    for (const p of prefixes) {
      or.push({ "inAppNotifItems.dedupeKey": { $regex: `^${escapeRegexLiteral(p)}` } });
    }
    for (const u of openUrls) {
      or.push({ "inAppNotifItems.openUrl": u });
    }
    if (kinds.length && !or.length) {
      or.push({ "inAppNotifItems.notifKind": { $in: kinds } });
    }
    if (!or.length) return { users: 0, removed: 0 };
    filter.$or = or;
  }

  const docs = await SiteDocument.find(filter)
    .select("userId inAppNotifItems")
    .limit(onlyUserId ? 1 : 400)
    .catch(() => []);
  if (!Array.isArray(docs) || !docs.length) return { users: 0, removed: 0 };

  let users = 0;
  let removed = 0;
  const touchedUsers = [];
  await Promise.all(
    docs.map(async (doc?) => {
      const uid = normalizeUserId(doc.userId);
      if (!uid || !Array.isArray(doc.inAppNotifItems)) return;
      const kept = [];
      const removedIds = [];
      const removedOpenUrls = [];
      const removedDedupeKeys = [];
      const queuesHit = new Set();
      let ticketId = "";
      for (const it of doc.inAppNotifItems) {
        if (!inboxItemMatchesDedupeSpec(it, matchSpec)) {
          kept.push(it);
          continue;
        }
        removed += 1;
        if (it?._id) removedIds.push(String(it._id));
        const ou = String(it?.openUrl || "").trim();
        if (ou && !removedOpenUrls.includes(ou)) removedOpenUrls.push(ou);
        const dk = String(it?.dedupeKey || "").trim();
        if (dk && !removedDedupeKeys.includes(dk)) removedDedupeKeys.push(dk);
        const qHit = dk.match(/^inbox:([^:]+):/i);
        if (qHit && qHit[1]) queuesHit.add(String(qHit[1]).toLowerCase());
        if (!ticketId) {
          ticketId = normalizeTicketId(it.ticketId) || ticketIdFromOpenUrl(it.openUrl) || "";
        }
      }
      /* pushAutoDismiss1: se togliamo new/item di una coda, via anche digest collassato
         (altrimenti in-app some paths sparisce ma il banner digest resta). */
      if (queuesHit.size) {
        const still = [];
        for (const it of kept) {
          const dk = String(it?.dedupeKey || "").trim();
          let dropDigest = false;
          for (const q of queuesHit) {
            if (dk === `inbox:${q}:digest:${uid}`) {
              dropDigest = true;
              break;
            }
          }
          if (!dropDigest) {
            still.push(it);
            continue;
          }
          removed += 1;
          if (it?._id) removedIds.push(String(it._id));
          const ou = String(it?.openUrl || "").trim();
          if (ou && !removedOpenUrls.includes(ou)) removedOpenUrls.push(ou);
          if (dk && !removedDedupeKeys.includes(dk)) removedDedupeKeys.push(dk);
        }
        kept.length = 0;
        kept.push(...still);
      }
      if (kept.length === doc.inAppNotifItems.length) return;
      doc.inAppNotifItems = kept;
      try {
        await doc.save();
      } catch (_) {
        return;
      }
      users += 1;
      touchedUsers.push(uid);
      invalidateUnreadCountCache(uid);
      /* notifReadDismissOs1 / pushAutoDismiss1: dismiss OS id + openUrl + dedupe (digest) */
      if (forceDismiss) {
        const aliasOpen = [];
        for (const q of queuesHit) {
          if (q === "resoconti") {
            aliasOpen.push("/user/?tab=staff&staffOpen=resoconto");
            aliasOpen.push("/notifications/?view=staff&inbox=resoconti");
          } else if (q === "pause") {
            aliasOpen.push("/user/?tab=staff&staffOpen=pause");
            aliasOpen.push("/staff/pause/");
          } else if (q === "candidature" || q === "appelli" || q === "revisione" || q === "punti-tolti") {
            aliasOpen.push(`/notifications/?view=staff&inbox=${encodeURIComponent(q)}`);
          }
          removedDedupeKeys.push(`inbox:${q}:digest:${uid}`);
        }
        fireNotifDismissPush(uid, {
          ids: removedIds,
          ticketId,
          openUrls: [...new Set([...(removedOpenUrls.length ? removedOpenUrls : openUrls), ...aliasOpen])].slice(
            0,
            40,
          ),
          dedupeKeys: removedDedupeKeys,
          force: true,
        });
      }
    }),
  ).catch(() => null);
  /* notifAutoDismissSync1: un broadcast per user con unread fresco */
  for (const uid of [...new Set(touchedUsers)]) {
    try {
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  return { users, removed };
}

/**
 * ticketSmartNotif1: cancella inbox (+ dismiss push) per un ticket.
 * Skip coda staff (web_ticket:queue:*) — gestita da refreshStaffTicketQueueNotif.
 */
async function removeSiteInAppNotificationsForTicket(
  userId?,
  ticketId?,
  { exceptDedupeKeys = [], exceptDedupePrefixes = [], forceDismiss = false } = {},
) {
  const uid = normalizeUserId(userId);
  const tid = normalizeTicketId(ticketId);
  if (!uid || !tid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) {
    if (forceDismiss) fireNotifDismissPush(uid, { ticketId: tid, force: true });
    return 0;
  }

  const exceptKeys = new Set(
    (Array.isArray(exceptDedupeKeys) ? exceptDedupeKeys : [exceptDedupeKeys])
      .map((k?) => String(k || "").trim())
      .filter(Boolean),
  );
  const exceptPrefs = (Array.isArray(exceptDedupePrefixes) ? exceptDedupePrefixes : [exceptDedupePrefixes])
    .map((p?) => String(p || "").trim())
    .filter(Boolean);

  const kept = [];
  const removedIds = [];
  for (const it of doc.inAppNotifItems) {
    if (!it) continue;
    const key = String(it.dedupeKey || "").trim();
    if (/^web_ticket:queue:/i.test(key)) {
      kept.push(it);
      continue;
    }
    if (!inboxItemMatchesTicket(it, tid)) {
      kept.push(it);
      continue;
    }
    if (key && exceptKeys.has(key)) {
      kept.push(it);
      continue;
    }
    if (key && exceptPrefs.some((p?) => key.startsWith(p))) {
      kept.push(it);
      continue;
    }
    if (it._id) removedIds.push(String(it._id));
  }
  const removed = doc.inAppNotifItems.length - kept.length;
  if (removed <= 0) {
    if (forceDismiss) fireNotifDismissPush(uid, { ticketId: tid, force: true });
    return 0;
  }
  doc.inAppNotifItems = kept;
  try {
    await doc.save();
  } catch (err) {
    global.logger?.warn?.("[siteInAppNotifications] ticket purge failed:", err?.message || err);
    return 0;
  }
  invalidateUnreadCountCache(uid);
  broadcastInboxChanged(uid);
  /* pushPurgeOsDismiss1: sempre force — chiusura ticket non deve perdere dismiss per throttle */
  fireNotifDismissPush(uid, { ticketId: tid, ids: removedIds, force: true });
  return removed;
}

export = { replaceInboxItemByDedupeKey, removeInboxItemByDedupeKey, removeSiteInAppNotificationsMatching, removeSiteInAppNotificationsForTicket };
