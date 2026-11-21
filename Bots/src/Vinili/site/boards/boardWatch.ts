/**
 * Segui scheda + ricerche salvate: notifiche sito per rivotare / nuovo bump.
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, BV, featureGate, emitBoardsChanged } = (() => {
  const r = require("./boardReviews") as typeof import("./boardReviews");
  const v = require("./boardVotes") as typeof import("./boardVotes");
  return { BL: r.BL, BV: v.BV, featureGate: r.featureGate, emitBoardsChanged: r.emitBoardsChanged };
})();

const BW = SITE_DOCUMENT_TYPE.BOARD_WATCH || "board_watch";

/** Chiave settimana ISO (YYYY-Www) per dedupe digest follow. */
function boardsFollowDigestWeekKey(at = Date.now()) {
  const d = new Date(at);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeFilters(raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    kind: r.kind === "bot" || r.kind === "server" ? r.kind : "",
    q: String(r.q || "").trim().slice(0, 80),
    tag: String(r.tag || "").trim().slice(0, 40),
    category: String(r.category || "").trim().slice(0, 40),
    locale: String(r.locale || "").trim().slice(0, 16),
    guildTag: String(r.guildTag || r.guildtag || "").trim().slice(0, 8),
    sort: ["score", "new", "bumps", "votes", "reviews"].includes(String(r.sort || "")) ? String(r.sort) : "score",
  };
}

/** Stesse regole di `listListingsUncached` (chip esatti + q se non c’è chip). */
function listingMatchesSavedFilters(listing, filters) {
  const f = normalizeFilters(filters);
  const kind = String(listing?.boardKind || "") === "bot" ? "bot" : "server";
  if (f.kind && f.kind !== kind) return false;
  const tags = Array.isArray(listing?.boardTags) ? listing.boardTags.map(String) : [];
  const cats = Array.isArray(listing?.boardCategories) ? listing.boardCategories.map(String) : [];
  const locales = Array.isArray(listing?.boardLocales) ? listing.boardLocales.map(String) : [];
  if (f.tag && !tags.includes(f.tag)) return false;
  if (f.category && !cats.includes(f.category)) return false;
  if (f.locale && !locales.includes(f.locale)) return false;
  const gTag = String(listing?.boardStats?.guildTag || "").trim();
  if (f.guildTag && gTag.toLowerCase() !== f.guildTag.toLowerCase()) return false;
  const chipExact = Boolean(f.tag || f.category || f.locale || f.guildTag);
  if (f.q && !chipExact) {
    const rx = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hay = [
      listing?.title,
      listing?.boardTagline,
      listing?.boardSlug,
      listing?.boardInviteUrl,
      listing?.boardBotInviteUrl,
      listing?.content,
      gTag,
      ...tags,
      ...cats,
      ...locales,
    ]
      .map((x) => String(x || ""))
      .join("\n");
    if (!rx.test(hay)) return false;
  }
  return true;
}

async function listWatch(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const rows: any[] = await SiteDocument.find({ docType: BW, userId: auth.userId }).sort({ updatedAt: -1 }).limit(80).lean();
  const follows = rows.filter((r) => r.watchKind === "follow" || (!r.watchKind && r.boardListingId));
  const searches = rows.filter((r) => r.watchKind === "search");
  const listingIds = follows.map((r) => String(r.boardListingId || "")).filter((id) => mongoose.isValidObjectId(id));
  const listings: any[] = listingIds.length
    ? await SiteDocument.find({ _id: { $in: listingIds }, docType: BL }).select({ title: 1, boardSlug: 1, boardIconUrl: 1, boardKind: 1, status: 1 }).lean()
    : [];
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  return {
    ok: true,
    status: 200,
    follows: follows.map((r) => {
      const l = byId.get(String(r.boardListingId || ""));
      return {
        id: String(r._id),
        listingId: String(r.boardListingId || ""),
        name: String(l?.title || r.title || "Scheda"),
        slug: String(l?.boardSlug || ""),
        iconUrl: String(l?.boardIconUrl || ""),
        kind: String(l?.boardKind || r.boardKind || ""),
        status: String(l?.status || ""),
        notifyVote: r.notifyVote !== false,
        notifyBump: r.notifyBump !== false,
      };
    }),
    searches: searches.map((r) => ({
      id: String(r._id),
      label: String(r.title || "Ricerca salvata"),
      filters: normalizeFilters(r.filters),
      notifyNew: r.notifyVote !== false,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
  };
}

async function followListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const listingId = String(payload.listingId || "").trim();
  if (!mongoose.isValidObjectId(listingId)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const listing: any = await SiteDocument.findOne({ _id: listingId, docType: BL, status: "approved" })
    .select({ title: 1, boardKind: 1, boardSlug: 1, userId: 1 })
    .lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(listing.userId || "") === String(auth.userId)) {
    return { ok: false, status: 400, error: "own_listing", message: "Non puoi seguire la tua scheda." };
  }
  await SiteDocument.findOneAndUpdate(
    { docType: BW, userId: auth.userId, watchKind: "follow", boardListingId: listingId },
    {
      $set: {
        title: String(listing.title || ""),
        boardKind: String(listing.boardKind || ""),
        notifyVote: payload.notifyVote !== false,
        notifyBump: payload.notifyBump !== false,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        docType: BW,
        userId: auth.userId,
        watchKind: "follow",
        boardListingId: listingId,
        createdBy: "site",
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { ok: true, status: 200, following: true, message: "Scheda seguita." };
}

async function unfollowListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const listingId = String(payload.listingId || "").trim();
  if (!mongoose.isValidObjectId(listingId)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  await SiteDocument.deleteOne({ docType: BW, userId: auth.userId, watchKind: "follow", boardListingId: listingId });
  return { ok: true, status: 200, following: false, message: "Non segui più questa scheda." };
}

async function saveSearch(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const filters = normalizeFilters(payload.filters);
  const label =
    String(payload.label || "").trim().slice(0, 60) ||
    [filters.kind, filters.category, filters.tag, filters.guildTag, filters.q].filter(Boolean).join(" · ") ||
    "Ricerca salvata";
  const count = await SiteDocument.countDocuments({ docType: BW, userId: auth.userId, watchKind: "search" });
  if (count >= 12) return { ok: false, status: 400, error: "limit", message: "Puoi salvare al massimo 12 ricerche." };
  const notifyNew = payload.notifyNew !== false;
  const doc = await SiteDocument.create({
    docType: BW,
    userId: auth.userId,
    watchKind: "search",
    title: label,
    filters,
    notifyVote: notifyNew,
    createdBy: "site",
  });
  return { ok: true, status: 201, id: String(doc._id), message: "Ricerca salvata." };
}

async function deleteWatch(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.id || payload.watchId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  await SiteDocument.deleteOne({ _id: id, docType: BW, userId: auth.userId });
  return { ok: true, status: 200, message: "Rimosso." };
}

async function isFollowing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return { ok: true, status: 200, following: false };
  const listingId = String(payload.listingId || "").trim();
  if (!mongoose.isValidObjectId(listingId)) return { ok: true, status: 200, following: false };
  const row: any = await SiteDocument.findOne({ docType: BW, userId: auth.userId, watchKind: "follow", boardListingId: listingId })
    .select({ notifyVote: 1, notifyBump: 1 })
    .lean();
  if (!row) return { ok: true, status: 200, following: false, notifyVote: true, notifyBump: true };
  return {
    ok: true,
    status: 200,
    following: true,
    notifyVote: row.notifyVote !== false,
    notifyBump: row.notifyBump !== false,
  };
}

/** Notifica i follower quando qualcuno può rivotare (dopo cooldown) — chiamato dallo sweep voti. */
async function notifyFollowersVoteReady(listingId?, listingTitle?, openUrl?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return 0;
  const followers: any[] = await SiteDocument.find({ docType: BW, watchKind: "follow", boardListingId: id, notifyVote: { $ne: false } })
    .select({ userId: 1 })
    .limit(200)
    .lean();
  if (!followers.length) return 0;
  let n = 0;
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
    const { IDs } = require("../../Config/ids") as typeof import("../../Config/ids");
    const guildId = String(IDs?.guilds?.main || "").trim() || "global";
    const name = String(listingTitle || "una scheda").trim();
    const url = String(openUrl || `https://www.viniliecaffe.it/vetrina/vota/?id=${encodeURIComponent(id)}`);
    for (const f of followers) {
      const uid = String(f.userId || "").trim();
      if (!uid) continue;
      const ok = await enqueueSiteInAppNotification({
        guildId,
        userId: uid,
        title: "Puoi votare di nuovo",
        body: `È di nuovo possibile votare ${name} in Vetrina.`,
        kind: "vote_reminder",
        openUrl: url,
        dedupeKey: `boards_follow_vote_${id}_${uid}`,
        dedupeWindowMs: 6 * 3600_000,
        push: true,
      }).catch(() => false);
      if (ok) n += 1;
    }
  } catch (_) {}
  return n;
}

/** Avvisa chi ha una ricerca salvata che matcha una scheda appena approvata. */
async function notifySavedSearchesForListing(listingId?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return 0;
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" })
    .select({
      title: 1,
      boardSlug: 1,
      boardKind: 1,
      boardTagline: 1,
      boardTags: 1,
      boardCategories: 1,
      boardLocales: 1,
      boardInviteUrl: 1,
      boardBotInviteUrl: 1,
      boardStats: 1,
      content: 1,
    })
    .lean();
  if (!listing) return 0;
  const searches: any[] = await SiteDocument.find({ docType: BW, watchKind: "search", notifyVote: { $ne: false } })
    .select({ userId: 1, title: 1, filters: 1 })
    .limit(800)
    .lean();
  if (!searches.length) return 0;
  let n = 0;
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
    const { IDs } = require("../../Config/ids") as typeof import("../../Config/ids");
    const guildId = String(IDs?.guilds?.main || "").trim() || "global";
    const name = String(listing.title || "Una scheda").trim();
    const slug = String(listing.boardSlug || "").trim();
    const openUrl = slug
      ? `https://www.viniliecaffe.it/vetrina/scheda/?slug=${encodeURIComponent(slug)}`
      : `https://www.viniliecaffe.it/vetrina/scheda/?id=${encodeURIComponent(id)}`;
    const seen = new Set<string>();
    for (const s of searches) {
      const uid = String(s.userId || "").trim();
      if (!uid || seen.has(uid)) continue;
      if (!listingMatchesSavedFilters(listing, s.filters)) continue;
      seen.add(uid);
      const label = String(s.title || "Ricerca salvata").trim();
      const ok = await enqueueSiteInAppNotification({
        guildId,
        userId: uid,
        title: "Nuova scheda in vetrina",
        body: `“${name}” corrisponde alla tua ricerca «${label}».`,
        kind: "info",
        openUrl,
        dedupeKey: `boards_search_new_${id}_${uid}`,
        dedupeWindowMs: 7 * 24 * 3600_000,
        push: true,
      }).catch(() => false);
      if (ok) n += 1;
    }
  } catch (_) {}
  return n;
}

/** Notifica i follower di un bump recente. */
async function notifyFollowersBump(listingId?, listingTitle?, openUrl?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return 0;
  const followers: any[] = await SiteDocument.find({ docType: BW, watchKind: "follow", boardListingId: id, notifyBump: { $ne: false } })
    .select({ userId: 1 })
    .limit(200)
    .lean();
  if (!followers.length) return 0;
  let n = 0;
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
    const { IDs } = require("../../Config/ids") as typeof import("../../Config/ids");
    const guildId = String(IDs?.guilds?.main || "").trim() || "global";
    const name = String(listingTitle || "una scheda").trim();
    const url = String(openUrl || `https://www.viniliecaffe.it/vetrina/scheda/?id=${encodeURIComponent(id)}`);
    for (const f of followers) {
      const uid = String(f.userId || "").trim();
      if (!uid) continue;
      const ok = await enqueueSiteInAppNotification({
        guildId,
        userId: uid,
        title: "Scheda in risalita",
        body: `${name} ha ricevuto un bump in Vetrina.`,
        kind: "vote",
        openUrl: url,
        dedupeKey: `boards_follow_bump_${id}_${uid}_${Math.floor(Date.now() / 3600_000)}`,
        dedupeWindowMs: 2 * 3600_000,
        push: true,
      }).catch(() => false);
      if (ok) n += 1;
    }
  } catch (_) {}
  return n;
}

/** Digest settimanale per chi segue schede in Vetrina (dedupe per settimana ISO). */
async function sweepFollowWeeklyDigest() {
  const weekKey = boardsFollowDigestWeekKey();
  let userIds: string[] = [];
  try {
    const rows: any[] = await SiteDocument.aggregate([
      { $match: { docType: BW, watchKind: "follow", userId: { $exists: true, $ne: "" } } },
      { $group: { _id: "$userId" } },
      { $limit: 2000 },
    ]);
    userIds = rows.map((r) => String(r._id || "").trim()).filter(Boolean);
  } catch (err) {
    global.logger?.warn?.("[boards] follow digest users:", err?.message || err);
    return { ok: true, notified: 0 };
  }
  if (!userIds.length) return { ok: true, notified: 0 };
  let notified = 0;
  const cap = Math.min(userIds.length, 100);
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
    const { IDs } = require("../../Config/ids") as typeof import("../../Config/ids");
    const { listingVotesMonth } = require("./boardVotes") as typeof import("./boardVotes");
    const guildId = String(IDs?.guilds?.main || "").trim() || "global";
    for (let i = 0; i < cap; i += 1) {
      const uid = userIds[i];
      if (!uid) continue;
      const follows: any[] = await SiteDocument.find({ docType: BW, userId: uid, watchKind: "follow" })
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean();
      if (!follows.length) continue;
      const listingIds = follows
        .map((f) => String(f.boardListingId || "").trim())
        .filter((id) => mongoose.isValidObjectId(id));
      const listings: any[] = listingIds.length
        ? await SiteDocument.find({ _id: { $in: listingIds }, docType: BL, status: "approved" })
            .select({ title: 1, boardSlug: 1, boardVotesMonth: 1, boardVotesMonthKey: 1, boardBumpedAt: 1 })
            .lean()
        : [];
      const byId = new Map(listings.map((l) => [String(l._id), l]));
      const lines: string[] = [];
      let votesSum = 0;
      let bumped = 0;
      const weekAgo = Date.now() - 7 * 24 * 3600_000;
      for (const f of follows) {
        const l = byId.get(String(f.boardListingId || ""));
        if (!l) continue;
        const vm = listingVotesMonth(l);
        votesSum += vm;
        if (l.boardBumpedAt && new Date(l.boardBumpedAt).getTime() >= weekAgo) bumped += 1;
        const title = String(l.title || "Scheda").trim();
        const slug = String(l.boardSlug || "").trim();
        const bit = vm > 0 ? ` · ${vm} voti/mese` : "";
        lines.push(slug ? `«${title}»${bit}` : `«${title}»${bit}`);
      }
      if (!lines.length) continue;
      const nFollow = follows.length;
      const summary =
        nFollow === 1
          ? `Segui 1 scheda: ${votesSum} voti questo mese${bumped ? `, ${bumped} bump questa settimana` : ""}.`
          : `Segui ${nFollow} schede: ${votesSum} voti questo mese${bumped ? `, ${bumped} con bump recente` : ""}.`;
      const body = `${summary} ${lines.slice(0, 4).join(" · ")}`.slice(0, 480);
      const ok = await enqueueSiteInAppNotification({
        guildId,
        userId: uid,
        title: "Le tue schede questa settimana",
        body,
        kind: "info",
        openUrl: "/vetrina/le-mie/",
        dedupeKey: `boards_follow_digest_${uid}_${weekKey}`,
        dedupeWindowMs: 8 * 24 * 3600_000,
        push: true,
      }).catch(() => false);
      if (ok) notified += 1;
    }
  } catch (err) {
    global.logger?.warn?.("[boards] follow digest sweep:", err?.message || err);
  }
  return { ok: true, notified };
}

export = {
  BW,
  listWatch,
  followListing,
  unfollowListing,
  saveSearch,
  deleteWatch,
  isFollowing,
  notifyFollowersVoteReady,
  notifyFollowersBump,
  notifySavedSearchesForListing,
  sweepFollowWeeklyDigest,
  boardsFollowDigestWeekKey,
  listingMatchesSavedFilters,
  normalizeFilters,
};
