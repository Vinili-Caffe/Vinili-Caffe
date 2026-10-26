/** Lettura uniforme deeplink da query/hash (notifiche, push, share). */

const MONGO_ID = /^[a-f0-9]{24}$/i;

export type DeepLinkIds = {
  ticketId: string;
  suggestionId: string;
  confessionId: string;
  reviewId: string;
  botFeedbackId: string;
  listingId: string;
  rawId: string;
  boardStaff: boolean;
  viewStaff: boolean;
  inbox: string;
};

function firstMongo(...cands: Array<string | null | undefined>): string {
  for (const c of cands) {
    const s = String(c || "").trim();
    if (MONGO_ID.test(s)) return s.toLowerCase();
  }
  return "";
}

function hashEntity(prefix: string, hash: string): string {
  const h = String(hash || "").replace(/^#/, "").trim();
  const re = new RegExp(`^(?:${prefix})?([a-f0-9]{24})$`, "i");
  const m = re.exec(h);
  return m ? String(m[1] || "").toLowerCase() : "";
}

/** Parsa location corrente (o URL passato). */
export function readDeepLink(href?: string): DeepLinkIds {
  let path = "/";
  let search = "";
  let hash = "";
  try {
    const u = href
      ? new URL(href, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it")
      : typeof location !== "undefined"
        ? new URL(location.href)
        : null;
    if (u) {
      path = u.pathname || "/";
      search = u.search || "";
      hash = u.hash || "";
    }
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pathLc = path.toLowerCase();

  const ticketId = firstMongo(
    q.get("ticketId"),
    q.get("ticket"),
    /\/tickets/i.test(pathLc) ? q.get("id") : "",
    hashEntity("", hash),
  );

  const suggestionId = firstMongo(
    q.get("suggestion"),
    /\/feedback/i.test(pathLc) ? q.get("id") : "",
    hashEntity("vc-suggestion-", hash),
  );

  const confessionId = firstMongo(hashEntity("vc-conf-card-", hash), /\/confessionale/i.test(pathLc) ? q.get("id") : "");
  const reviewId = firstMongo(hashEntity("vc-review-", hash), /\/recensioni/i.test(pathLc) ? q.get("id") : "");
  const botFeedbackId = firstMongo(hashEntity("vc-bot-feedback-", hash));
  const listingId = firstMongo(/\/bacheca/i.test(pathLc) ? q.get("id") : "");

  const rawId = firstMongo(q.get("id"), q.get("ticketId"), q.get("ticket"), q.get("suggestion"));

  return {
    ticketId,
    suggestionId,
    confessionId,
    reviewId,
    botFeedbackId,
    listingId,
    rawId,
    boardStaff: q.get("board") === "staff" || q.get("kind") === "staff",
    viewStaff: q.get("view") === "staff" || q.get("scope") === "staff" || Boolean(q.get("inbox")),
    inbox: String(q.get("inbox") || "").trim().toLowerCase(),
  };
}

/** Chiavi per DeepLinkFocus / data-deeplink. */
export function deepLinkFocusKeys(href?: string): string[] {
  const d = readDeepLink(href);
  const keys: string[] = [];
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  if (d.ticketId) {
    push(`ticketId:${d.ticketId}`);
    push(`id:${d.ticketId}`);
    push(d.ticketId);
  }
  if (d.suggestionId) {
    push(`vc-suggestion-${d.suggestionId}`);
    push(d.suggestionId);
  }
  if (d.confessionId) {
    push(`vc-conf-card-${d.confessionId}`);
    push(d.confessionId);
  }
  if (d.reviewId) {
    push(`vc-review-${d.reviewId}`);
    push(d.reviewId);
  }
  if (d.botFeedbackId) {
    push(`vc-bot-feedback-${d.botFeedbackId}`);
    push(d.botFeedbackId);
  }
  if (d.listingId) push(d.listingId);
  return keys;
}
