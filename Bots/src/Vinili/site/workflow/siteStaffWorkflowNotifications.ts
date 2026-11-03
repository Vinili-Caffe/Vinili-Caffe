const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { userPrefersNotifDigest } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { collectHumanMemberIdsWithRole } = require("../../Community/utils/threadRoleMembers") as typeof import("../../Community/utils/threadRoleMembers");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffLadderRoleIds,
  staffRoleId,
} = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
const {
  getResocontoReviewerUserIdsForSegment,
  getResocontoButtonAllowedRoleIds,
} = require("../../Staff/utils/resocontoAccess") as typeof import("../../Staff/utils/resocontoAccess");

const RECIPIENT_CACHE_TTL_MS = 5 * 60_000;
const recipientCache = new Map();

const QUEUE_TAB = Object.freeze({
  pause: "pause",
  candidature: "candidature",
  appelli: "appelli",
  resoconti: "resoconti",
  revisione: "revisione",
});

const DIGESTABLE_QUEUES = new Set(["resoconti"]);
const DIGEST_LABEL = Object.freeze({
  resoconti: "resoconti",
});

function profileStaffOpenUrl(staffOpen?, subjectUserId = "", extra: Record<string, any> = {}) {
  const open = String(staffOpen || "").trim();
  if (!open) return "/user/?tab=staff";
  const subject = String(subjectUserId || "").trim();
  let url = /^\d{16,22}$/.test(subject)
    ? `/user/?id=${encodeURIComponent(subject)}&tab=staff&staffOpen=${encodeURIComponent(open)}`
    : `/user/?tab=staff&staffOpen=${encodeURIComponent(open)}`;
  const pauseId = String(extra.pauseId || "").trim();
  const resoId = String(extra.resoId || "").trim();
  if (pauseId) url += `&pauseId=${encodeURIComponent(pauseId)}`;
  if (resoId) url += `&resoId=${encodeURIComponent(resoId)}`;
  return url;
}

function inboxOpenUrl(queue?, itemHint = "", subjectUserId = "") {
  const q = String(queue || "").trim().toLowerCase();
  const hint = String(itemHint || "").trim();
  const subject = String(subjectUserId || "").trim();
  /* pauseOutInbox1 / pauseResoNotifProfile1: fuori inbox → card sul profilo staff */
  if (q === "pause") {
    return profileStaffOpenUrl("pause", subject, { pauseId: hint });
  }
  /* resoProfile1 / pauseResoNotifProfile1: fuori inbox → card resoconto sul profilo */
  if (q === "resoconti") {
    return profileStaffOpenUrl("resoconto", subject, { resoId: hint });
  }
  /* boardsRevPreview1: revisione → anteprima scheda (Approva/Rifiuta lì) */
  if (q === "revisione") {
    let lid = hint
      .replace(/^boards:revisione:/i, "")
      .replace(/^revisione:/i, "")
      .trim();
    if (!/^[a-f0-9]{24}$/i.test(lid)) {
      const m = hint.match(/([a-f0-9]{24})/i);
      lid = m ? m[1] : "";
    }
    /* boardsRevLangPath1: scheda?id= (no pretty path — evita miss con /en/…) */
    if (lid) return `/vetrina/scheda/?id=${encodeURIComponent(lid)}&review=1`;
    return `/notifications/?view=staff&inbox=revisione&scope=pending`;
  }
  const tab = QUEUE_TAB[q] || "candidature";
  let url = `/notifications/?view=staff&inbox=${encodeURIComponent(tab)}&scope=pending`;
  if (hint) url += `&item=${encodeURIComponent(hint)}`;
  return url;
}

function cacheGet(key?) {
  const hit = recipientCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.ids;
}

function cacheSet(key?, ids?) {
  recipientCache.set(key, { expiresAt: Date.now() + RECIPIENT_CACHE_TTL_MS, ids: [...ids] });
  return ids;
}

async function collectIdsForRoleIds(guild?, roleIds?) {
  const ids = new Set();
  const roles = [...new Set((roleIds || []).map((id?) => String(id || "").trim()).filter(Boolean))];
  for (const roleId of roles) {
    const members = await collectHumanMemberIdsWithRole(guild, roleId, {
      logTag: "[siteStaffWorkflowNotifications]",
    }).catch(() => []);
    for (const id of members || []) ids.add(String(id));
  }
  return [...ids];
}

async function getInboxRecipientUserIds(guild?, queue?, opts: Record<string, any> = {}) {
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
  } else if (q === "revisione") {
    /* boardsRevHsOnly1: solo High Staff (come pause), non tutto lo Staff */
    ids = await collectIdsForRoleIds(guild, staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
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

  ids = [...new Set(ids.map((id?) => String(id || "").trim()).filter((id?) => /^\d{16,22}$/.test(id)))];
  return cacheSet(cacheKey, ids);
}

async function notifyInboxStaffNewItem(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  if (!guild || !guildId || !QUEUE_TAB[queue]) return 0;

  const subjectUserId = String(opts.subjectUserId || "").trim();
  /* boardsInboxSelfNotif1: in revisione bacheca il mittente è spesso staff
     (es. scheda del server principale) → non escluderlo dalla notifica. */
  const keepSubject = queue === "revisione" || opts.includeSubject === true;
  const recipients = (await getInboxRecipientUserIds(guild, queue, {
    roleId: opts.roleId,
    kind: opts.kind,
  })).filter((id?) => id && (keepSubject || id !== subjectUserId));
  if (!recipients.length) return 0;

  const subjectName = String(opts.subjectName || "").trim() || "Un utente";
  const title = String(opts.title || "").trim().slice(0, 120);
  const body =
    String(opts.body || "").trim().slice(0, 500) ||
    `${subjectName} ha una nuova richiesta in inbox (${queue}).`;
  if (!title) return 0;

  const itemHint = String(opts.itemId || opts.messageId || opts.pauseId || "").trim();
  const openUrl = String(opts.openUrl || inboxOpenUrl(queue, itemHint, subjectUserId))
    .trim()
    .slice(0, 400);
  const dedupeKey =
    String(opts.dedupeKey || "").trim().slice(0, 120) ||
    `inbox:${queue}:new:${itemHint || subjectUserId || Date.now()}`;

  await Promise.all(
    recipients.map(async (userId?) => {
      const useDigest =
        DIGESTABLE_QUEUES.has(queue) &&
        (await userPrefersNotifDigest(guildId, userId, queue).catch(() => true));
      if (useDigest) {
        return enqueueSiteInAppNotification({
          guildId,
          userId,
          title,
          body,
          kind: "mod",
          channel: "inbox",
          openUrl,
          dedupeKey: `inbox:${queue}:digest:${userId}`,
          replaceDedupe: true,
          collapseDigest: true,
          digestLabel: DIGEST_LABEL[queue] || queue,
          digestPushWindowMs: 180_000,
        }).catch(() => false);
      }
      return enqueueSiteInAppNotification({
        guildId,
        userId,
        title,
        body,
        kind: "mod",
        channel: "inbox",
        openUrl,
        dedupeKey,
        dedupeWindowMs: 86_400_000,
      }).catch(() => false);
    }),
  ).catch(() => null);
  /* inboxBadgeLive1: bust summary cache subito — altrimenti campanella/categoria restano a 0 per TTL */
  try {
    const { invalidateWorkflowSummaryCache } = require("./siteStaffWorkflowApi") as typeof import("./siteStaffWorkflowApi");
    invalidateWorkflowSummaryCache();
  } catch (_) {}
  /* siteLiveAll1: nuovo item inbox → refresh liste aperte subito (oltre alle notif) */
  try {
    const { broadcastSiteStaffWorkflowChangedDebounced } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    broadcastSiteStaffWorkflowChangedDebounced(queue);
  } catch (_) {}
  return recipients.length;
}

async function notifyPauseRequesterDecision(opts: Record<string, any> = {}) {
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
    channel: "personal",
    openUrl: "/staff/pause/",
    dedupeKey: `pause:decision:${pauseId || userId}:${status}`,
    dedupeWindowMs: 86_400_000,
  }).catch(() => false);
}

function practiceLabel(queue?, workflow?) {
  const q = String(queue || "").trim().toLowerCase();
  if (q === "candidature") return "candidatura";
  if (q === "pause") return "richiesta pausa";
  if (q === "revisione") {
    const bk = String(workflow?.workflowKind || workflow?.workflowType || "")
      .trim()
      .toLowerCase();
    return bk === "bot" ? "scheda bot" : "scheda server";
  }
  const kind = String(workflow?.workflowKind || workflow?.workflowType || "")
    .trim()
    .toLowerCase();
  if (kind === "unmute") return "richiesta unmute";
  if (kind === "unban") return "richiesta unban";
  if (q === "appelli") return "richiesta unban/unmute";
  return "pratica";
}

function subjectChatOpenUrl(queue?, dedupeKey?) {
  try {
    const { subjectWorkflowChatPath } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
    return subjectWorkflowChatPath(queue, dedupeKey);
  } catch {
    const q = String(queue || "").trim().toLowerCase();
    const key = String(dedupeKey || "").trim();
    if (q === "revisione") return "/vetrina/le-mie/";
    const base = q === "appelli" ? "/appelli/" : "/candidature/";
    return key ? `${base}?chat=${encodeURIComponent(key)}` : base;
  }
}

function itemHintFromDedupe(dedupeKey?) {
  const parts = String(dedupeKey || "")
    .trim()
    .split(":")
    .filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1];
  /* Prefer snowflake / mongo-ish id as focus hint (notifSheetOpenFix1) */
  if (/^\d{16,22}$/.test(last) || /^[a-f0-9]{24}$/i.test(last)) return last;
  return parts.slice(1).join(":");
}

async function notifyUsersList(guildId?, userIds?, payload?, excludeIds = []) {
  const exclude = new Set((excludeIds || []).map(String));
  const ids = [
    ...new Set(
      (userIds || [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id) && !exclude.has(id)),
    ),
  ];
  if (!ids.length) return 0;
  await Promise.all(
    ids.map((userId?) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: String(payload.title || "").trim().slice(0, 120),
        body: String(payload.body || "").trim().slice(0, 500),
        kind: payload.kind || "mod",
        channel: payload.channel || undefined,
        openUrl: String(payload.openUrl || "").trim().slice(0, 400) || undefined,
        dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 120) || undefined,
        dedupeWindowMs: payload.dedupeWindowMs ?? 86_400_000,
        replaceDedupe: payload.replaceDedupe === true,
      }).catch(() => false),
    ),
  ).catch(() => null);
  return ids.length;
}

async function notifyWorkflowSubjectInvited(opts: Record<string, any> = {}) {
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
    channel: "personal",
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
      openUrl: inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey), subjectUserId),
      dedupeKey: `wfc:invite:staff:${dedupeKey || subjectUserId}`,
      dedupeWindowMs: 3_600_000,
    },
    [subjectUserId, actorId],
  );

  return { subject: Boolean(subjectOk), staff };
}

async function notifyWorkflowSubjectRemoved(opts: Record<string, any> = {}) {
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
      openUrl: inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey), subjectUserId),
      dedupeKey: `wfc:remove:staff:${dedupeKey || subjectUserId}`,
      dedupeWindowMs: 3_600_000,
    },
    [subjectUserId, actorId],
  );

  return { subject: Boolean(subjectOk), staff };
}

async function notifyWorkflowChatNewMessage(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const client = opts.client || null;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  const subjectUserId = String(opts.subjectUserId || "").trim();
  const authorId = String(opts.authorId || "").trim();
  const authorKind = String(opts.authorKind || "").trim().toLowerCase();
  const authorName = String(opts.authorName || "").trim() || "Qualcuno";
  const preview = String(opts.preview || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const messageId = String(opts.messageId || "").trim();
  const subjectInChat = opts.subjectInChat !== false;
  const skipUserIds = new Set(
    (Array.isArray(opts.skipUserIds) ? opts.skipUserIds : []).map((id?) => String(id || "").trim()).filter(Boolean),
  );
  if (!guildId || !QUEUE_TAB[queue] || !dedupeKey) return { subject: false, staff: 0 };
  if (authorKind === "system") return { subject: false, staff: 0 };

  if (authorId) {
    try {
      const { cancelChatDmFallback } = require("../../site/http/siteChatDmFallback") as typeof import("../../site/http/siteChatDmFallback");
      cancelChatDmFallback("workflow", dedupeKey, authorId);
    } catch (_) {}
  }

  const label = practiceLabel(queue, opts.workflow);
  /* pauseInviteOnly1: pause gated come candidature/appelli */
  const inviteOnly = queue === "candidature" || queue === "appelli" || queue === "pause";
  const dmTargets = [];

  if (authorKind === "staff" || (authorKind !== "user" && authorId && authorId !== subjectUserId)) {
    if (!/^\d{16,22}$/.test(subjectUserId)) return { subject: false, staff: 0 };
    if (inviteOnly && !subjectInChat) return { subject: false, staff: 0 };
    if (authorId === subjectUserId) return { subject: false, staff: 0 };
    if (skipUserIds.has(subjectUserId)) return { subject: false, staff: 0 };
    const openUrl =
      queue === "pause" ? "/staff/pause/" : subjectChatOpenUrl(queue, dedupeKey);
    const subjectTitle = `Nuovo messaggio · ${label}`;
    const subjectBody = preview
      ? `${authorName}: ${preview}`
      : `${authorName} ha scritto nella chat della tua ${label}.`;
    const subjectOk = await enqueueSiteInAppNotification({
      guildId,
      userId: subjectUserId,
      title: subjectTitle,
      body: subjectBody,
      kind: "mod",
      channel: "personal",
      openUrl,
      dedupeKey: `wfc:msg:subj:${dedupeKey}`,
      dedupeWindowMs: 90_000,
      replaceDedupe: true,
    }).catch(() => false);
    dmTargets.push({
      userId: subjectUserId,
      openPath: openUrl,
      title: subjectTitle,
      body: subjectBody,
      kind: "mod",
    });

    /* notifUseful1: notify other staff participants already in the thread (not whole queue) */
    let peerStaff = 0;
    const peerIds = Array.isArray(opts.participantStaffIds) ? opts.participantStaffIds : [];
    if (peerIds.length) {
      const peers = peerIds.filter(
        (id?) => id && id !== authorId && id !== subjectUserId && !skipUserIds.has(id),
      );
      const peerTitle = `Nuovo messaggio · ${label}`;
      const peerBody = preview
        ? `${authorName}: ${preview}`
        : `${authorName} ha scritto nella discussione.`;
      const peerOpen = inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey), subjectUserId);
      peerStaff = await notifyUsersList(
        guildId,
        peers,
        {
          title: peerTitle,
          body: peerBody,
          kind: "mod",
          channel: "inbox",
          openUrl: peerOpen,
          dedupeKey: `wfc:msg:staff:${dedupeKey}`,
          dedupeWindowMs: 90_000,
          replaceDedupe: true,
        },
        [subjectUserId, authorId],
      );
      for (const id of peers) {
        dmTargets.push({
          userId: id,
          openPath: peerOpen,
          title: peerTitle,
          body: peerBody,
          kind: "mod",
        });
      }
    }
    scheduleWorkflowDmFallbacks(client, {
      guildId,
      dedupeKey,
      messageId,
      label,
      targets: dmTargets,
    });
    return { subject: Boolean(subjectOk), staff: peerStaff };
  }

  if (authorKind === "user" || authorId === subjectUserId) {
    const staffIds = await getInboxRecipientUserIds(guild, queue, {
      roleId: opts.roleId,
      kind: opts.workflow?.workflowKind || opts.kind,
    });
    const peers = Array.isArray(opts.participantStaffIds) ? opts.participantStaffIds : [];
    const targets = peers.length ? peers : staffIds;
    const filtered = targets.filter((id?) => !skipUserIds.has(id));
    const staffTitle = `Risposta richiedente · ${label}`;
    const staffBody = preview
      ? `${authorName}: ${preview}`
      : `${authorName} ha risposto nella chat.`;
    const staffOpen = inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey), subjectUserId);
    const staff = await notifyUsersList(
      guildId,
      filtered,
      {
        title: staffTitle,
        body: staffBody,
        kind: "mod",
        channel: "inbox",
        openUrl: staffOpen,
        dedupeKey: `wfc:msg:staff:${dedupeKey}`,
        dedupeWindowMs: 90_000,
        replaceDedupe: true,
      },
      [subjectUserId, authorId],
    );
    /* DM fallback solo per peer già in thread — mai a tutta la coda staff */
    if (peers.length) {
      for (const id of filtered) {
        dmTargets.push({
          userId: id,
          openPath: staffOpen,
          title: staffTitle,
          body: staffBody,
          kind: "mod",
        });
      }
      scheduleWorkflowDmFallbacks(client, {
        guildId,
        dedupeKey,
        messageId,
        label,
        targets: dmTargets,
      });
    }
    return { subject: false, staff };
  }

  return { subject: false, staff: 0 };
}

function scheduleWorkflowDmFallbacks(client, { guildId, dedupeKey, messageId, label, targets }) {
  if (!client || !Array.isArray(targets) || !targets.length) return;
  try {
    const { scheduleChatDmFallback } = require("../../site/http/siteChatDmFallback") as typeof import("../../site/http/siteChatDmFallback");
    for (const t of targets) {
      void scheduleChatDmFallback(client, {
        scope: "workflow",
        threadId: dedupeKey,
        userId: t.userId,
        guildId,
        messageId,
        openPath: t.openPath,
        title: t.title,
        body: t.body,
        label,
        kind: t.kind || "mod",
      });
    }
  } catch (_) {}
}

async function notifyWorkflowMentions(opts: Record<string, any> = {}) {
  /* notifUseful1: @mentions in workflow chat → Inbox Mentions for staff / Personali for subject */
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  const authorId = String(opts.authorId || "").trim();
  const authorName = String(opts.authorName || "").trim() || "Qualcuno";
  const content = String(opts.content || "");
  const subjectUserId = String(opts.subjectUserId || "").trim();
  if (!guildId || !QUEUE_TAB[queue] || !dedupeKey || !content) return [];

  const re = /<@!?(\d{5,32})>/g;
  const ids = new Set();
  let m;
  while ((m = re.exec(content))) {
    const id = String(m[1] || "").trim();
    if (id && id !== authorId) ids.add(id);
  }
  if (!ids.size) return [];

  const preview = content.replace(/\s+/g, " ").trim().slice(0, 140) || "Ti hanno menzionato";
  const label = practiceLabel(queue, opts.workflow);
  const mentioned = [...ids].slice(0, 40);
  await Promise.all(
    mentioned.map((userId?) => {
      const isSubject = userId === subjectUserId;
      const openUrl = isSubject
        ? subjectChatOpenUrl(queue, dedupeKey)
        : inboxOpenUrl(queue, itemHintFromDedupe(dedupeKey), subjectUserId);
      return enqueueSiteInAppNotification({
        guildId,
        userId,
        title: `${authorName} ti ha menzionato`,
        body: preview,
        kind: "workflow_mention",
        channel: isSubject ? "personal" : "inbox",
        openUrl,
        dedupeKey: `wfc:mention:${dedupeKey}:${userId}`,
        replaceDedupe: true,
      }).catch(() => false);
    }),
  ).catch(() => null);
  return mentioned;
}

async function notifyWorkflowSubjectDecision(opts: Record<string, any> = {}) {
  /* notifUseful1: esito candidatura/appello → Personali richiedente */
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  const userId = String(opts.userId || opts.subjectUserId || "").trim();
  const queue = String(opts.queue || "").trim().toLowerCase();
  const status = String(opts.status || "").trim().toLowerCase();
  const dedupeKey = String(opts.dedupeKey || "").trim();
  if (!guildId || !/^\d{16,22}$/.test(userId)) return false;
  if (!["accepted", "rejected", "cancelled"].includes(status)) return false;

  const label = practiceLabel(queue, opts.workflow);
  const decidedByName = String(opts.decidedByName || "").trim();
  let title = `Aggiornamento ${label}`;
  let body = `La tua ${label} è stata aggiornata.`;
  if (status === "accepted") {
    title = `${label.charAt(0).toUpperCase()}${label.slice(1)} accettata`;
    body = `La tua ${label} è stata accettata.`;
  } else if (status === "rejected") {
    title = `${label.charAt(0).toUpperCase()}${label.slice(1)} rifiutata`;
    body = `La tua ${label} non è stata accettata.`;
  } else if (status === "cancelled") {
    title = `${label.charAt(0).toUpperCase()}${label.slice(1)} annullata`;
    body = `La tua ${label} è stata annullata.`;
  }
  if (opts.body) body = String(opts.body).trim().slice(0, 500);
  if (opts.title) title = String(opts.title).trim().slice(0, 120);
  if (decidedByName && status !== "cancelled" && !String(opts.body || "").includes(decidedByName)) {
    body = `${body} (da ${decidedByName})`.slice(0, 500);
  }

  const openUrl =
    String(opts.openUrl || "").trim() ||
    (queue === "pause" ? "/staff/pause/" : subjectChatOpenUrl(queue, dedupeKey));

  return enqueueSiteInAppNotification({
    guildId,
    userId,
    title,
    body,
    kind: "workflow_decision",
    channel: "personal",
    openUrl,
    dedupeKey:
      String(opts.notifDedupeKey || "").trim() ||
      `wfc:decision:${queue}:${dedupeKey || userId}:${status}`,
    dedupeWindowMs: 86_400_000,
    replaceDedupe: true,
  }).catch(() => false);
}

function workflowItemHintFromDoc(doc?) {
  const mid = String(doc?.workflowMessageId || "").trim();
  if (/^\d{16,22}$/.test(mid) || /^[a-f0-9]{24}$/i.test(mid)) return mid;
  const key = String(doc?.dedupeKey || "").trim();
  const parts = key.split(":").filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  if (/^\d{16,22}$/.test(last) || /^[a-f0-9]{24}$/i.test(last)) return last;
  /* pause:<userId>:<pauseId> */
  if (parts.length >= 3 && String(doc?.workflowQueue || "").toLowerCase() === "pause") {
    return parts[parts.length - 1];
  }
  return last || "";
}

/**
 * smartNotifLifecycle1: su decide/close → purge inbox staff + chat/mention workflow (+ dismiss OS).
 */
async function clearWorkflowLifecycleNotifs(doc?) {
  if (!doc) return { users: 0, removed: 0 };
  try {
    const { removeSiteInAppNotificationsMatching } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
    const queue = String(doc.workflowQueue || "").trim().toLowerCase();
    const dedupeKey = String(doc.dedupeKey || "").trim();
    const hint = workflowItemHintFromDoc(doc);
    const subjectUserId = String(doc.userId || "").trim();
    const exactKeys = [];
    if (queue && hint) exactKeys.push(`inbox:${queue}:new:${hint}`);
    if (queue === "pause" && hint) exactKeys.push(`inbox:pause:new:${hint}`);
    if (dedupeKey) {
      /* alcune code usano dedupeKey grezzo come item hint */
      exactKeys.push(`inbox:${queue}:new:${dedupeKey}`);
    }
    const prefixes = [];
    if (dedupeKey) {
      prefixes.push(`wfc:msg:subj:${dedupeKey}`);
      prefixes.push(`wfc:msg:staff:${dedupeKey}`);
      prefixes.push(`wfc:mention:${dedupeKey}:`);
      prefixes.push(`wfc:invite:subj:${dedupeKey}`);
      prefixes.push(`wfc:invite:staff:${dedupeKey}`);
      prefixes.push(`wfc:remove:subj:${dedupeKey}`);
      prefixes.push(`wfc:remove:staff:${dedupeKey}`);
    }
    /* subject invite senza dedupe stabile */
    if (subjectUserId && !dedupeKey) {
      prefixes.push(`wfc:invite:subj:${subjectUserId}`);
    }
    const openUrls = [];
    try {
      if (queue && hint) openUrls.push(inboxOpenUrl(queue, hint, subjectUserId));
    } catch (_) {}
    /* pushAutoDismiss1: alias URL così dismiss OS matcha anche digest / path vecchi.
       Digest per-user viene tolto in removeSiteInAppNotificationsMatching (queuesHit),
       NON con prefix globale (cancerebbe i digest di tutti). */
    if (queue === "resoconti") {
      openUrls.push("/user/?tab=staff&staffOpen=resoconto");
      if (hint) openUrls.push(`/user/?tab=staff&staffOpen=resoconto&resoId=${encodeURIComponent(hint)}`);
      openUrls.push("/notifications/?view=staff&inbox=resoconti");
    } else if (queue === "pause") {
      openUrls.push("/user/?tab=staff&staffOpen=pause");
      openUrls.push("/staff/pause/");
    } else if (queue === "candidature" || queue === "appelli" || queue === "revisione") {
      openUrls.push(`/notifications/?view=staff&inbox=${encodeURIComponent(queue)}`);
    }
    return await removeSiteInAppNotificationsMatching({
      exactKeys,
      prefixes,
      openUrls,
      forceDismiss: true,
    });
  } catch (err) {
    global.logger?.warn?.("[siteStaffWorkflowNotifications] clear lifecycle:", err?.message || err);
    return { users: 0, removed: 0 };
  }
}

export = {
  inboxOpenUrl,
  notifyInboxStaffNewItem,
  notifyPauseRequesterDecision,
  notifyWorkflowSubjectInvited,
  notifyWorkflowSubjectRemoved,
  notifyWorkflowChatNewMessage,
  notifyWorkflowMentions,
  notifyWorkflowSubjectDecision,
  clearWorkflowLifecycleNotifs,
};
/* notifUseful1 marker */