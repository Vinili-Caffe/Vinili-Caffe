/**
 * Notifiche in-app per code inbox staff (pause, candidature, appelli, resoconti)
 * e per l'esito delle richieste pausa verso il richiedente.
 */
const IDs = require("../Config/ids");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const { collectHumanMemberIdsWithRole } = require("../Discord/threadRoleMembers");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffLadderRoleIds,
  staffRoleId,
} = require("../Staff/staffRoleHierarchy");
const {
  getResocontoReviewerUserIdsForSegment,
  getResocontoButtonAllowedRoleIds,
} = require("../Staff/resocontoAccess");

const RECIPIENT_CACHE_TTL_MS = 60_000;
const recipientCache = new Map();

const QUEUE_TAB = Object.freeze({
  pause: "pause",
  candidature: "candidature",
  appelli: "appelli",
  resoconti: "resoconti",
});

function inboxOpenUrl(queue, itemHint = "") {
  const tab = QUEUE_TAB[String(queue || "").trim().toLowerCase()] || "pause";
  const hint = String(itemHint || "").trim();
  let url = `/staff/inbox/?tab=${encodeURIComponent(tab)}`;
  if (hint) url += `&item=${encodeURIComponent(hint)}`;
  return url;
}

function cacheGet(key) {
  const hit = recipientCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.ids;
}

function cacheSet(key, ids) {
  recipientCache.set(key, { expiresAt: Date.now() + RECIPIENT_CACHE_TTL_MS, ids: [...ids] });
  return ids;
}

async function collectIdsForRoleIds(guild, roleIds) {
  const ids = new Set();
  const roles = [...new Set((roleIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  for (const roleId of roles) {
    const members = await collectHumanMemberIdsWithRole(guild, roleId, {
      logTag: "[siteStaffWorkflowNotifications]",
    }).catch(() => []);
    for (const id of members || []) ids.add(String(id));
  }
  return [...ids];
}

async function getInboxRecipientUserIds(guild, queue, opts = {}) {
  const q = String(queue || "").trim().toLowerCase();
  const guildId = String(guild?.id || "").trim();
  if (!guild || !guildId || !q) return [];

  const roleIdHint = String(opts.roleId || "").trim();
  const kindHint = String(opts.kind || "").trim().toLowerCase();
  const cacheKey = `${guildId}:${q}:${kindHint}:${roleIdHint}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let ids = [];
  if (q === "pause") {
    ids = await collectIdsForRoleIds(guild, staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
  } else if (q === "appelli") {
    ids = await collectIdsForRoleIds(
      guild,
      staffLadderRoleIds([...STAFF_HIGH_STAFF_ELIGIBLE_KEYS, "Director"]),
    );
  } else if (q === "candidature") {
    ids = await collectIdsForRoleIds(guild, [
      staffRoleId("Admin"),
      staffRoleId("Manager"),
      staffRoleId("Founder"),
      staffRoleId("Director"),
    ]);
    const ownerId = String(guild.ownerId || "").trim();
    if (/^\d{16,22}$/.test(ownerId)) ids.push(ownerId);
  } else if (q === "resoconti") {
    const segment =
      kindHint === "p"
        ? "pm"
        : null;
    const reviewers = getResocontoReviewerUserIdsForSegment(segment, roleIdHint);
    const alwaysRoles = getResocontoButtonAllowedRoleIds({ kind: kindHint, roleId: roleIdHint });
    const extras = await collectIdsForRoleIds(guild, alwaysRoles);
    ids = [...new Set([...reviewers, ...extras])];
  }

  ids = [...new Set(ids.map((id) => String(id || "").trim()).filter((id) => /^\d{16,22}$/.test(id)))];
  return cacheSet(cacheKey, ids);
}

async function notifyInboxStaffNewItem(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  if (!guild || !guildId || !QUEUE_TAB[queue]) return 0;

  const subjectUserId = String(opts.subjectUserId || "").trim();
  const recipients = (await getInboxRecipientUserIds(guild, queue, {
    roleId: opts.roleId,
    kind: opts.kind,
  })).filter((id) => id && id !== subjectUserId);
  if (!recipients.length) return 0;

  const subjectName = String(opts.subjectName || "").trim() || "Un utente";
  const title = String(opts.title || "").trim().slice(0, 120);
  const body =
    String(opts.body || "").trim().slice(0, 500) ||
    `${subjectName} ha una nuova richiesta in inbox (${queue}).`;
  if (!title) return 0;

  const itemHint = String(opts.itemId || opts.messageId || opts.pauseId || "").trim();
  const openUrl = String(opts.openUrl || inboxOpenUrl(queue, itemHint)).trim().slice(0, 400);
  const dedupeKey =
    String(opts.dedupeKey || "").trim().slice(0, 120) ||
    `inbox:${queue}:new:${itemHint || subjectUserId || Date.now()}`;

  await Promise.all(
    recipients.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title,
        body,
        kind: "mod",
        openUrl,
        dedupeKey,
        dedupeWindowMs: 86_400_000,
      }).catch(() => false),
    ),
  ).catch(() => null);
  return recipients.length;
}

async function notifyPauseRequesterDecision(opts = {}) {
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  const userId = String(opts.userId || "").trim();
  const status = String(opts.status || "").trim().toLowerCase();
  if (!guildId || !/^\d{16,22}$/.test(userId)) return false;
  if (!["accepted", "rejected", "cancelled"].includes(status)) return false;

  const period = String(opts.periodText || "").trim();
  const decidedByName = String(opts.decidedByName || "").trim();
  const pauseId = String(opts.pauseId || "").trim();

  let title = "Aggiornamento richiesta pausa";
  let body = "La tua richiesta di pausa è stata aggiornata.";
  let kind = "info";
  if (status === "accepted") {
    title = "Pausa accettata";
    body = period
      ? `La tua richiesta di pausa (${period}) è stata accettata.`
      : "La tua richiesta di pausa è stata accettata.";
    kind = "success";
  } else if (status === "rejected") {
    title = "Pausa rifiutata";
    body = period
      ? `La tua richiesta di pausa (${period}) è stata rifiutata.`
      : "La tua richiesta di pausa è stata rifiutata.";
    kind = "mod";
  } else if (status === "cancelled") {
    title = "Pausa annullata";
    body = period
      ? `La tua richiesta di pausa (${period}) è stata annullata.`
      : "La tua richiesta di pausa è stata annullata.";
    kind = "info";
  }
  if (decidedByName && status !== "cancelled") {
    body = `${body} (da ${decidedByName})`.slice(0, 500);
  }

  return enqueueSiteInAppNotification({
    guildId,
    userId,
    title,
    body,
    kind,
    openUrl: "/staff/pause/",
    dedupeKey: `pause:decision:${pauseId || userId}:${status}`,
    dedupeWindowMs: 86_400_000,
  }).catch(() => false);
}

function practiceLabel(queue, workflow) {
  const q = String(queue || "").trim().toLowerCase();
  if (q === "candidature") return "candidatura";
  if (q === "pause") return "richiesta pausa";
  const kind = String(workflow?.workflowKind || workflow?.workflowType || "")
    .trim()
    .toLowerCase();
  if (kind === "unmute") return "richiesta unmute";
  if (kind === "unban") return "richiesta unban";
  if (q === "appelli") return "richiesta unban/unmute";
  return "pratica";
}

function subjectChatOpenUrl(queue, dedupeKey) {
  try {
    const { subjectWorkflowChatPath } = require("./discordWorkflowUiGate");
    return subjectWorkflowChatPath(queue, dedupeKey);
  } catch {
    const q = String(queue || "").trim().toLowerCase();
    const key = String(dedupeKey || "").trim();
    const base = q === "appelli" ? "/appelli/" : "/candidature/";
    return key ? `${base}?chat=${encodeURIComponent(key)}` : base;
  }
}

function itemHintFromDedupe(dedupeKey) {
  const parts = String(dedupeKey || "")
    .trim()
    .split(":")
    .filter(Boolean);
  if (parts.length < 2) return "";
  return parts.slice(1).join(":");
}

async function notifyUsersList(guildId, userIds, payload, excludeIds = []) {
  const exclude = new Set((excludeIds || []).map(String));
  const ids = [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => /^\d{16,22}$/.test(id) && !exclude.has(id)),
    ),
  ];
  if (!ids.length) return 0;
  await Promise.all(
    ids.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: String(payload.title || "").trim().slice(0, 120),
        body: String(payload.body || "").trim().slice(0, 500),
        kind: payload.kind || "mod",
        openUrl: String(payload.openUrl || "").trim().slice(0, 400) || undefined,
        dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 120) || undefined,
        dedupeWindowMs: payload.dedupeWindowMs ?? 86_400_000,
      }).catch(() => false),
    ),
  ).catch(() => null);
  return ids.length;
}

/** Richiedente aggiunto alla chat (candidature/appelli). */
async function notifyWorkflowSubjectInvited(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const subjectUserId = String(opts.subjectUserId || "").trim();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  const actorId = String(opts.actorId || "").trim();
  const actorName = String(opts.actorName || "").trim() || "Lo staff";
  if (!guildId || !QUEUE_TAB[queue] || !/^\d{16,22}$/.test(subjectUserId)) return { subject: false, staff: 0 };

  const label = practiceLabel(queue, opts.workflow);
  const subjectUrl = subjectChatOpenUrl(queue, dedupeKey);
  const subjectOk = await enqueueSiteInAppNotification({
    guildId,
    userId: subjectUserId,
    title: "Messaggio dallo staff",
    body: `Sei stato aggiunto alla chat della tua ${label}. Apri per leggere e rispondere.`,
    kind: "mod",
    openUrl: subjectUrl,
    dedupeKey: `wfc:invite:subj:${dedupeKey || subjectUserId}`,
    dedupeWindowMs: 3_600_000,
  }).catch(() => false);

  const staffIds = await getInboxRecipientUserIds(guild, queue, {
    roleId: opts.roleId,
    kind: opts.workflow?.workflowKind || opts.kind,
  });
  const staff = await notifyUsersList(
    guildId,
    staffIds,
    {
      title: "Richiedente in chat",
      body: `${actorName} ha aggiunto il richiedente alla discussione (${label}).`,
      kind: "info",
      openUrl: inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey)),
      dedupeKey: `wfc:invite:staff:${dedupeKey || subjectUserId}`,
      dedupeWindowMs: 3_600_000,
    },
    [subjectUserId, actorId],
  );

  return { subject: Boolean(subjectOk), staff };
}

/** Richiedente rimosso dalla chat. */
async function notifyWorkflowSubjectRemoved(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const subjectUserId = String(opts.subjectUserId || "").trim();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  const actorId = String(opts.actorId || "").trim();
  const actorName = String(opts.actorName || "").trim() || "Lo staff";
  if (!guildId || !QUEUE_TAB[queue] || !/^\d{16,22}$/.test(subjectUserId)) return { subject: false, staff: 0 };

  const label = practiceLabel(queue, opts.workflow);
  const subjectUrl = subjectChatOpenUrl(queue, dedupeKey);
  const subjectOk = await enqueueSiteInAppNotification({
    guildId,
    userId: subjectUserId,
    title: "Chat aggiornata",
    body: `Sei stato rimosso dalla discussione della tua ${label}. Puoi ancora leggere i messaggi ricevuti mentre eri presente.`,
    kind: "info",
    openUrl: subjectUrl,
    dedupeKey: `wfc:remove:subj:${dedupeKey || subjectUserId}:${Date.now()}`,
    dedupeWindowMs: 60_000,
  }).catch(() => false);

  const staffIds = await getInboxRecipientUserIds(guild, queue, {
    roleId: opts.roleId,
    kind: opts.workflow?.workflowKind || opts.kind,
  });
  const staff = await notifyUsersList(
    guildId,
    staffIds,
    {
      title: "Richiedente rimosso dalla chat",
      body: `${actorName} ha rimosso il richiedente dalla discussione (${label}).`,
      kind: "info",
      openUrl: inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey)),
      dedupeKey: `wfc:remove:staff:${dedupeKey || subjectUserId}`,
      dedupeWindowMs: 3_600_000,
    },
    [subjectUserId, actorId],
  );

  return { subject: Boolean(subjectOk), staff };
}

/**
 * Nuovo messaggio in chat pratica:
 * - staff → notifica richiedente (se in chat / pause)
 * - richiedente → notifica reviewer inbox
 */
async function notifyWorkflowChatNewMessage(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  const subjectUserId = String(opts.subjectUserId || "").trim();
  const authorId = String(opts.authorId || "").trim();
  const authorKind = String(opts.authorKind || "").trim().toLowerCase();
  const authorName = String(opts.authorName || "").trim() || "Qualcuno";
  const preview = String(opts.preview || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const subjectInChat = opts.subjectInChat !== false;
  if (!guildId || !QUEUE_TAB[queue] || !dedupeKey) return { subject: false, staff: 0 };
  if (authorKind === "system") return { subject: false, staff: 0 };

  const label = practiceLabel(queue, opts.workflow);
  const inviteOnly = queue === "candidature" || queue === "appelli";

  if (authorKind === "staff" || (authorKind !== "user" && authorId && authorId !== subjectUserId)) {
    if (!/^\d{16,22}$/.test(subjectUserId)) return { subject: false, staff: 0 };
    if (inviteOnly && !subjectInChat) return { subject: false, staff: 0 };
    if (authorId === subjectUserId) return { subject: false, staff: 0 };
    const openUrl =
      queue === "pause" ? "/staff/pause/" : subjectChatOpenUrl(queue, dedupeKey);
    const subjectOk = await enqueueSiteInAppNotification({
      guildId,
      userId: subjectUserId,
      title: `Nuovo messaggio · ${label}`,
      body: preview ? `${authorName}: ${preview}` : `${authorName} ha scritto nella chat della tua ${label}.`,
      kind: "mod",
      openUrl,
      dedupeKey: `wfc:msg:subj:${dedupeKey}`,
      dedupeWindowMs: 90_000,
    }).catch(() => false);
    return { subject: Boolean(subjectOk), staff: 0 };
  }

  if (authorKind === "user" || authorId === subjectUserId) {
    const staffIds = await getInboxRecipientUserIds(guild, queue, {
      roleId: opts.roleId,
      kind: opts.workflow?.workflowKind || opts.kind,
    });
    const staff = await notifyUsersList(
      guildId,
      staffIds,
      {
        title: `Risposta richiedente · ${label}`,
        body: preview ? `${authorName}: ${preview}` : `${authorName} ha risposto nella chat.`,
        kind: "mod",
        openUrl: inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey)),
        dedupeKey: `wfc:msg:staff:${dedupeKey}`,
        dedupeWindowMs: 90_000,
      },
      [subjectUserId, authorId],
    );
    return { subject: false, staff };
  }

  return { subject: false, staff: 0 };
}

module.exports = {
  inboxOpenUrl,
  getInboxRecipientUserIds,
  notifyInboxStaffNewItem,
  notifyPauseRequesterDecision,
  notifyWorkflowSubjectInvited,
  notifyWorkflowSubjectRemoved,
  notifyWorkflowChatNewMessage,
};
