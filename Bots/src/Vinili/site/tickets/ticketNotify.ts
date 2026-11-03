/** Ticket dal sito: eventi in tempo reale, notifiche a staff e utenti, avvisi di attesa (SLA). */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { WEB_TICKET_STATUS, SiteWebTicket, SiteWebTicketMessage } = require("../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { enqueueSiteInAppNotification, removeInboxItemByDedupeKey, removeSiteInAppNotificationsForTicket } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { shouldSkipWebTicketInAppNotif } = require("./webTicketPagePresence") as typeof import("./webTicketPagePresence");
const { broadcastSiteWebTicketsEvent } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
const { CATEGORY_LABELS, sanitizeText, normalizeCategory } = require("./ticketNames") as typeof import("./ticketNames");
const { memberCanAccessTicketCategory, listAddedUsers, ticketHasAddedUser } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { parseMentionTargets, listTicketMessageAuthorIds } = require("./ticketMentions") as typeof import("./ticketMentions");
const { serializeTicket, previewFromContent } = require("./ticketSerialize") as typeof import("./ticketSerialize");

const MAX_CONTENT = 2000;

function emitTicketEvent(payload?) {
  try {
    const next = payload && typeof payload === "object" ? { ...payload } : payload;
    if (next && next.ticket && typeof next.ticket === "object" && next.ticket.permissions) {
      next.ticket = { ...next.ticket };
      delete next.ticket.permissions;
    }
    broadcastSiteWebTicketsEvent(next);
  } catch {
      }
}

function unclaimedWebTicketFilter(guildId?, category?) {
  return {
    guildId: String(guildId),
    category: String(category),
    status: { $ne: WEB_TICKET_STATUS.CLOSED },
    $or: [{ claimedBy: null }, { claimedBy: "" }, { claimedBy: { $exists: false } }],
  };
}

async function listStaffRecipientsForCategory(client?, guildId?, category?, excludeUserIds = []) {
  const excluded = new Set(
    (Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  const recipients = new Set();
  try {
    if (guild) {
      for (const m of guild.members.cache.values()) {
        if (!m || m.user?.bot) continue;
        if (!memberCanAccessTicketCategory(m, category)) continue;
        recipients.add(String(m.id));
      }
      if (!recipients.size && guild.members.cache.size < guild.memberCount) {
        await guild.members.fetch({ limit: 200 }).catch(() => null);
        for (const m of guild.members.cache.values()) {
          if (!m || m.user?.bot) continue;
          if (!memberCanAccessTicketCategory(m, category)) continue;
          recipients.add(String(m.id));
        }
      }
    }
  } catch {
      }
  return [...recipients].filter((id?) => id && !excluded.has((id as any))).slice(0, 60);
}

async function refreshStaffTicketQueueNotif(
  client?,
  guildId?,
  category?,
  { push = true, excludeUserIds = [], clearOnlyUserIds = null, previewHint = "" } = {},
) {
  const gid = String(guildId || "").trim();
  const cat = normalizeCategory(category) || "supporto";
  if (!gid) return;
  const filter = unclaimedWebTicketFilter(gid, cat);
  const count = await SiteWebTicket.countDocuments(filter).catch(() => 0);
  const latest =
    count > 0
      ? await SiteWebTicket.findOne(filter)
          .sort({ lastMessageAt: -1, createdAt: -1 })
          .select("_id subject authorName ticketNumber")
          .lean()
          .catch(() => null)
      : null;
  const recipients = await listStaffRecipientsForCategory(client, gid, cat, excludeUserIds);
  const label = CATEGORY_LABELS[cat] || cat;
  const sid = String(latest?._id || "");
  const author = String(latest?.authorName || "Un utente").trim() || "Un utente";
  const subject = String(latest?.subject || "").trim() || label;
  const title = count === 1 ? author : `${count} ticket da claimare`;
  const hint = String(previewHint || "").trim().slice(0, 100);
  /* ticketMsgQueuePush1: preview messaggio → body cambia → push anche sullo stesso ticket */
  const body =
    count === 1
      ? hint
        ? `${label} · ${subject} — ${hint}`
        : `${label} · ${subject}`
      : hint
        ? `Ultimo: ${author} · ${subject} — ${hint}`
        : `Ultimo: ${author} · ${subject}`;
  /* notifPerStaffRead1 + ticketQueueFresh1: clearOnly = solo claimer perde la coda;
     agli altri resta; se il latest ticket cambia, enqueue forza unread+push. */
  const clearOnly = Array.isArray(clearOnlyUserIds)
    ? new Set(clearOnlyUserIds.map((id?) => String(id || "").trim()).filter(Boolean))
    : null;
  await Promise.all(
    recipients.map(async (userId?) => {
      const dedupeKey = `web_ticket:queue:${cat}:${userId}`;
      if (count <= 0) {
        if (clearOnly && !clearOnly.has(String(userId))) return;
        await removeInboxItemByDedupeKey(userId, dedupeKey).catch(() => null);
        return;
      }
      await enqueueSiteInAppNotification({
        guildId: gid,
        userId,
        title,
        body,
        kind: "web_ticket",
        channel: "inbox",
        openUrl: `/tickets/?view=staff&ticketId=${sid}#${sid}`,
        ticketId: sid,
        dedupeKey,
        replaceDedupe: true,
        push,
        forceUnread: Boolean(hint),
      }).catch(() => null);
    }),
  ).catch(() => null);
}

async function notifyStaffNewTicket(client?, guildId?, ticket?) {
  if (!guildId || !ticket) return;
  const category = normalizeCategory(ticket.category) || "supporto";
  await refreshStaffTicketQueueNotif(client, guildId, category, {
    push: true,
    excludeUserIds: [ticket.userId],
  });
}

async function notifyMentionedUsers(
  client?,
  guildId?,
  ticket?,
  authorId?,
  authorName?,
  content?,
  { allowRoleMentions = false } = {},
) {
  /* notifUseful1: notify participants too (staff Inbox Mentions / opener Personali) */
  const gid = String(guildId || "").trim();
  if (!gid || !content) return [];
  const { userIds, roleIds } = parseMentionTargets(content);
  const effectiveRoleIds = allowRoleMentions ? roleIds : [];
  if (!userIds.length && !effectiveRoleIds.length) return [];

  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  const recipients = new Set(userIds.filter((id?) => id && id !== String(authorId || "")));

  if (guild && effectiveRoleIds.length) {
    for (const roleId of effectiveRoleIds) {
      const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;
      for (const m of role.members.values()) {
        if (!m || m.user?.bot) continue;
        if (String(m.id) === String(authorId || "")) continue;
        recipients.add(String(m.id));
      }
    }
  }

  const sid = String(ticket?._id || ticket?.id || "");
  const preview = previewFromContent(content, 0) || "Ti hanno menzionato";
  const safeAuthor = String(authorName || "Qualcuno").trim() || "Qualcuno";
  const mentioned = [...recipients].slice(0, 40);
  await Promise.all(
    mentioned.map((userId?) => {
      if (shouldSkipWebTicketInAppNotif(userId, sid, "mention")) return Promise.resolve(false);
      const openUrl = ticketChatOpenUrl(ticket, userId);
      const staffView = openUrl.includes("view=staff");
      return enqueueSiteInAppNotification({
        guildId: gid,
        userId,
        title: staffView ? `${safeAuthor} ti ha menzionato` : `${safeAuthor} ti ha menzionato`,
        body: preview,
        kind: "web_ticket_mention",
        channel: staffView ? "inbox" : "personal",
        openUrl,
        ticketId: sid,
        dedupeKey: `web_ticket:mention:${sid}:${userId}`,
        replaceDedupe: true,
      });
    }),
  ).catch(() => null);
  return mentioned;
}

async function notifyUserTicketEvent(guildId?, ticket?, title?, body?, targetUserId = null, { mode = "event", openUrl }: any = {}) {
  const userId = String(targetUserId || ticket?.userId || "").trim();
  if (!guildId || !userId) return;
  const sid = String(ticket._id || ticket.id || "");
  if (shouldSkipWebTicketInAppNotif(userId, sid, mode)) return;
  const key = mode === "claimed" ? `web_ticket:claimed:${sid}` : `web_ticket:${mode}:${sid}:${userId}`;
  const isStaffTarget = Boolean(openUrl && String(openUrl).includes("view=staff"));
  await enqueueSiteInAppNotification({
    guildId,
    userId,
    title,
    body,
    kind: "web_ticket",
    channel: isStaffTarget ? "inbox" : "personal",
    openUrl: openUrl || `/tickets/?ticketId=${sid}#${sid}`,
    ticketId: sid,
    dedupeKey: key,
    dedupeWindowMs: 86_400_000,
    replaceDedupe: mode === "claimed" || mode === "closed" || mode === "close-request" || mode === "close-rejected",
  }).catch(() => null);
  if (mode === "closed" && !isStaffTarget) {
    await removeInboxItemByDedupeKey(userId, `web_ticket:needs_reply:${sid}`).catch(() => null);
    await removeInboxItemByDedupeKey(userId, `web_ticket:staff_reply:${sid}`).catch(() => null);
  }
}

function ticketChatOpenUrl(ticket?, userId?) {
  const sid = String(ticket?._id || ticket?.id || "");
  const owner = String(ticket?.userId || "").trim();
  const added = ticketHasAddedUser(ticket, userId);
  if (String(userId) === owner || added) return `/tickets/?ticketId=${sid}#${sid}`;
  return `/tickets/?view=staff&ticketId=${sid}#${sid}`;
}

async function clearTicketNeedsReplyNotif(ticket?, userId?) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!sid || !uid) return;
  await removeInboxItemByDedupeKey(uid, `web_ticket:needs_reply:${sid}`).catch(() => null);
  await removeInboxItemByDedupeKey(uid, `web_ticket:staff_reply:${sid}`).catch(() => null);
}

/** Destinatari tipici delle notif di un ticket (owner/claimer/added/autori + opz. staff categoria). */
async function listTicketNotifRecipientIds(client?, ticket?, { includeCategoryStaff = false } = {}) {
  const ids = new Set();
  const owner = String(ticket?.userId || "").trim();
  const claimer = String(ticket?.claimedBy || "").trim();
  if (owner) ids.add(owner);
  if (claimer) ids.add(claimer);
  for (const u of listAddedUsers(ticket)) {
    if (u?.id) ids.add(String(u.id));
  }
  try {
    const authors = await listTicketMessageAuthorIds(ticket?._id || ticket?.id);
    for (const id of authors || []) {
      const s = String(id || "").trim();
      if (s) ids.add(s);
    }
  } catch (_) {}
  if (includeCategoryStaff && client) {
    try {
      const staff = await listStaffRecipientsForCategory(
        client,
        String(ticket?.guildId || "").trim(),
        ticket?.category || "supporto",
        owner ? [owner] : [],
      );
      for (const id of staff || []) ids.add(String(id));
    } catch (_) {}
  }
  return [...ids].filter(Boolean);
}

/**
 * ticketSmartNotif1: purge inbox+OS per un ticket su più utenti.
 * Non tocca web_ticket:queue:* (refresh coda a parte).
 */
async function purgeTicketNotifications(
  client?,
  ticket?,
  { includeCategoryStaff = false, excludeUserIds = [], forceDismiss = true } = {},
) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  if (!sid) return 0;
  const excluded = new Set(
    (Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const recipients = (await listTicketNotifRecipientIds(client, ticket, { includeCategoryStaff })).filter(
    (id?) => !excluded.has((id as any)),
  );
  let n = 0;
  await Promise.all(
    recipients.map(async (userId?) => {
      const removed = await removeSiteInAppNotificationsForTicket(userId, sid, { forceDismiss }).catch(() => 0);
      n += Number(removed) || 0;
    }),
  ).catch(() => null);
  return n;
}

async function notifyTicketChatMessage(
  ticket?,
  {
    authorId,
    authorName,
    preview,
    kind,
    messageId,
    skipUserIds = [],
    client = null,
    deferStaffToQueue = false,
  }: any = {},
) {
  /* notifUseful1: opener Personali (staff reply / needs reply) + staff Inbox new-msg for participants */
  if (!ticket) return;
  const guildId = String(ticket.guildId || "").trim();
  const sid = String(ticket._id || ticket.id || "");
  const author = String(authorId || "").trim();
  if (!guildId || !sid || !author) return;
  const skip = new Set(
    (Array.isArray(skipUserIds) ? skipUserIds : [skipUserIds]).map((id?) => String(id || "").trim()).filter(Boolean),
  );
  skip.add(author);

  try {
    const { cancelChatDmFallback } = require("../http/siteChatDmFallback") as typeof import("../http/siteChatDmFallback");
    cancelChatDmFallback("ticket", sid, author);
  } catch (_) {}

  const recipients = new Set();
  const claimer = String(ticket.claimedBy || "").trim();
  const owner = String(ticket.userId || "").trim();
  if (claimer) recipients.add(claimer);
  if (owner) recipients.add(owner);
  for (const u of listAddedUsers(ticket)) {
    if (u.id) recipients.add(u.id);
  }
  /* ticketSmartNotif1: se claimato → solo claimer/owner/added (niente autori storici staff) */
  if (!claimer) {
    try {
      const authors = await listTicketMessageAuthorIds(ticket._id || ticket.id);
      for (const id of authors || []) recipients.add(String(id));
    } catch (_) {}
  }

  for (const id of skip) recipients.delete(id);
  /* pushDismissDedup1: ticket libero → staff avvisati solo via coda (niente chat+queue doppie) */
  if (deferStaffToQueue && client && !claimer) {
    try {
      const staffIds = await listStaffRecipientsForCategory(client, guildId, ticket.category || "supporto", []);
      for (const id of staffIds || []) recipients.delete(String(id));
    } catch (_) {}
  }
  if (!recipients.size) return;

  const subject = String(ticket.subject || ticket.channelName || "").trim() || "Ticket";
  const safeAuthor = String(authorName || "Qualcuno").trim() || "Qualcuno";
  const previewText = String(preview || "Nuovo messaggio").trim() || "Nuovo messaggio";
  const authorIsStaff = String(kind || "").trim().toLowerCase() === "staff";
  const dmTargets = [];

  if (authorIsStaff && owner && !skip.has(owner)) {
    const ownerOpen = `/tickets/?ticketId=${sid}#${sid}`;
    const ownerBody = previewText.startsWith(safeAuthor) ? previewText : `${safeAuthor}: ${previewText}`;
    /* Una sola notifica personale: risposta staff + CTA a rispondere (niente doppio staff_reply/needs_reply) */
    await enqueueSiteInAppNotification({
      guildId,
      userId: owner,
      title: "Staff ha risposto",
      body: ownerBody,
      kind: "web_ticket",
      channel: "personal",
      openUrl: ownerOpen,
      ticketId: sid,
      dedupeKey: `web_ticket:staff_reply:${sid}`,
      replaceDedupe: true,
      fromName: safeAuthor,
      ticketLabel: subject,
      preview: previewText,
      messageId,
      collapseChat: true,
    }).catch(() => null);
    /* Pulisci eventuale needs_reply legacy ancora in inbox */
    await removeInboxItemByDedupeKey(owner, `web_ticket:needs_reply:${sid}`).catch(() => null);
    dmTargets.push({
      userId: owner,
      openPath: ownerOpen,
      title: "Staff ha risposto",
      body: ownerBody,
    });
    recipients.delete(owner);
  }

  if (!authorIsStaff && owner && author === owner) {
    await clearTicketNeedsReplyNotif(ticket, owner);
    await removeInboxItemByDedupeKey(owner, `web_ticket:sla:${sid}`).catch(() => null);
  }

  await Promise.all(
    [...recipients].map((userId?) => {
      const openUrl = ticketChatOpenUrl(ticket, userId);
      const staffView = openUrl.includes("view=staff");
      const title = staffView ? "Nuovo messaggio" : safeAuthor;
      dmTargets.push({ userId, openPath: openUrl, title, body: previewText });
      return enqueueSiteInAppNotification({
        guildId,
        userId,
        title,
        body: previewText,
        kind: "web_ticket",
        channel: staffView ? "inbox" : "personal",
        openUrl,
        ticketId: sid,
        dedupeKey: `web_ticket:chat:${sid}:${userId}`,
        replaceDedupe: true,
        collapseChat: true,
        fromName: safeAuthor,
        ticketLabel: subject,
        preview: previewText,
        messageId,
      });
    }),
  ).catch(() => null);

  if (!authorIsStaff && claimer) {
    await removeInboxItemByDedupeKey(claimer, `web_ticket:sla:${sid}`).catch(() => null);
  }

  if (client && dmTargets.length) {
    try {
      const { scheduleChatDmFallback } = require("../http/siteChatDmFallback") as typeof import("../http/siteChatDmFallback");
      for (const t of dmTargets) {
        void scheduleChatDmFallback(client, {
          scope: "ticket",
          threadId: sid,
          userId: t.userId,
          guildId,
          messageId,
          openPath: t.openPath,
          title: t.title,
          body: t.body,
          label: subject,
          kind: "web_ticket",
        });
      }
    } catch (_) {}
  }
}

async function createSystemMessage(ticket?, content?) {
  /* ticketClaimHard1: updateOne evita VersionError dopo findOneAndUpdate (claim atomico) */
  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: "system",
    authorName: "Sistema",
    authorAvatarUrl: "",
    authorKind: "system",
    content: sanitizeText(content, MAX_CONTENT),
    imageUrls: [],
  });
  const now = new Date();
  const preview = previewFromContent(content, 0);
  await SiteWebTicket.updateOne(
    { _id: ticket._id },
    {
      $set: {
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastAuthorKind: "system",
      },
      $inc: { messageCount: 1 },
    },
  ).catch(() => null);
  try {
    ticket.lastMessageAt = now;
    ticket.lastMessagePreview = preview;
    ticket.lastAuthorKind = "system";
    ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  } catch {
    /* in-memory sync best-effort */
  }
  return msg;
}

function ticketBroadcastPayload(serializedOrDoc?, { includeStaffFields = true } = {}) {
  const base =
    serializedOrDoc && typeof serializedOrDoc === "object" && serializedOrDoc.id && serializedOrDoc.permissions !== undefined
      ? { ...serializedOrDoc }
      : serializeTicket(serializedOrDoc, { includeStaffFields });
  if (base && typeof base === "object") {
    delete base.permissions;
  }
  return base;
}

/* ticketSlaOff1: SLA ticket disattivate (né “non preso” né “in attesa staff”).
   Lo sweep resta solo per purgare residue in inbox. */
const WEB_TICKET_SLA_SWEEP_MS = 5 * 60 * 1000;
let webTicketSlaLoopHandle = null;

async function clearTicketSlaNotifsForTicket(client?, ticket?, { onlyUserIds = null } = {}) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  if (!sid) return;
  const guildId = String(ticket.guildId || "").trim();
  const category = normalizeCategory(ticket.category) || "supporto";
  let recipients;
  if (Array.isArray(onlyUserIds)) {
    /* notifPerStaffRead1: al claim cancella SLA solo a chi ha claimato — gli altri la tengono unread */
    recipients = onlyUserIds.map((id?) => String(id || "").trim()).filter(Boolean);
  } else {
    recipients = await listStaffRecipientsForCategory(client, guildId, category, [ticket.userId]);
    const claimer = String(ticket.claimedBy || "").trim();
    if (claimer) recipients.push(claimer);
  }
  await Promise.all(
    [...new Set(recipients)].map((userId?) =>
      removeInboxItemByDedupeKey(userId, `web_ticket:sla:${sid}`).catch(() => null),
    ),
  ).catch(() => null);
  /* ticketSlaPushOnce2: reset lock OS così un nuovo ciclo (claim/risposta/nuovo msg) può ripingere una volta */
  if (!Array.isArray(onlyUserIds)) {
    await SiteWebTicket.updateOne({ _id: sid }, { $unset: { slaOsPushEpochMs: 1 } }).catch(() => null);
  }
}

async function sweepWebTicketSlaNotifications(client?) {
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !client) return { checked: 0, notified: 0, purged: 0 };
  const open = await SiteWebTicket.find({
    guildId,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  })
    .select("_id guildId category userId claimedBy")
    .limit(120)
    .lean()
    .catch(() => []);
  if (!Array.isArray(open) || !open.length) return { checked: 0, notified: 0, purged: 0 };

  let purged = 0;
  for (const ticket of open) {
    try {
      await clearTicketSlaNotifsForTicket(client, ticket);
      purged += 1;
    } catch (_) {}
  }
  return { checked: open.length, notified: 0, purged };
}

function startWebTicketSlaNotifLoop(client?) {
  if (webTicketSlaLoopHandle) return webTicketSlaLoopHandle;
  const tick = () => {
    void sweepWebTicketSlaNotifications(client).catch((err?) =>
      global.logger?.warn?.("[WEB TICKET SLA]", err?.message || err),
    );
  };
  tick();
  webTicketSlaLoopHandle = setInterval(tick, WEB_TICKET_SLA_SWEEP_MS);
  webTicketSlaLoopHandle.unref?.();
  return webTicketSlaLoopHandle;
}

export = { MAX_CONTENT, emitTicketEvent, listStaffRecipientsForCategory, refreshStaffTicketQueueNotif, notifyStaffNewTicket, notifyMentionedUsers, notifyUserTicketEvent, purgeTicketNotifications, notifyTicketChatMessage, createSystemMessage, ticketBroadcastPayload, clearTicketSlaNotifsForTicket, startWebTicketSlaNotifLoop };
