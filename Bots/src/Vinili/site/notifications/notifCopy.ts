/** Notifiche del sito: ticket a cui si riferisce una notifica e testi raggruppati. */
const TICKET_ID_RE = /^[a-f0-9]{24}$/i;

function normalizeTicketId(raw?) {
  const tid = String(raw || "").trim().toLowerCase();
  return TICKET_ID_RE.test(tid) ? tid : "";
}

function entityIdFromHashToken(rawHash?) {
  const h = String(rawHash || "")
    .replace(/^#/, "")
    .trim();
  if (!h) return "";
  if (TICKET_ID_RE.test(h)) return h.toLowerCase();
  const m = /^(?:vc-suggestion-|vc-conf-card-|vc-review-|vc-bot-feedback-)?([a-f0-9]{24})$/i.exec(h);
  return m ? String(m[1] || "").toLowerCase() : "";
}

function ticketIdFromOpenUrl(openUrl?) {
  const raw = String(openUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://www.viniliecaffe.it");
    const fromHash = entityIdFromHashToken(u.hash);
    if (fromHash) return fromHash;
    for (const key of ["ticketId", "ticket", "id", "suggestion"]) {
      const q = String(u.searchParams.get(key) || "")
        .trim()
        .toLowerCase();
      if (TICKET_ID_RE.test(q)) return q;
    }
  } catch (_) {
    const m = raw.match(/#(?:vc-suggestion-|vc-conf-card-|vc-review-|vc-bot-feedback-)?([a-f0-9]{24})\b/i);
    if (m) return String(m[1]).toLowerCase();
  }
  return "";
}

function inboxItemMatchesTicket(it?, ticketId?) {
  const tid = normalizeTicketId(ticketId);
  if (!tid || !it) return false;
  if (normalizeTicketId(it.ticketId) === tid) return true;
  return ticketIdFromOpenUrl(it.openUrl) === tid;
}

function normalizeFromName(raw?) {
  return String(raw || "").trim().slice(0, 80);
}

function mergeNotifFromNames(existing?, incoming?) {
  const next = [];
  const seen = new Set();
  const add = (name?) => {
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

function formatNotifFromNames(names?) {
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

export = { TICKET_ID_RE, normalizeTicketId, entityIdFromHashToken, ticketIdFromOpenUrl, inboxItemMatchesTicket, mergeNotifFromNames, buildCollapsedTicketChatCopy, buildCollapsedDigestCopy };
