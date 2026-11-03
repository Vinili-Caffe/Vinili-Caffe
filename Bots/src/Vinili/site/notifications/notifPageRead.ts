/** Notifiche del sito: segna come lette quelle della pagina che l'utente sta guardando. */
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { normalizeUserId, normalizeKind } = require("./notifKinds") as typeof import("./notifKinds");
const { TICKET_ID_RE, normalizeTicketId, entityIdFromHashToken, ticketIdFromOpenUrl } = require("./notifCopy") as typeof import("./notifCopy");
const { inboxQuery, migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");
const { invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged } = require("./notifPush") as typeof import("./notifPush");
const { isValidNotificationId } = require("./notifRead") as typeof import("./notifRead");

function normalizeNotifPathnameServer(url?) {
  try {
    const u = new URL(String(url || "/"), "https://viniliecaffe.it");
    return String(u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch (_) {
    return "";
  }
}

function pageContextFromUrlServer(pageUrl?) {
  try {
    const u = new URL(String(pageUrl || "/"), "https://viniliecaffe.it");
    const path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    let inbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    const tab = String(u.searchParams.get("tab") || "")
      .trim()
      .toLowerCase();
    if (/\/staff\/inbox$/i.test(path) && tab) inbox = tab;
    let ticket =
      String(u.searchParams.get("ticketId") || "")
        .trim()
        .toLowerCase() ||
      String(u.searchParams.get("ticket") || "")
        .trim()
        .toLowerCase() ||
      (/\/tickets$/i.test(path) || /\/feedback$/i.test(path) || /\/confessionale$/i.test(path) || /\/recensioni$/i.test(path)
        ? String(u.searchParams.get("id") || u.searchParams.get("suggestion") || "")
            .trim()
            .toLowerCase()
        : "");
    if (!TICKET_ID_RE.test(ticket)) ticket = "";
    // hash tipo #vc-suggestion-<id> / #ticketId → stessa discussione aperta
    if (!ticket) ticket = entityIdFromHashToken(u.hash);
    const staffOpen = String(u.searchParams.get("staffOpen") || "")
      .trim()
      .toLowerCase();
    const profileUserId = String(u.searchParams.get("id") || "")
      .trim();
    const pauseId = String(u.searchParams.get("pauseId") || "").trim();
    const resoId = String(u.searchParams.get("resoId") || "").trim();
    return {
      path,
      inbox,
      ticket,
      staffOpen,
      profileUserId,
      pauseId,
      resoId,
      href: String(pageUrl || ""),
    };
  } catch (_) {
    return {
      path: "",
      inbox: "",
      ticket: "",
      staffOpen: "",
      profileUserId: "",
      pauseId: "",
      resoId: "",
      href: "",
    };
  }
}

function openUrlMatchesPageContextServer(openUrl?, ticketId?, ctx?) {
  if (!ctx || !ctx.path || ctx.path === "/") return false;
  let tid = String(ticketId || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{24}$/i.test(tid)) tid = "";
  let destPath = "";
  let destInbox = "";
  let destTid = tid;
  const raw = String(openUrl || "").trim();
  try {
    const u = new URL(raw || "/", "https://viniliecaffe.it");
    destPath = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    destInbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    if (!destTid) {
      destTid =
        String(u.searchParams.get("ticketId") || "")
          .trim()
          .toLowerCase() ||
        String(u.searchParams.get("ticket") || "")
          .trim()
          .toLowerCase() ||
        String(u.searchParams.get("id") || "")
          .trim()
          .toLowerCase() ||
        String(u.searchParams.get("suggestion") || "")
          .trim()
          .toLowerCase() ||
        entityIdFromHashToken(u.hash);
      if (!TICKET_ID_RE.test(destTid)) destTid = "";
    }
  } catch (_) {
    destPath = normalizeNotifPathnameServer(raw);
  }
  if (destTid && ctx.ticket && destTid === ctx.ticket) return true;
  if (destInbox && ctx.inbox && destInbox === ctx.inbox) {
    if (
      (/\/notifications$/i.test(destPath) || /\/staff\/inbox$/i.test(destPath)) &&
      (/\/notifications$/i.test(ctx.path) || /\/staff\/inbox$/i.test(ctx.path))
    ) {
      return true;
    }
  }
  /* pauseNotifVisitFix1: NON segnare lette le pause solo perché si apre /user/
     (prima ogni visita profilo cancellava la campanella). Serve staffOpen + match id/pauseId. */
  if (
    destInbox === "pause" ||
    /inbox=pause\b/i.test(raw) ||
    /\/staff\/pause/i.test(destPath) ||
    /staffopen=pause\b/i.test(raw)
  ) {
    if (/\/staff\/pause$/i.test(ctx.path) || ctx.inbox === "pause") return true;
    if (/\/user$/i.test(ctx.path) && String(ctx.staffOpen || "") === "pause") {
      try {
        const dest = new URL(raw || "/", "https://viniliecaffe.it");
        const destUid = String(dest.searchParams.get("id") || "").trim();
        const destPid = String(dest.searchParams.get("pauseId") || "").trim();
        const sameUser =
          !destUid ||
          !ctx.profileUserId ||
          String(ctx.profileUserId) === destUid;
        const samePause = !destPid || !ctx.pauseId || String(ctx.pauseId) === destPid;
        if (sameUser && samePause) return true;
      } catch (_) {}
    }
  }
  if (
    (destInbox === "appelli" || /inbox=appelli\b/i.test(raw) || /\/appelli/i.test(destPath)) &&
    (/\/appelli$/i.test(ctx.path) || ctx.inbox === "appelli")
  ) {
    return true;
  }
  if (
    (destInbox === "candidature" || /inbox=candidature\b/i.test(raw) || /\/candidature/i.test(destPath)) &&
    (/\/candidature$/i.test(ctx.path) || ctx.inbox === "candidature")
  ) {
    return true;
  }
  if (destInbox === "resoconti" || /inbox=resoconti\b/i.test(raw) || /staffopen=resocont/i.test(raw)) {
    if (/\/staff\/resoconti$/i.test(ctx.path) || ctx.inbox === "resoconti") return true;
    if (/\/user$/i.test(ctx.path) && /^resocont/i.test(String(ctx.staffOpen || ""))) {
      try {
        const dest = new URL(raw || "/", "https://viniliecaffe.it");
        const destUid = String(dest.searchParams.get("id") || "").trim();
        const destRid = String(dest.searchParams.get("resoId") || "").trim();
        const sameUser =
          !destUid ||
          !ctx.profileUserId ||
          String(ctx.profileUserId) === destUid;
        const sameReso = !destRid || !ctx.resoId || String(ctx.resoId) === destRid;
        if (sameUser && sameReso) return true;
      } catch (_) {}
    }
  }
  /* pauseResoNotifProfile1: openUrl profilo ↔ visita /user SOLO con stesso staffOpen + id */
  if (
    /\/user$/i.test(ctx.path) &&
    /\/user$/i.test(destPath) &&
    /staffopen=(pause|resocont|pm-punti)/i.test(raw)
  ) {
    try {
      const dest = new URL(raw || "/", "https://viniliecaffe.it");
      const destOpen = String(dest.searchParams.get("staffOpen") || "")
        .trim()
        .toLowerCase();
      const ctxOpen = String(ctx.staffOpen || "").trim().toLowerCase();
      if (destOpen && ctxOpen && destOpen === ctxOpen) {
        const destUid = String(dest.searchParams.get("id") || "").trim();
        if (!destUid || !ctx.profileUserId || String(ctx.profileUserId) === destUid) {
          return true;
        }
      }
    } catch (_) {}
  }
  if (!destPath || destPath === "/") return false;
  /* notifVisitExact1: se openUrl punta a un ticket/feedback/discussione specifica,
     matcha SOLO se quella discussione è aperta — non basta essere sulla lista /feedback o /tickets. */
  if (/\/tickets$/i.test(destPath) && destTid) {
    return Boolean(ctx.ticket && ctx.ticket === destTid && /\/tickets$/i.test(ctx.path));
  }
  if (destPath === ctx.path) {
    if (destTid) return Boolean(ctx.ticket && ctx.ticket === destTid);
    if (destInbox && ctx.inbox && destInbox !== ctx.inbox) return false;
    return true;
  }
  /* Prefisso path solo per notif “di pagina” senza entity id (mai per ticket/feedback puntati). */
  if (!destTid && ctx.path.indexOf(`${destPath}/`) === 0) return true;
  return false;
}

/**
 * pushBadgeVisitFix1: visita pagina competenza → mark read (+ dedicated inbox alerts)
 * e dismiss push su tutti i device anche senza id locali nel client.
 */
async function markSiteInAppNotificationsReadForPage(userId?, pageUrl?, extra: Record<string, any> = {}) {
  const uid = normalizeUserId(userId);
  const href = String(pageUrl || "").trim();
  if (!uid || !href) return 0;
  const ctx = pageContextFromUrlServer(href);
  if (!ctx.path || ctx.path === "/") return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  const extraIds = Array.isArray(extra?.ids)
    ? [...new Set(extra.ids.map((x?) => String(x || "").trim()).filter((id?) => isValidNotificationId(id)))]
    : [];
  const extraTickets = Array.isArray(extra?.ticketIds)
    ? [
        ...new Set(
          extra.ticketIds
            .map((x?) => String(x || "").trim().toLowerCase())
            .filter((x?) => /^[a-f0-9]{24}$/i.test(x)),
        ),
      ]
    : [];
  const extraOpenUrls = Array.isArray(extra?.openUrls)
    ? [...new Set(extra.openUrls.map((x?) => String(x || "").trim()).filter(Boolean))].slice(0, 40)
    : [];
  if (ctx.ticket && !extraTickets.includes(ctx.ticket)) extraTickets.push(ctx.ticket);

  const markedIds = [];
  const openUrls = [...extraOpenUrls];
  let n = 0;
  const now = new Date();
  if (doc && Array.isArray(doc.inAppNotifItems) && doc.inAppNotifItems.length) {
    for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
      const it = doc.inAppNotifItems[i];
      if (!it) continue;
      const nid = String(it._id || "").trim();
      const tid = normalizeTicketId(it.ticketId) || ticketIdFromOpenUrl(it.openUrl);
      const ou = String(it.openUrl || "").trim();
      const forceById = nid && extraIds.includes(nid);
      const forceByTicket = tid && extraTickets.includes(tid);
      const byPage = openUrlMatchesPageContextServer(ou, tid, ctx);
      if (!forceById && !forceByTicket && !byPage) continue;
      /* voteRemKeep1: reminder voto non si consumano per visita /vote (solo voto reale / tap) */
      {
        const kindPage = normalizeKind(it.notifKind || it.kind);
        const dkPage = String(it.dedupeKey || "").toLowerCase();
        if (kindPage === "vote_reminder" || /vote_reminder_/.test(dkPage)) continue;
      }
      if (!it.readAt) {
        it.readAt = now;
        n += 1;
      }
      if (nid) markedIds.push(nid);
      if (ou && !openUrls.includes(ou)) openUrls.push(ou);
    }
    if (n > 0) {
      await doc.save().catch(() => null);
      try {
        invalidateUnreadCountCache(uid);
        broadcastInboxChanged(uid);
      } catch (_) {}
    }
  }

  /* Solo se abbiamo match o hint espliciti — evita push dismiss a ogni pagina random */
  /* notifVisitExact1: lista /tickets|/feedback da sola NON basta per dismiss —
     serve match reale (markedIds) o discussione aperta (ctx.ticket) / coda inbox. */
  const hasHints =
    markedIds.length > 0 ||
    extraIds.length > 0 ||
    extraTickets.length > 0 ||
    openUrls.length > 0 ||
    Boolean(ctx.inbox) ||
    Boolean(ctx.ticket) ||
    /\/staff\/(pause|inbox|resoconti)$/i.test(ctx.path) ||
    /\/(appelli|candidature)$/i.test(ctx.path);
  if (hasHints) {
    fireNotifDismissPush(uid, {
      ids: markedIds.length ? markedIds : extraIds,
      ticketIds: extraTickets,
      openUrls,
      pageUrl: href,
      force: true,
    });
  }
  return n;
}

export = { pageContextFromUrlServer, openUrlMatchesPageContextServer, markSiteInAppNotificationsReadForPage };
