/** Notifiche del sito: tipi di notifica e canale (inbox dedicate, ticket, staff, menzioni). */
function normalizeUserId(userId?) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function normalizeKind(kind?) {
  const k = String(kind || "info").trim().toLowerCase();
  // staffKindGroup1: dedicated kind for staff/bot events (prefs group "Eventi staff")
  // notifUseful1: mentions / SLA / workflow decisions
  if (
    [
      "vote",
      "vote_reminder",
      "success",
      "info",
      "review",
      "mod",
      "staff",
      "confessionale",
      "suggestion",
      "contest",
      "web_ticket",
      "web_ticket_mention",
      "web_ticket_sla",
      "workflow_mention",
      "workflow_decision",
    ].includes(k)
  ) {
    return k;
  }
  return "info";
}

/** notifCats1: successful Top.gg/Discadia vote registration (not reminders). */
function isVoteRegisteredNotification({ kind, title, body, dedupeKey }: any = {}) {
  const k = normalizeKind(kind);
  const t = String(title || "");
  const b = String(body || "");
  const key = String(dedupeKey || "").trim().toLowerCase();
  const hay = `${t} ${b}`.toLowerCase();
  if (k === "vote_reminder") return false;
  if (/promemoria|puoi votare di nuovo|reminder/.test(hay)) return false;
  if (/^vote_done:/.test(key) || /^vote_registered:/.test(key)) return true;
  if (k === "vote") return true;
  if (/voto\s+(su\s+)?(top\.?gg|discadia)\s+registrato/.test(hay)) return true;
  if (/voto registrato/.test(hay) && /(top\.?gg|discadia)/.test(hay)) return true;
  return false;
}

/** Dedicated Inbox queue tabs (Pause / Candidature / Appelli / Resoconti / Punti tolti). */
const DEDICATED_INBOX_QUEUES = new Set([
  "pause",
  "candidature",
  "appelli",
  "resoconti",
  "punti-tolti",
  "revisione",
]);

function inboxQueueIdFromOpenUrl(openUrl?) {
  const raw = String(openUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://www.viniliecaffe.it");
    const inbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    if (DEDICATED_INBOX_QUEUES.has(inbox)) return inbox;
    /* ptNotifProfile1: openUrl profilo Partner */
    const staffOpen = String(u.searchParams.get("staffOpen") || "")
      .trim()
      .toLowerCase();
    if (staffOpen === "pm-punti-tolti" || staffOpen === "punti-tolti" || staffOpen === "punti") {
      return "punti-tolti";
    }
    if (staffOpen === "pause") return "pause";
    if (staffOpen === "resoconto" || staffOpen === "resoconti") return "resoconti";
    return "";
  } catch (_) {
    const m = String(raw)
      .toLowerCase()
      .match(/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti|revisione)\b/);
    if (m) return m[1];
    if (/[?&]staffopen=pm-punti-tolti\b/i.test(raw) || /[?&]staffopen=punti-tolti\b/i.test(raw)) {
      return "punti-tolti";
    }
    return "";
  }
}

/**
 * notifCats2: staff alerts that already live in a dedicated Inbox queue section.
 * These must not appear as flat Avvisi (or Personali) — only as queue threads.
 *
 * resoBellFlat1: Resoconti NON hanno più riga coda in campanella (resoProfile1) —
 * se restano “dedicated” spariscono ovunque. Li trattiamo come item Inbox normali.
 */
function isDedicatedInboxQueueAlert({ openUrl, dedupeKey, channel, title, body }: any = {}) {
  const ch = String(channel || "").trim().toLowerCase();
  if (ch === "personal") return false;
  const key = String(dedupeKey || "").trim().toLowerCase();
  // Subject / personal outcomes — never treat as Discord-queue-only (still inbox-linked).
  if (
    /^pt-removed:/.test(key) ||
    /^pt-review:/.test(key) ||
    /^pause:decision:/.test(key) ||
    /^val-/.test(key) ||
    /^wfc:(invite|remove|msg):subj:/.test(key)
  ) {
    return false;
  }
  /* resoBellFlat1: flat list in campanella Inbox (openUrl → profilo staff) */
  if (/^inbox:resoconti(?::|$)/.test(key)) return false;
  if (/^inbox:(pause|candidature|appelli|revisione)(?::|$)/.test(key)) return true;
  if (/^pt-pending:/.test(key)) return true;
  if (/^wfc:(invite|remove|msg):staff:/.test(key)) return true;
  const queue = inboxQueueIdFromOpenUrl(openUrl);
  if (queue === "resoconti") return false;
  if (!queue) return false;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  if (
    /nuovo appello|nuova candidatur|nuova richiesta pausa|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(
      hay,
    )
  ) {
    return true;
  }
  /* "nuovo resoconto" without queue id → still flat (not dedicated) */
  return false;
}

/** notifCats3: PM subject of a point removal / review outcome → Inbox → Punti tolti. */
function isPuntiToltiSubjectNotif({ dedupeKey, title, body }: any = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^pt-removed:/.test(key) || /^pt-review:/.test(key)) return true;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  return /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(
    hay,
  );
}

/** notifUseful1: SLA alerts for staff Inbox. */
function isStaffTicketSlaNotif({ dedupeKey, kind }: any = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^web_ticket:sla:/.test(key)) return true;
  return String(kind || "").trim().toLowerCase() === "web_ticket_sla";
}

/** notifUseful1: @mentions in ticket / workflow → Inbox Mentions (staff) or Personali. */
function isMentionNotif({ dedupeKey, kind }: any = {}) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "web_ticket_mention" || k === "workflow_mention") return true;
  const key = String(dedupeKey || "").trim().toLowerCase();
  return /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key);
}

/** notifUseful1: opener-side ticket events stay Personali (never Inbox). */
function isPersonalTicketOpenerNotif({ dedupeKey, channel, openUrl, kind }: any = {}) {
  const ch = String(channel || "").trim().toLowerCase();
  const url = String(openUrl || "").toLowerCase();
  if (ch === "inbox" || /(?:\?|&)view=staff\b/.test(url)) return false;
  if (ch === "personal") {
    const k = String(kind || "").trim().toLowerCase();
    if (k === "web_ticket" || k === "web_ticket_mention") return true;
  }
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (
    /^web_ticket:(staff_reply|needs_reply|closed|claimed|close-request|close-rejected|event):/.test(key)
  ) {
    return true;
  }
  const k = String(kind || "").trim().toLowerCase();
  if (k !== "web_ticket" && k !== "web_ticket_mention") return false;
  return /\/tickets\//.test(url) && !/(?:\?|&)view=staff\b/.test(url);
}

/** notifCats3: staff-side ticket queue / staff view tickets → Inbox. */
function isStaffTicketNotif({ dedupeKey, openUrl, kind, channel }: any = {}) {
  if (isPersonalTicketOpenerNotif({ dedupeKey, openUrl, kind, channel })) return false;
  if (isStaffTicketSlaNotif({ dedupeKey, kind })) return true;
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^web_ticket:queue:/.test(key) || /^web_ticket:chat:/.test(key) || /^web_ticket:sla:/.test(key)) {
    return true;
  }
  const k = String(kind || "").trim().toLowerCase();
  if (k === "web_ticket_sla") return true;
  if (k === "web_ticket_mention" || k === "workflow_mention") {
    const url = String(openUrl || "").toLowerCase();
    if (/\/tickets\//.test(url) && /(?:\?|&)view=staff\b/.test(url)) return true;
    if (/[?&]inbox=/.test(url) || /\/notifications\//.test(url)) return true;
    if (String(channel || "").trim().toLowerCase() === "inbox") return true;
    return false;
  }
  if (k !== "web_ticket" && k !== "web_ticket_mention") return false;
  const url = String(openUrl || "").toLowerCase();
  return /\/tickets\//.test(url) && /(?:\?|&)view=staff\b/.test(url);
}

/** notifCats3: High Staff “new review” alerts → Inbox (author likes/replies stay personal). */
function isStaffReviewNotif({ dedupeKey, title, kind }: any = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^rev-new:/.test(key) || /^rev-staff-target:/.test(key)) return true;
  const k = String(kind || "").trim().toLowerCase();
  if (k !== "review") return false;
  const t = String(title || "").trim();
  return /^nuova recensione\b/i.test(t) || /^nuova recensione su di te\b/i.test(t);
}

/** notifCats3 + staffFeedbackCommentInbox1: High Staff new suggestion/bug + staff-board comments → Inbox. */
function isStaffFeedbackNotif({ dedupeKey, title, kind, openUrl, channel }: any = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^suggestion:new:/.test(key) || /^bot_feedback_new:/.test(key)) return true;
  const k = String(kind || "").trim().toLowerCase();
  if (k !== "suggestion") return false;
  const url = String(openUrl || "").toLowerCase();
  /* Staff board discussion (comments/replies) always Inbox — not Personali. */
  if (/\/feedback\/?/.test(url) && /(?:\?|&)board=staff\b/.test(url)) return true;
  if (String(channel || "").trim().toLowerCase() === "inbox" && /\/feedback\/?/.test(url)) return true;
  return /^(nuovo|nuova)\s+(suggerimento|segnalazione|bug)\b/i.test(String(title || "").trim());
}

/** notifUseful1: workflow decision for requester stays Personali. */
function isWorkflowDecisionPersonalNotif({ dedupeKey, kind, channel }: any = {}) {
  const ch = String(channel || "").trim().toLowerCase();
  if (ch === "personal") {
    const k = String(kind || "").trim().toLowerCase();
    if (k === "workflow_decision") return true;
  }
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:)/.test(key)) return true;
  return String(kind || "").trim().toLowerCase() === "workflow_decision";
}

/** notifCats3: inbox-linked = dedicated queues + staff ticket/review/feedback + punti tolti subject. */
function isStaffTeamPexDepexNotif(meta: Record<string, any> = {}) {
  const key = String(meta.dedupeKey || "").trim().toLowerCase();
  if (/^staff-(pex|depex):.+:team$/.test(key)) return true;
  const title = String(meta.title || "").trim();
  const url = String(meta.openUrl || "").toLowerCase();
  /* Team copies: "Pex: Name" / "Depex: Name" → organico (not the subject's "Pex staff"). */
  if (/\/staff\/organico\/?/.test(url) && /^(pex|depex):\s+\S/i.test(title)) return true;
  return false;
}

function isInboxLinkedNotification(meta: Record<string, any> = {}) {
  /* Subject/staff splits win over a stale stored channel=personal. */
  if (isWorkflowDecisionPersonalNotif(meta)) return false;
  if (isPersonalTicketOpenerNotif(meta)) return false;
  if (isStaffTeamPexDepexNotif(meta)) return true;
  if (isPuntiToltiSubjectNotif(meta)) return true;
  if (isStaffTicketSlaNotif(meta)) return true;
  if (isStaffTicketNotif(meta)) return true;
  if (isStaffReviewNotif(meta)) return true;
  if (isStaffFeedbackNotif(meta)) return true;
  const ch = String(meta.channel || "").trim().toLowerCase();
  if (ch === "personal") return false;
  if (ch === "inbox") return true;
  if (isDedicatedInboxQueueAlert(meta)) return true;
  const key = String(meta.dedupeKey || "").trim().toLowerCase();
  if (
    /^inbox:/.test(key) ||
    /^wfc:(invite|remove|msg):staff:/.test(key) ||
    /^wfc:mention:/.test(key) ||
    /^pt-pending:/.test(key) ||
    /^web_ticket:sla:/.test(key) ||
    /^compiti:/.test(key) ||
    /^staff-(pex|depex):.+:team$/.test(key)
  ) {
    return true;
  }
  return false;
}

function resolveNotifChannel(meta: Record<string, any> = {}) {
  /* notifUseful1: opener / decision personal always wins */
  if (isWorkflowDecisionPersonalNotif(meta) || isPersonalTicketOpenerNotif(meta)) {
    return "personal";
  }
  if (
    isStaffTeamPexDepexNotif(meta) ||
    isPuntiToltiSubjectNotif(meta) ||
    isStaffTicketSlaNotif(meta) ||
    isStaffTicketNotif(meta) ||
    isStaffReviewNotif(meta) ||
    isStaffFeedbackNotif(meta) ||
    isDedicatedInboxQueueAlert(meta)
  ) {
    return "inbox";
  }
  const ch = String(meta.channel || "").trim().toLowerCase();
  if (ch === "inbox" || ch === "personal") return ch;
  return isInboxLinkedNotification(meta) ? "inbox" : "personal";
}

export = { normalizeUserId, normalizeKind, isVoteRegisteredNotification, isDedicatedInboxQueueAlert, isPuntiToltiSubjectNotif, isStaffTicketSlaNotif, isMentionNotif, isPersonalTicketOpenerNotif, isStaffTicketNotif, isStaffReviewNotif, isStaffFeedbackNotif, isWorkflowDecisionPersonalNotif, isInboxLinkedNotification, resolveNotifChannel };
