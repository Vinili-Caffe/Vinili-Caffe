/** Notifiche del sito: invio di una notifica nuova. */
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { shouldSkipSiteInAppNotif } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { normalizeUserId, normalizeKind, isVoteRegisteredNotification, resolveNotifChannel } = require("./notifKinds") as typeof import("./notifKinds");
const { normalizeTicketId, ticketIdFromOpenUrl, mergeNotifFromNames, buildCollapsedTicketChatCopy, buildCollapsedDigestCopy } = require("./notifCopy") as typeof import("./notifCopy");
const { MAX_PER_USER, DEDUPE_KEY_MAX, legacyFlatQuery, inboxQuery, mergeItemsSortTrim, migrateLegacyInAppNotificationsForUser, itemMatchesDedupeWindow, pushInboxItemAtomic } = require("./notifStore") as typeof import("./notifStore");
const { fireNotificationPush } = require("./notifPush") as typeof import("./notifPush");
const { replaceInboxItemByDedupeKey } = require("./notifRemove") as typeof import("./notifRemove");

async function enqueueSiteInAppNotification(opts: Record<string, any> = {}) {
  const userId = normalizeUserId(opts.userId);
  if (!userId) return false;
  await migrateLegacyInAppNotificationsForUser(userId).catch(() => null);
  const guildId = String(opts.guildId || "").trim() || "global";
  const title = String(opts.title || "").trim().slice(0, 120);
  const body = String(opts.body || "").trim().slice(0, 500);
  if (!title || !body) return false;
  const kindEarly = normalizeKind(opts.kind);
  const dedupeEarly = opts.dedupeKey != null ? String(opts.dedupeKey).trim() : "";
  if (
    isVoteRegisteredNotification({
      kind: kindEarly,
      title,
      body,
      dedupeKey: dedupeEarly,
    })
  ) {
    return false;
  }
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
  const resolvedChannel = resolveNotifChannel({
    openUrl,
    dedupeKey: dedupeKeyRaw,
    channel: opts.channel,
    title,
    body,
    kind,
  });

  if (replaceDedupe) {
    const isQueueKey = /^web_ticket:queue:/i.test(dedupeKeyRaw);
    /* ticketSlaPushOnce1: refresh SLA non deve rimettere unread ogni 5 min */
    const resetReadFlag =
      opts.keepRead === true || opts.pushIfNew === true
        ? false
        : sendPush || opts.forceUnread === true;
    let replaced = await replaceInboxItemByDedupeKey(userId, dedupeKeyRaw, {
      title,
      body,
      openUrl: openUrl || "",
      notifKind: kind,
      guildId,
      ticketId,
      channel: opts.channel,
      /* ticketQueueFresh1: resetRead esplicito; la coda forza unread se cambia ticket */
      resetRead: resetReadFlag,
      collapseChat: opts.collapseChat === true,
      collapseDigest: opts.collapseDigest === true,
      digestLabel: opts.digestLabel,
      fromName: opts.fromName,
      ticketLabel: opts.ticketLabel,
      preview: opts.preview,
      messageId,
    });
    /* notifDigestRace1: replace miss → create esclusivo; se noi seediamo NON re-replace (evita count 2) */
    if (!replaced && dedupeKeyRaw) {
      let itemTitle = title;
      let itemBody = body;
      if (opts.collapseDigest === true) {
        const copy = buildCollapsedDigestCopy({
          count: 1,
          queueLabel: opts.digestLabel,
          fallbackTitle: title,
          fallbackBody: body,
        });
        itemTitle = copy.title;
        itemBody = copy.body;
      } else if (opts.collapseChat === true) {
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
      const seedItem = {
        _id: new mongoose.Types.ObjectId(),
        guildId,
        title: itemTitle,
        body: itemBody,
        notifKind: kind,
        notifChannel: resolvedChannel,
        openUrl: openUrl || "",
        ticketId: ticketId || "",
        notifMsgCount: 1,
        notifFromNames: opts.fromName ? mergeNotifFromNames([], opts.fromName) : [],
        dedupeKey: dedupeKeyRaw || null,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const created = await pushInboxItemAtomic(userId, seedItem, {
        dedupeKey: dedupeKeyRaw,
        exclusiveKey: true,
      });
      if (created && created.inserted) {
        replaced = {
          id: String(seedItem._id),
          title: itemTitle,
          body: itemBody,
          msgCount: 1,
          existed: false,
          ticketChanged: false,
          contentChanged: true,
          shouldResetRead: true,
        };
      } else {
        replaced = await replaceInboxItemByDedupeKey(userId, dedupeKeyRaw, {
          title,
          body,
          openUrl: openUrl || "",
          notifKind: kind,
          guildId,
          ticketId,
          channel: opts.channel,
          resetRead: resetReadFlag,
          collapseChat: opts.collapseChat === true,
          collapseDigest: opts.collapseDigest === true,
          digestLabel: opts.digestLabel,
          fromName: opts.fromName,
          ticketLabel: opts.ticketLabel,
          preview: opts.preview,
          messageId,
        });
      }
    }
    if (replaced) {
      let doPush = sendPush;
      /* notifDigestRace1: ogni incremento digest → push (stesso tag SW aggiorna il banner su telefono) */
      /* ticketQueueFresh1: nuovo latest in coda → push anche se refresh era push:false */
      if (isQueueKey && replaced.ticketChanged && !softFiltered) {
        doPush = true;
      }
      /* ticketSlaPushOnce1: SLA/replace “pushIfNew” → push solo alla prima create */
      if (opts.pushIfNew === true && replaced.existed) {
        doPush = false;
      }
      const digestTtl =
        opts.collapseDigest === true
          ? Math.max(Number(opts.pushTtlSeconds) || 0, 60 * 60 * 12)
          : Number(opts.pushTtlSeconds) > 0
            ? Number(opts.pushTtlSeconds)
            : undefined;
      fireNotificationPush(
        userId,
        {
          title: replaced.title || title,
          body: replaced.body || body,
          openUrl,
          kind,
          id: replaced.id,
          ticketId,
          messageId,
          channel: resolvedChannel,
          dedupeKey: dedupeKeyRaw,
          ttlSeconds: digestTtl,
          msgCount: replaced.msgCount,
        },
        { push: doPush },
      );
      return true;
    }
  }

  if (dedupeKeyRaw && dedupeWindowMs > 0 && !replaceDedupe) {
    const since = new Date(Date.now() - dedupeWindowMs);
    const inbox = await SiteDocument.findOne(inboxQuery(userId)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    const existing = items.find((it?) => itemMatchesDedupeWindow(it, dedupeKeyRaw, since));
    if (existing) {
            /* pushPhoneAllSoftRetry1: re-push anche non-reminder se unread in finestra dedupe
         (prima solo reminder → staff/inbox/ticket silenziosi sul telefono) */
      const shouldRetryPush = sendPush && !existing.readAt;
      if (shouldRetryPush) {
        const pushTtl =
          Number(opts.pushTtlSeconds) > 0
            ? Number(opts.pushTtlSeconds)
            : kind === "vote_reminder" || normalizeKind(existing.notifKind || kind) === "vote_reminder"
              ? 60 * 60 * 12
              : undefined;
        const pushResult: any = await fireNotificationPush(
          userId,
          {
            title: String(existing.title || title || ""),
            body: String(existing.body || body || ""),
            openUrl: String(existing.openUrl || openUrl || ""),
            kind: normalizeKind(existing.notifKind || kind),
            id: String(existing._id || ""),
            ticketId,
            messageId,
            channel: String(existing.notifChannel || resolvedChannel || ""),
            dedupeKey: dedupeKeyRaw || String(existing.dedupeKey || ""),
            ttlSeconds: pushTtl,
          },
          pushOpts,
        );
        if (opts.__pushOut && typeof opts.__pushOut === "object") {
          try {
            opts.__pushOut.sent = Number(pushResult?.sent) || 0;
            opts.__pushOut.failed = Number(pushResult?.failed) || 0;
            opts.__pushOut.skipped = Boolean(pushResult?.skipped);
            opts.__pushOut.ok = pushResult?.ok !== false;
            opts.__pushOut.mobileSent = Number(pushResult?.mobileSent) || 0;
            opts.__pushOut.mobileFailed = Number(pushResult?.mobileFailed) || 0;
            opts.__pushOut.mobileTargets = Number(pushResult?.mobileTargets) || 0;
            opts.__pushOut.mobileCandidates = Number(pushResult?.mobileCandidates) || 0;
            opts.__pushOut.mobileAppleSent = Number(pushResult?.mobileAppleSent) || 0;
            opts.__pushOut.desktopSent = Number(pushResult?.desktopSent) || 0;
            opts.__pushOut.skippedGone = Number(pushResult?.skippedGone) || 0;
            opts.__pushOut.notifId = String(existing._id || opts.__pushOut.notifId || "");
          } catch (_) {}
        }
      } else if (opts.__pushOut && typeof opts.__pushOut === "object") {
        opts.__pushOut.sent = 0;
        opts.__pushOut.failed = 0;
        opts.__pushOut.skipped = true;
        opts.__pushOut.ok = true;
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
  } else if (opts.collapseDigest === true) {
    const copy = buildCollapsedDigestCopy({
      count: 1,
      queueLabel: opts.digestLabel,
      fallbackTitle: title,
      fallbackBody: body,
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
    notifChannel: resolvedChannel,
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
  if (saved && saved.ok) {
    const pushTtl =
      Number(opts.pushTtlSeconds) > 0
        ? Number(opts.pushTtlSeconds)
        : kind === "vote_reminder"
          ? 60 * 60 * 12
          : undefined;
    const pushResult: any = await fireNotificationPush(
      userId,
      {
        title: itemTitle,
        body: itemBody,
        openUrl,
        kind,
        id: String(newItem._id || ""),
        ticketId,
        messageId,
        channel: resolvedChannel,
        dedupeKey: dedupeKeyRaw,
        ttlSeconds: pushTtl,
      },
      pushOpts,
    );
    /* votePushPhoneFix1 / votePushPhoneRetry1: stats device per retry telefono */
    if (opts.__pushOut && typeof opts.__pushOut === "object") {
      try {
        opts.__pushOut.sent = Number(pushResult?.sent) || 0;
        opts.__pushOut.failed = Number(pushResult?.failed) || 0;
        opts.__pushOut.skipped = Boolean(pushResult?.skipped);
        opts.__pushOut.ok = pushResult?.ok !== false;
        opts.__pushOut.mobileSent = Number(pushResult?.mobileSent) || 0;
        opts.__pushOut.mobileFailed = Number(pushResult?.mobileFailed) || 0;
        opts.__pushOut.mobileTargets = Number(pushResult?.mobileTargets) || 0;
        opts.__pushOut.mobileCandidates = Number(pushResult?.mobileCandidates) || 0;
        opts.__pushOut.mobileAppleSent = Number(pushResult?.mobileAppleSent) || 0;
        opts.__pushOut.desktopSent = Number(pushResult?.desktopSent) || 0;
        opts.__pushOut.skippedGone = Number(pushResult?.skippedGone) || 0;
        opts.__pushOut.notifId = String(newItem._id || "");
      } catch (_) {}
    }
    return true;
  }
  global.logger?.warn?.("[siteInAppNotifications] enqueue failed:", { userId, kind, title });
  return false;
}

async function pruneSiteInAppNotificationsForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (items.length <= MAX_PER_USER) return;
  const sorted = mergeItemsSortTrim(items);
  await SiteDocument.updateOne(inboxQuery(uid), { $set: { inAppNotifItems: sorted } }).catch(() => null);
}

export = { enqueueSiteInAppNotification, pruneSiteInAppNotificationsForUser };
