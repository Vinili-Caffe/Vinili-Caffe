/**
 * Bacheche: notifiche del sito (campanella + push) per gli eventi della Vetrina
 * che prima non avvisavano nessuno: nuove recensioni, risposte del proprietario, voti.
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

function listingUrl(listing?) {
  const slug = String(listing?.boardSlug || "").trim();
  return slug ? `/vetrina/scheda/?slug=${encodeURIComponent(slug)}` : "/vetrina/le-mie/";
}

async function send(opts: Record<string, any>) {
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/notifEnqueue") as typeof import("../notifications/notifEnqueue");
    return await enqueueSiteInAppNotification({
      guildId: String(IDs.guilds?.main || ""),
      channel: "personal",
      push: true,
      ...opts,
    });
  } catch (err) {
    global.logger?.warn?.("[site-boards] notifica:", err?.message || err);
    return false;
  }
}

const stars = (n?) => "★".repeat(Math.max(1, Math.min(5, Math.round(Number(n) || 0))));

/** Al proprietario: qualcuno ha recensito la sua scheda. */
async function notifyNewReview(listing?, review: { userId?: string; authorName?: string; rating?: number; id?: string } = {}) {
  const owner = String(listing?.userId || listing?.ownerId || "").trim();
  if (!owner || owner === String(review.userId || "")) return false;
  const name = String(listing?.title || "la tua scheda");
  return send({
    userId: owner,
    kind: "review",
    title: "Nuova recensione",
    body: `${review.authorName || "Qualcuno"} ha lasciato ${stars(review.rating)} a «${name}».`,
    openUrl: `${listingUrl(listing)}#recensioni`,
    dedupeKey: `boards:review:${listing?._id}:${review.userId || review.id || ""}`,
    dedupeWindowMs: 3_600_000,
  });
}

/** A chi ha scritto la recensione: il proprietario ha risposto. */
async function notifyReviewReply(listing?, review?) {
  const author = String(review?.userId || "").trim();
  const owner = String(listing?.userId || listing?.ownerId || "").trim();
  if (!author || author === owner) return false;
  const name = String(listing?.title || "la scheda");
  return send({
    userId: author,
    kind: "review",
    title: "Risposta alla tua recensione",
    body: `«${name}» ha risposto alla tua recensione.`,
    openUrl: `${listingUrl(listing)}#recensioni`,
    dedupeKey: `boards:review_reply:${review?._id || ""}`,
    dedupeWindowMs: 3_600_000,
  });
}

/** Al proprietario: un nuovo voto (al massimo una notifica all'ora per scheda, col conteggio). */
async function notifyNewVote(listing?, voter: { userId?: string; name?: string } = {}, votesMonth = 0) {
  const owner = String(listing?.userId || listing?.ownerId || "").trim();
  if (!owner || owner === String(voter.userId || "")) return false;
  const name = String(listing?.title || "la tua scheda");
  const hour = new Date().toISOString().slice(0, 13);
  return send({
    userId: owner,
    kind: "vote",
    title: "Nuovo voto",
    body: `${voter.name || "Qualcuno"} ha votato «${name}»${votesMonth ? ` · ${votesMonth} voti questo mese` : ""}.`,
    openUrl: listingUrl(listing),
    dedupeKey: `boards:vote:${listing?._id}:${hour}`,
    replaceDedupe: true,
    pushIfNew: true,
  });
}

export = { notifyNewReview, notifyReviewReply, notifyNewVote };
