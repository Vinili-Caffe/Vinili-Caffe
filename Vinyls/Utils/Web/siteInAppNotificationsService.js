const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { shouldSkipSiteInAppNotif, buildSkipContext, isKindMuted, KIND_TO_GROUP } = require("./siteNotifPrefs");

const NOTIF = SITE_DOCUMENT_TYPE.IN_APP_NOTIFICATION;
const MAX_PER_USER = 150;
const DEDUPE_KEY_MAX = 120;
/* siteApiW3: unread count process cache + singleflight */
const UNREAD_COUNT_TTL_MS = 12_000;
const unreadCountCache = new Map();
const unreadCountInflight = new Map();

function invalidateUnreadCountCache(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) {
    unreadCountCache.clear();
    return;
  }
  unreadCountCache.delete(uid);
  unreadCountInflight.delete(uid);
}

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function normalizeKind(kind) {
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
function isVoteRegisteredNotification({ kind, title, body, dedupeKey } = {}) {
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
]);

function inboxQueueIdFromOpenUrl(openUrl) {
  const raw = String(openUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://www.viniliecaffe.it");
    const inbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    return DEDICATED_INBOX_QUEUES.has(inbox) ? inbox : "";
  } catch (_) {
    const m = String(raw)
      .toLowerCase()
      .match(/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti)\b/);
    return m ? m[1] : "";
  }
}

/**
 * notifCats2: staff alerts that already live in a dedicated Inbox queue section.
 * These must not appear as flat Avvisi (or Personali) — only as queue threads.
 */
function isDedicatedInboxQueueAlert({ openUrl, dedupeKey, channel, title, body } = {}) {
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
  if (/^inbox:(pause|candidature|appelli|resoconti)(?::|$)/.test(key)) return true;
  if (/^pt-pending:/.test(key)) return true;
  if (/^wfc:(invite|remove|msg):staff:/.test(key)) return true;
  const queue = inboxQueueIdFromOpenUrl(openUrl);
  if (!queue) return false;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  if (
    /nuovo resoconto|nuovo appello|nuova candidatur|nuova richiesta pausa|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(
      hay,
    )
  ) {
    return true;
  }
  return false;
}

/** notifCats3: PM subject of a point removal / review outcome → Inbox → Punti tolti. */
function isPuntiToltiSubjectNotif({ dedupeKey, title, body } = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^pt-removed:/.test(key) || /^pt-review:/.test(key)) return true;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  return /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(
    hay,
  );
}

/** notifUseful1: SLA alerts for staff Inbox. */
function isStaffTicketSlaNotif({ dedupeKey, kind } = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^web_ticket:sla:/.test(key)) return true;
  return String(kind || "").trim().toLowerCase() === "web_ticket_sla";
}

/** notifUseful1: @mentions in ticket / workflow → Inbox Mentions (staff) or Personali. */
function isMentionNotif({ dedupeKey, kind } = {}) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "web_ticket_mention" || k === "workflow_mention") return true;
  const key = String(dedupeKey || "").trim().toLowerCase();
  return /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key);
}

/** notifUseful1: opener-side ticket events stay Personali (never Inbox). */
function isPersonalTicketOpenerNotif({ dedupeKey, channel, openUrl, kind } = {}) {
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
function isStaffTicketNotif({ dedupeKey, openUrl, kind, channel } = {}) {
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
function isStaffReviewNotif({ dedupeKey, title, kind } = {}) {
  const key = String(dedupeKey || "").trim().toLowerCase();
  if (/^rev-new:/.test(key) || /^rev-staff-target:/.test(key)) return true;
  const k = String(kind || "").trim().toLowerCase();
  if (k !== "review") return false;
  const t = String(title || "").trim();
  return /^nuova recensione\b/i.test(t) || /^nuova recensione su di te\b/i.test(t);
}

/** notifCats3 + staffFeedbackCommentInbox1: High Staff new suggestion/bug + staff-board comments → Inbox. */
function isStaffFeedbackNotif({ dedupeKey, title, kind, openUrl, channel } = {}) {
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
function isWorkflowDecisionPersonalNotif({ dedupeKey, kind, channel } = {}) {
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
function isStaffTeamPexDepexNotif(meta = {}) {
  const key = String(meta.dedupeKey || "").trim().toLowerCase();
  if (/^staff-(pex|depex):.+:team$/.test(key)) return true;
  const title = String(meta.title || "").trim();
  const url = String(meta.openUrl || "").toLowerCase();
  /* Team copies: "Pex: Name" / "Depex: Name" → organico (not the subject's "Pex staff"). */
  if (/\/staff\/organico\/?/.test(url) && /^(pex|depex):\s+\S/i.test(title)) return true;
  return false;
}

function isInboxLinkedNotification(meta = {}) {
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

function resolveNotifChannel(meta = {}) {
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
    const ids = Array.isArray(spec.ids)
      ? [...new Set(spec.ids.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 80)
      : [];
    const ticketIds = Array.isArray(spec.ticketIds)
      ? [
          ...new Set(
            spec.ticketIds
              .map((x) => String(x || "").trim().toLowerCase())
              .filter((x) => /^[a-f0-9]{24}$/i.test(x)),
          ),
        ].slice(0, 40)
      : [];
    const singleId = String(spec.id || "").trim();
    const singleTicket = String(spec.ticketId || "").trim();
    if (singleId && !ids.includes(singleId)) ids.unshift(singleId);
    if (singleTicket && /^[a-f0-9]{24}$/i.test(singleTicket) && !ticketIds.includes(singleTicket.toLowerCase())) {
      ticketIds.unshift(singleTicket.toLowerCase());
    }
    const openUrls = Array.isArray(spec.openUrls)
      ? [...new Set(spec.openUrls.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 40)
      : [];
    const pageUrl = String(spec.pageUrl || "").trim().slice(0, 500);
    const key =
      spec.all === true
        ? `${uid}:all`
        : ids.length
          ? `${uid}:ids:${ids.slice(0, 5).join(",")}`
          : ticketIds.length
            ? `${uid}:tix:${ticketIds.slice(0, 5).join(",")}`
            : pageUrl
              ? `${uid}:page:${pageUrl.slice(0, 80)}`
              : openUrls.length
                ? `${uid}:ou:${openUrls.slice(0, 2).join(",")}`
                : `${uid}:x`;
    const now = Date.now();
    const prev = Number(lastDismissPushAt.get(key) || 0);
    /* pushTicketOpenDismiss1: force bypass throttle (open ticket da altro device) */
    const throttleMs = spec.force === true ? 1500 : 12000;
    if (now - prev < throttleMs) return;
    lastDismissPushAt.set(key, now);
    if (lastDismissPushAt.size > 400) {
      for (const [k, at] of lastDismissPushAt) {
        if (now - Number(at || 0) > 120000) lastDismissPushAt.delete(k);
      }
    }
    const { sendWebPushToUser } = require("./siteWebPushService");
    void sendWebPushToUser(uid, {
      type: "dismiss",
      ticketId: singleTicket || ticketIds[0] || "",
      id: singleId || ids[0] || "",
      ids,
      ticketIds,
      openUrls,
      pageUrl,
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
  if (k === "vote_reminder") return true;
  if (isVoteRegisteredNotification({ kind, title, body })) return false;
  const hay = `${String(title || "")} ${String(body || "")}`.toLowerCase();
  return /promemoria|reminder|puoi votare|pozioni disponibili|puoi tornare in aula/.test(hay);
}

async function pushInboxItemAtomic(userId, newItem, dedupe = null) {
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

  const filter = { ...inboxQuery(uid) };
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
  ).catch((err) => {
    global.logger?.warn?.("[siteInAppNotifications] atomic push failed:", err?.message || err);
    return null;
  });
  if (res) return { ok: true, inserted: true };

  if (dedupeKey && (exclusiveKey || since)) {
    const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    if (exclusiveKey && items.some((it) => String(it?.dedupeKey || "") === dedupeKey)) {
      return { ok: true, inserted: false };
    }
    if (since && items.some((it) => itemMatchesDedupeWindow(it, dedupeKey, since))) {
      return { ok: true, inserted: false };
    }
  }

  const inbox = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  const existing = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (exclusiveKey && dedupeKey && existing.some((it) => String(it?.dedupeKey || "") === dedupeKey)) {
    return { ok: true, inserted: false };
  }
  if (dedupeKey && since && existing.some((it) => itemMatchesDedupeWindow(it, dedupeKey, since))) {
    return { ok: true, inserted: false };
  }
  const saved = await saveInboxItems(uid, [...existing, newItem]);
  return { ok: Boolean(saved), inserted: Boolean(saved) };
}

function broadcastInboxChanged() {
  try {
    const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
    broadcastSiteNotificationsChanged();
  } catch (_) {}
}

function fireNotificationPush(
  userId,
  { title, body, openUrl, kind, id, ticketId, messageId, channel, dedupeKey, ttlSeconds, msgCount },
  { push = true } = {},
) {
  /* notifPushSync1: invalidate before WS fanout so mode=count on other devices is fresh */
  invalidateUnreadCountCache(userId);
  broadcastInboxChanged();
  if (push === false) return Promise.resolve({ ok: true, skipped: true, reason: "push_disabled" });
  try {
    const { sendWebPushToUser } = require("./siteWebPushService");
    return sendWebPushToUser(userId, {
      title,
      body,
      openUrl: openUrl || "",
      kind,
      id: String(id || ""),
      ticketId: String(ticketId || "").trim(),
      messageId: String(messageId || "").trim(),
      /* notifBellInboxBadge1: client classifica inbox vs personali senza aspettare sync */
      channel: String(channel || "").trim().slice(0, 16),
      dedupeKey: String(dedupeKey || "").trim().slice(0, 180),
      ttlSeconds: Number(ttlSeconds) || undefined,
      /* notifDigestRace1: SW tag stabile su digest */
      msgCount: Number(msgCount) > 0 ? Math.min(99, Math.floor(Number(msgCount))) : undefined,
    }).catch((err) => {
      global.logger?.warn?.("[siteInAppNotifications] push send failed:", err?.message || err);
      return { ok: false, sent: 0, failed: 1 };
    });
  } catch (e) {
    return Promise.resolve({ ok: false, skipped: true, reason: String(e?.message || e) });
  }
}

function buildCollapsedDigestCopy({ count, queueLabel, fallbackTitle, fallbackBody }) {
  const n = Math.min(99, Math.max(1, Number(count) || 1));
  const label = String(queueLabel || "avvisi").trim() || "avvisi";
  if (n <= 1) {
    return {
      title: String(fallbackTitle || `Nuovo ${label}`).slice(0, 120),
      body: String(fallbackBody || "").slice(0, 500),
    };
  }
  return {
    title: `${n} nuovi ${label}`.slice(0, 120),
    body: String(fallbackBody || `Hai ${n} nuovi ${label} in attesa.`).slice(0, 500),
  };
}

const lastDigestPushAt = new Map();

function shouldFireDigestPush(userId, dedupeKey, windowMs = 180_000) {
  const uid = normalizeUserId(userId);
  const key = `${uid}:${String(dedupeKey || "").trim()}`;
  if (!uid || !String(dedupeKey || "").trim()) return true;
  const now = Date.now();
  const prev = Number(lastDigestPushAt.get(key) || 0);
  if (now - prev < windowMs) return false;
  lastDigestPushAt.set(key, now);
  if (lastDigestPushAt.size > 500) {
    for (const [k, at] of lastDigestPushAt) {
      if (now - Number(at || 0) > 600_000) lastDigestPushAt.delete(k);
    }
  }
  return true;
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
    (it) => String(it?.dedupeKey || "") === key,
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

async function removeInboxItemByDedupeKey(userId, dedupeKey) {
  const uid = normalizeUserId(userId);
  const key = String(dedupeKey || "").trim();
  if (!uid || !key) return false;
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const hit = items.find((it) => String(it?.dedupeKey || "") === key);
  const res = await SiteDocument.updateOne(inboxQuery(uid), {
    $pull: { inAppNotifItems: { dedupeKey: key } },
  }).catch(() => null);
  const changed = Number(res?.modifiedCount ?? res?.nModified ?? 0) > 0;
  if (changed) {
    invalidateUnreadCountCache(uid);
    broadcastInboxChanged();
    /* ticketSmartNotif1: rimozione dedupe → dismiss OS su tutti i device */
    const tid = hit ? normalizeTicketId(hit.ticketId) || ticketIdFromOpenUrl(hit.openUrl) : "";
    const nid = hit && hit._id ? String(hit._id) : "";
    fireNotifDismissPush(uid, { id: nid, ticketId: tid });
  }
  return changed;
}

function escapeRegexLiteral(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inboxItemMatchesDedupeSpec(it, { exactKeys = [], prefixes = [], openUrls = [], kinds = [] } = {}) {
  if (!it) return false;
  const key = String(it.dedupeKey || "").trim();
  const open = String(it.openUrl || "").trim();
  const kind = String(it.notifKind || it.kind || "").trim().toLowerCase();
  if (kinds.length && !kinds.includes(kind)) return false;
  if (exactKeys.length || prefixes.length || openUrls.length) {
    if (key && exactKeys.includes(key)) return true;
    if (key && prefixes.some((p) => p && key.startsWith(p))) return true;
    if (open && openUrls.some((u) => u && (open === u || open.indexOf(u) !== -1))) return true;
    return false;
  }
  return kinds.length > 0;
}

/**
 * smartNotifLifecycle1: rimuove inbox items per match dedupe/openUrl/kind + dismiss push.
 * Se userId omesso, scansiona inbox aggregate che matchano (max 400).
 */
async function removeSiteInAppNotificationsMatching(opts = {}) {
  const exactKeys = [
    ...new Set(
      (Array.isArray(opts.exactKeys) ? opts.exactKeys : [opts.exactKeys])
        .map((k) => String(k || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 80);
  const prefixes = [
    ...new Set(
      (Array.isArray(opts.prefixes) ? opts.prefixes : [opts.prefixes])
        .map((p) => String(p || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
  const openUrls = [
    ...new Set(
      (Array.isArray(opts.openUrls) ? opts.openUrls : [opts.openUrls])
        .map((u) => String(u || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
  const kinds = [
    ...new Set(
      (Array.isArray(opts.kinds) ? opts.kinds : [opts.kinds])
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const forceDismiss = opts.forceDismiss !== false;
  const onlyUserId = normalizeUserId(opts.userId);
  if (!exactKeys.length && !prefixes.length && !openUrls.length && !(onlyUserId && kinds.length)) {
    return { users: 0, removed: 0 };
  }

  const matchSpec = { exactKeys, prefixes, openUrls, kinds };
  const filter = { docType: NOTIF, inAppNotifAggregate: true };
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
  await Promise.all(
    docs.map(async (doc) => {
      const uid = normalizeUserId(doc.userId);
      if (!uid || !Array.isArray(doc.inAppNotifItems)) return;
      const kept = [];
      const removedIds = [];
      const removedOpenUrls = [];
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
        if (!ticketId) {
          ticketId = normalizeTicketId(it.ticketId) || ticketIdFromOpenUrl(it.openUrl) || "";
        }
      }
      if (kept.length === doc.inAppNotifItems.length) return;
      doc.inAppNotifItems = kept;
      try {
        await doc.save();
      } catch (_) {
        return;
      }
      users += 1;
      invalidateUnreadCountCache(uid);
      /* notifReadDismissOs1: dismiss OS anche per openUrl (candidature senza ticketId) */
      if (forceDismiss) {
        fireNotifDismissPush(uid, {
          ids: removedIds,
          ticketId,
          openUrls: removedOpenUrls.length ? removedOpenUrls : openUrls,
          force: true,
        });
      }
    }),
  ).catch(() => null);
  if (users > 0) broadcastInboxChanged();
  return { users, removed };
}

/**
 * ticketSmartNotif1: cancella inbox (+ dismiss push) per un ticket.
 * Skip coda staff (web_ticket:queue:*) — gestita da refreshStaffTicketQueueNotif.
 */
async function removeSiteInAppNotificationsForTicket(
  userId,
  ticketId,
  { exceptDedupeKeys = [], exceptDedupePrefixes = [], forceDismiss = false } = {},
) {
  const uid = normalizeUserId(userId);
  const tid = normalizeTicketId(ticketId);
  if (!uid || !tid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) {
    if (forceDismiss) fireNotifDismissPush(uid, { ticketId: tid });
    return 0;
  }

  const exceptKeys = new Set(
    (Array.isArray(exceptDedupeKeys) ? exceptDedupeKeys : [exceptDedupeKeys])
      .map((k) => String(k || "").trim())
      .filter(Boolean),
  );
  const exceptPrefs = (Array.isArray(exceptDedupePrefixes) ? exceptDedupePrefixes : [exceptDedupePrefixes])
    .map((p) => String(p || "").trim())
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
    if (key && exceptPrefs.some((p) => key.startsWith(p))) {
      kept.push(it);
      continue;
    }
    if (it._id) removedIds.push(String(it._id));
  }
  const removed = doc.inAppNotifItems.length - kept.length;
  if (removed <= 0) {
    if (forceDismiss) fireNotifDismissPush(uid, { ticketId: tid });
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
  broadcastInboxChanged();
  fireNotifDismissPush(uid, { ticketId: tid, ids: removedIds });
  return removed;
}

async function enqueueSiteInAppNotification(opts = {}) {
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
    const existing = items.find((it) => itemMatchesDedupeWindow(it, dedupeKeyRaw, since));
    if (existing) {
            const shouldRetryPush =
        sendPush &&
        !existing.readAt &&
        (isReminderNotificationKind(existing.notifKind || kind, existing.title || title, existing.body || body) ||
          isReminderNotificationKind(kind, title, body));
      if (shouldRetryPush) {
        const pushTtl =
          Number(opts.pushTtlSeconds) > 0
            ? Number(opts.pushTtlSeconds)
            : kind === "vote_reminder" || normalizeKind(existing.notifKind || kind) === "vote_reminder"
              ? 60 * 60 * 12
              : undefined;
        const pushResult = await fireNotificationPush(
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
    const pushResult = await fireNotificationPush(
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
      invalidateUnreadCountCache();
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
  /* pushBadgeVisitFix1: dismiss OS anche se già letta (modified=0) — badge altri device */
  if (item || modified) {
    fireNotifDismissPush(uid, { id: nid, ticketId, force: true });
  }
  if (modified) {
    try {
      invalidateUnreadCountCache();
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
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const idSet = new Set(ids);
  const openUrls = [];
  const ticketIds = [];
  for (const it of items) {
    const nid = String(it?._id || "").trim();
    if (!nid || !idSet.has(nid)) continue;
    const ou = String(it?.openUrl || "").trim();
    if (ou && !openUrls.includes(ou)) openUrls.push(ou);
    const tid = normalizeTicketId(it?.ticketId) || ticketIdFromOpenUrl(it?.openUrl) || "";
    if (tid && !ticketIds.includes(tid)) ticketIds.push(tid);
  }
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": { $in: oids } }] },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0 ? ids.length : 0;
  /* notifReadDismissOs1: dismiss OS anche se già lette (modified=0) */
  fireNotifDismissPush(uid, {
    ids,
    ticketIds,
    openUrls,
    all: ids.length > 40,
    force: true,
  });
  if (modified > 0) {
    try {
      invalidateUnreadCountCache();
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
      invalidateUnreadCountCache();
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  /* notifReadDismissOs1: dismiss OS anche se già tutte lette */
  fireNotifDismissPush(uid, { all: true, force: true });
  return n;
}

async function markSiteInAppNotificationsReadForTicket(userId, ticketId) {
  const uid = normalizeUserId(userId);
  const tid = normalizeTicketId(ticketId);
  if (!uid || !tid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) {
    /* pushTicketOpenDismiss1: anche senza inbox → chiudi banner OS su altri device */
    fireNotifDismissPush(uid, { ticketId: tid, force: true });
    return 0;
  }
  let n = 0;
  const now = new Date();
  const markedIds = [];
  for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
    const it = doc.inAppNotifItems[i];
    if (!it || it.readAt) continue;
    if (!inboxItemMatchesTicket(it, tid)) continue;
    it.readAt = now;
    n += 1;
    if (it._id) markedIds.push(String(it._id));
  }
  if (n > 0) {
    await doc.save().catch(() => null);
    try {
      invalidateUnreadCountCache(uid);
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  /* pushTicketOpenDismiss1: sempre dismiss per ticketId (anche se già lette / store locale vuoto) */
  fireNotifDismissPush(uid, { ticketId: tid, ids: markedIds, force: true });
  return n;
}

function normalizeNotifPathnameServer(url) {
  try {
    const u = new URL(String(url || "/"), "https://viniliecaffe.it");
    return String(u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch (_) {
    return "";
  }
}

function pageContextFromUrlServer(pageUrl) {
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
      String(u.hash || "")
        .replace(/^#/, "")
        .trim()
        .toLowerCase();
    if (!/^[a-f0-9]{24}$/i.test(ticket)) ticket = "";
    return { path, inbox, ticket, href: String(pageUrl || "") };
  } catch (_) {
    return { path: "", inbox: "", ticket: "", href: "" };
  }
}

function openUrlMatchesPageContextServer(openUrl, ticketId, ctx) {
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
        String(u.hash || "")
          .replace(/^#/, "")
          .trim()
          .toLowerCase();
      if (!/^[a-f0-9]{24}$/i.test(destTid)) destTid = "";
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
  if (
    (destInbox === "pause" || /inbox=pause\b/i.test(raw) || /\/staff\/pause/i.test(destPath)) &&
    (/\/staff\/pause$/i.test(ctx.path) || ctx.inbox === "pause")
  ) {
    return true;
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
  if (
    (destInbox === "resoconti" || /inbox=resoconti\b/i.test(raw)) &&
    (/\/staff\/resoconti$/i.test(ctx.path) || ctx.inbox === "resoconti")
  ) {
    return true;
  }
  if (!destPath || destPath === "/") return false;
  if (destPath === ctx.path) {
    if (destTid && ctx.ticket && destTid !== ctx.ticket) return false;
    if (destInbox && ctx.inbox && destInbox !== ctx.inbox) return false;
    return true;
  }
  if (ctx.path.indexOf(`${destPath}/`) === 0) return true;
  return false;
}

/**
 * pushBadgeVisitFix1: visita pagina competenza → mark read (+ dedicated inbox alerts)
 * e dismiss push su tutti i device anche senza id locali nel client.
 */
async function markSiteInAppNotificationsReadForPage(userId, pageUrl, extra = {}) {
  const uid = normalizeUserId(userId);
  const href = String(pageUrl || "").trim();
  if (!uid || !href) return 0;
  const ctx = pageContextFromUrlServer(href);
  if (!ctx.path || ctx.path === "/") return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  const extraIds = Array.isArray(extra?.ids)
    ? [...new Set(extra.ids.map((x) => String(x || "").trim()).filter((id) => isValidNotificationId(id)))]
    : [];
  const extraTickets = Array.isArray(extra?.ticketIds)
    ? [
        ...new Set(
          extra.ticketIds
            .map((x) => String(x || "").trim().toLowerCase())
            .filter((x) => /^[a-f0-9]{24}$/i.test(x)),
        ),
      ]
    : [];
  const extraOpenUrls = Array.isArray(extra?.openUrls)
    ? [...new Set(extra.openUrls.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 40)
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
        const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
        broadcastSiteNotificationsChanged();
      } catch (_) {}
    }
  }

  /* Solo se abbiamo match o hint espliciti — evita push dismiss a ogni pagina random */
  const hasHints =
    markedIds.length > 0 ||
    extraIds.length > 0 ||
    extraTickets.length > 0 ||
    openUrls.length > 0 ||
    Boolean(ctx.inbox) ||
    Boolean(ctx.ticket) ||
    /\/staff\/(pause|inbox|resoconti)$/i.test(ctx.path) ||
    /\/(appelli|candidature|tickets)$/i.test(ctx.path);
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
    if (isVoteRegisteredNotification({ kind, title, body, dedupeKey })) continue;
    /* notifCats2/3: never list Discord-queue-only staff alerts as flat notifs. */
    if (
      isDedicatedInboxQueueAlert({
        openUrl,
        dedupeKey,
        channel: doc.notifChannel || doc.channel,
        title,
        body,
      })
    ) {
      continue;
    }
    const channel = resolveNotifChannel({
      openUrl,
      dedupeKey,
      channel: doc.notifChannel || doc.channel,
      title,
      body,
      kind,
    });
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
      channel,
      dedupeKey: dedupeKey || "",
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

async function countSiteInAppUnreadForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) {
    return { unread: 0, total: 0, revision: "0", latestAt: 0 };
  }
  const now = Date.now();
  const cached = unreadCountCache.get(uid);
  if (cached && now - cached.at < UNREAD_COUNT_TTL_MS) {
    return cached.result;
  }
  let inflight = unreadCountInflight.get(uid);
  if (inflight) return inflight;

  inflight = (async () => {
    await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
    const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    const prefsGuildId = String(IDs.guilds?.main || "").trim();
    const skipCtx = await buildSkipContext(prefsGuildId, uid).catch(() => ({
      mutedKinds: [],
      voteBlocked: { bump: false, vote_topgg: false },
    }));
    let unread = 0;
    let total = 0;
    let latestAt = 0;
    let latestUnreadAt = 0;
    for (const doc of items) {
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
      if (isVoteRegisteredNotification({ kind, title, body, dedupeKey })) continue;
      if (
        isDedicatedInboxQueueAlert({
          openUrl,
          dedupeKey,
          channel: doc.notifChannel || doc.channel,
          title,
          body,
        })
      ) {
        continue;
      }
      /* siteApiW3: skip sync via skipCtx — no per-item await
         voteUnreadNoDmFix1: NoDM Discord NON nasconde reminder voto da badge/pending
         (allineato a votePushNoDmFix1 / shouldSkipSiteInAppNotif). */
      let filtered = false;
      if (KIND_TO_GROUP[kind] && isKindMuted(skipCtx.mutedKinds, kind)) {
        filtered = true;
      }
      if (filtered) continue;
      total += 1;
      const at = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
      if (at > latestAt) latestAt = at;
      if (!doc.readAt) {
        unread += 1;
        if (at > latestUnreadAt) latestUnreadAt = at;
      }
    }
    const revision = `${total}:${unread}:${latestAt || 0}:${latestUnreadAt || 0}`;
    const result = { unread, total, revision, latestAt, latestUnreadAt };
    unreadCountCache.set(uid, { at: Date.now(), result });
    if (unreadCountCache.size > 800) {
      const cutoff = Date.now() - UNREAD_COUNT_TTL_MS;
      for (const [k, v] of unreadCountCache) {
        if (!v || v.at < cutoff) unreadCountCache.delete(k);
      }
    }
    return result;
  })().finally(() => {
    unreadCountInflight.delete(uid);
  });

  unreadCountInflight.set(uid, inflight);
  return inflight;
}

async function deleteSiteInAppNotificationForUser(userId, notificationId) {
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
    { $pull: { inAppNotifItems: { _id: oid } } },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  /* pushBadgeVisitFix1: dismiss OS anche se già cancellata / race multi-device */
  fireNotifDismissPush(uid, { id: nid, ticketId, force: true });
  if (modified) {
    try {
      invalidateUnreadCountCache();
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
    fireNotifDismissPush(uid, { all: true });
    try {
      invalidateUnreadCountCache();
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return count;
}

module.exports = {
  isVoteRegisteredNotification,
  isDedicatedInboxQueueAlert,
  isPuntiToltiSubjectNotif,
  isStaffTicketNotif,
  isStaffTicketSlaNotif,
  isMentionNotif,
  isPersonalTicketOpenerNotif,
  isWorkflowDecisionPersonalNotif,
  isStaffReviewNotif,
  isStaffFeedbackNotif,
  isInboxLinkedNotification,
  resolveNotifChannel,
  enqueueSiteInAppNotification,
  removeInboxItemByDedupeKey,
  removeSiteInAppNotificationsForTicket,
  removeSiteInAppNotificationsMatching,
  listSiteInAppNotificationsForUser,
  countSiteInAppUnreadForUser,
  invalidateUnreadCountCache,
  pruneSiteInAppNotificationsForUser,
  deleteSiteInAppNotifications,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
  markSiteInAppNotificationRead,
  markSiteInAppNotificationsReadMany,
  markAllSiteInAppNotificationsRead,
  markSiteInAppNotificationsReadForTicket,
  markSiteInAppNotificationsReadForPage,
  migrateLegacyInAppNotificationsForUser,
};
/* notifUseful1 marker */