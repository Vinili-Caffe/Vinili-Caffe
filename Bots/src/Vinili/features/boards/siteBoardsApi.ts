
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { BOARD_CATEGORIES, BOARD_LOCALES, BOARD_LOCALE_LABELS, BOARD_CATEGORY_LABELS, BOARD_TAG_CATALOG } = require("./boardCatalog") as typeof import("./boardCatalog");
const { slugify, sanitizeText, tagMatchesQuery } = require("./boardSanitize") as typeof import("./boardSanitize");
const { uploadBoardBanner, serveBoardBannerFile, resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { probeBoardLink } = require("./boardLinkProbe") as typeof import("./boardLinkProbe");
const { BL, listingsCache, listingsInflight, invalidateListingsListCache, boardsConfig, featureGate, listListingReviews, createListingReview, toggleListingReviewLike, reportListingReview, upsertListingReviewReply, syncSiteServerReviewToMainBoardListing, removeSiteServerReviewFromMainBoardListing } = require("./boardReviews") as typeof import("./boardReviews");
const { clientIp, startListingVoteSession, progressListingVoteSession, voteListing, setListingVoteReminder, sweepBoardVoteReminders, ensureBoardsVoteReminderScheduler, bumpListing, reportListing } = require("./boardVotes") as typeof import("./boardVotes");
const { refreshListingStats, runBoardsStatsJob, ensureBoardsStatsScheduler } = require("./boardStats") as typeof import("./boardStats");
const { viniliBotInviteUrl, serializeListing, generateInvite, guildBoardDefaults } = require("./boardInvites") as typeof import("./boardInvites");
const { enrichListingAuthor, modListPending, getListingForStaffReview, modDecide } = require("./boardModeration") as typeof import("./boardModeration");
const { createListing, patchListing, listMine, getMyListingById, purgeBoardListingDoc, deleteServerListingsForLeftGuild, deleteMyListing, refreshMyListing, listClaimableServers, submitListing } = require("./boardMine") as typeof import("./boardMine");




/* apiWarmSwr1: public listings list SWR */
const LISTINGS_CACHE_TTL_MS = 90_000;
const LISTINGS_STALE_KEEP_MS = 10 * 60 * 1000;

function listingsCacheKey(query: Record<string, any> = {}) {
  return [
    String(query.kind || ""),
    String(query.q || "").toLowerCase(),
    String(query.tag || "").toLowerCase(),
    String(query.category || "").toLowerCase(),
    String(query.locale || "").toLowerCase(),
    String(query.guildTag || query.guildtag || ""),
    String(query.sort || "score").toLowerCase(),
    String(Math.max(1, Number(query.page) || 1)),
    String(Math.min(48, Math.max(1, Number(query.perPage) || 24))),
    query.allowClosed ? "1" : "0",
  ].join("|");
}

function readListingsCache(key?) {
  const entry = listingsCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age < LISTINGS_CACHE_TTL_MS) return { payload: entry.payload, fresh: true };
  if (age < LISTINGS_STALE_KEEP_MS) return { payload: entry.payload, fresh: false };
  listingsCache.delete(key);
  return null;
}

function writeListingsCache(key?, payload?) {
  if (listingsCache.size > 48) {
    const first = listingsCache.keys().next().value;
    if (first) listingsCache.delete(first);
  }
  listingsCache.set(key, { at: Date.now(), payload });
}

/* boardsListLite1: fields for public list cards (no markdown blob / moderation) */
const LIST_CARD_SELECT =
  "userId ownerId authorName authorAvatar authorAvatarHash authorAvatarUrl " +
  "title content boardKind boardDiscordId boardSlug status boardTagline boardMarkdown " +
  "boardTags boardCategories boardLocales boardLocale boardVisitorNotes boardSiteUrl " +
  "boardSocials boardInviteUrl boardBotInviteUrl boardBannerUrl boardIconUrl boardNsfw " +
  "boardFeatures boardScore boardVotes30d boardVotesMonth boardVotesMonthKey boardBumps7d " +
  "boardBumpedAt boardRatingAvg boardReviewsCount boardAccent boardStats createdAt updatedAt";

async function listListingsUncached(client?, query: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  if (!cfg.publicOpen && !query.allowClosed) {
    return {
      ok: true,
      status: 200,
      page: 1,
      perPage: 0,
      total: 0,
      listings: [],
      enabled: cfg.enabled,
      publicOpen: false,
      message: "La Vetrina è in anteprima staff. Torna presto.",
    };
  }
  const kind = String(query.kind || "").trim().toLowerCase();
  const q = sanitizeText(query.q, 80).toLowerCase();
  const tag = sanitizeText(query.tag, 32).toLowerCase();
  /* boardsExploreChipFilter1: filtri esatti da chip scheda (cat/lang/guild tag) */
  const category = sanitizeText(query.category, 40).toLowerCase();
  const locale = sanitizeText(query.locale, 16).toLowerCase();
  const guildTag = sanitizeText(query.guildTag || query.guildtag, 8);
  const sort = String(query.sort || "score").trim().toLowerCase();
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(48, Math.max(1, Number(query.perPage) || 24));
  const filter: Record<string, any> = { docType: BL, status: "approved" };
  if (kind === "server" || kind === "bot") filter.boardKind = kind;
  if (tag) filter.boardTags = tag;
  if (category) filter.boardCategories = category;
  if (locale) filter.boardLocales = locale;
  if (guildTag) {
    const gRx = new RegExp(
      `^${guildTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    );
    filter["boardStats.guildTag"] = gRx;
  }
  /* con filtro chip esatto, q resta solo label in UI (non restringe ulteriormente) */
  const chipExact = Boolean(tag || category || locale || guildTag);
  if (q && !chipExact) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { title: rx },
      { boardTagline: rx },
      { boardSlug: rx },
      { boardTags: rx },
      { boardInviteUrl: rx },
      { boardBotInviteUrl: rx },
      { boardCategories: rx },
      { boardLocales: rx },
      { "boardStats.guildTag": rx },
      { content: rx },
    ];
  }
  let sortSpec: any = { boardScore: -1, boardBumpedAt: -1, createdAt: -1 };
  if (sort === "new") sortSpec = { createdAt: -1 };
  else if (sort === "bumps") sortSpec = { boardBumpedAt: -1, boardScore: -1 };
  else if (sort === "votes") sortSpec = { boardVotes30d: -1, boardScore: -1 };
  /* boardsSortReviews1: media stelle, poi n. recensioni */
  else if (sort === "reviews" || sort === "rating" || sort === "recensioni") {
    sortSpec = { boardRatingAvg: -1, boardReviewsCount: -1, boardScore: -1, createdAt: -1 };
  }

  const total = await SiteDocument.countDocuments(filter);
  /* boardsListLite1: projection + card serialize (no full markdown blobs) */
  const rows = await SiteDocument.find(filter)
    .select(LIST_CARD_SELECT)
    .sort((sortSpec as any))
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();
  return {
    ok: true,
    status: 200,
    page,
    perPage,
    total,
    listings: rows.map((r?) => serializeListing(r, { mode: "card" })),
    enabled: cfg.enabled,
    publicOpen: cfg.publicOpen,
  };
}

async function listListings(client?, query: Record<string, any> = {}) {
  const key = listingsCacheKey(query);
  const hit = readListingsCache(key);
  if (hit?.fresh) return hit.payload;
  if (hit && !hit.fresh) {
    if (!listingsInflight.has(key)) {
      const p = listListingsUncached(client, query)
        .then((payload?) => {
          if (payload?.ok) writeListingsCache(key, payload);
          return payload;
        })
        .catch((err?) => {
          global.logger?.warn?.("[site-boards] listings refresh:", err?.message || err);
          return hit.payload;
        })
        .finally(() => listingsInflight.delete(key));
      listingsInflight.set(key, p);
    }
    return hit.payload;
  }
  let inflight = listingsInflight.get(key);
  if (!inflight) {
    inflight = listListingsUncached(client, query)
      .then((payload?) => {
        if (payload?.ok) writeListingsCache(key, payload);
        return payload;
      })
      .finally(() => listingsInflight.delete(key));
    listingsInflight.set(key, inflight);
  }
  return inflight;
}

function warmSiteBoardsListingsCache(client?) {
  return listListings(client, { sort: "score", page: 1, perPage: 24 }).catch((err?) => {
    global.logger?.warn?.("[site-boards] listings warm:", err?.message || err);
    return null;
  });
}

async function getListingBySlug(client?, slug?, opts: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const raw = String(slug || "").trim();
  let doc = null;
  /* boardsPendingRedirect1: accetta anche id Mongo nel path pubblico */
  if (mongoose.isValidObjectId(raw)) {
    doc = await SiteDocument.findOne({ _id: raw, docType: BL }).lean();
  }
  if (!doc) {
    const s = slugify(raw);
    if (s) doc = await SiteDocument.findOne({ docType: BL, boardSlug: s }).lean();
  }
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  }
  const st = String(doc.status || "").toLowerCase();
  /* boardsPendingRedirect1: pending/draft prima del gate publicOpen (redirect anche in anteprima) */
  if (st === "pending" || st === "draft" || st === "") {
    const token = String(opts.accessToken || "").trim();
    if (token) {
      const auth = await resolveBoardsUser(token);
      if (auth?.ok && String(auth.userId || "") === String(doc.userId || "")) {
        let listing = serializeListing(doc, { includeMod: true });
        if (!listing.authorName) listing.authorName = auth.globalName || auth.username || "";
        if (!listing.authorAvatar && auth.avatar) {
          listing.authorAvatar = String(auth.avatar);
          const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
          listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${auth.userId}/${listing.authorAvatar}.${ext}?size=64`;
        }
        await enrichListingAuthor(client, listing);
        listing = await refreshListingStats(client, listing);
        return {
          ok: true,
          status: 200,
          listing,
          ownerPreview: true,
          publicOpen: cfg.publicOpen,
        };
      }
    }
    return {
      ok: false,
      status: 404,
      error: "pending_not_public",
      message: "Questa scheda è in revisione e non è ancora pubblica.",
      kind: String(doc.boardKind || "") === "bot" ? "bot" : "server",
    };
  }
  if (st !== "approved") {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  }
  if (!cfg.publicOpen && !opts.allowClosed) {
    return {
      ok: false,
      status: 403,
      error: "boards_preview",
      message: "La Vetrina è in anteprima staff.",
      publicOpen: false,
    };
  }
  let listing = await enrichListingAuthor(client, serializeListing(doc));
  /* refresh membri on-read così la scheda mostra il conteggio (top.gg-like) */
  listing = await refreshListingStats(client, listing);
  return { ok: true, status: 200, listing, publicOpen: cfg.publicOpen };
}

function getBoardsPublicConfig(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const ads: any = gate.cfg.ads || {};
  return {
    ok: true,
    status: 200,
    enabled: gate.cfg.enabled,
    publicOpen: gate.cfg.publicOpen,
    voteCooldownHours: gate.cfg.voteCooldownHours,
    bumpCooldownHours: gate.cfg.bumpCooldownHours,
    maxTags: gate.cfg.maxTags,
    maxCategories: gate.cfg.maxCategories,
    maxLocales: gate.cfg.maxLocales,
    maxMarkdownChars: gate.cfg.maxMarkdownChars,
    minTaglineChars: gate.cfg.minTaglineChars,
    minDescriptionChars: gate.cfg.minDescriptionChars,
    categories: gate.cfg.categories,
    locales: gate.cfg.locales,
    categoryLabels: Object.assign({}, BOARD_CATEGORY_LABELS),
    localeLabels: Object.assign({}, BOARD_LOCALE_LABELS),
    suggestedTags: BOARD_TAG_CATALOG.slice(),
    botInviteUrl: viniliBotInviteUrl(client, null),
    /* boardsVoteFlow1 — niente secret Turnstile in pubblico */
    voteCountdownSeconds: gate.cfg.voteCountdownSeconds,
    voteAdSeconds: gate.cfg.voteAdSeconds,
    turnstileSiteKey: gate.cfg.turnstileSiteKey || "",
    turnstileRequired: Boolean(gate.cfg.turnstileSecretKey),
    ads: {
      provider: ads.provider || "mock",
      adsenseClient: ads.adsenseClient || "",
      adsenseSlot: ads.adsenseSlot || "",
      minWatchSeconds: ads.minWatchSeconds || gate.cfg.voteAdSeconds,
    },
  };
}

async function listBoardTags(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const q = sanitizeText(payload.q || "", 40).toLowerCase().replace(/\s+/g, "-");
  const limit = Math.min(250, Math.max(40, Number(payload.limit) || 160));
  const used = new Map();
  try {
    const rows = await SiteDocument.aggregate([
      {
        $match: {
          docType: BL,
          boardTags: { $exists: true, $type: "array", $ne: [] },
        },
      },
      { $unwind: "$boardTags" },
      { $group: { _id: "$boardTags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 800 },
    ]);
    for (const row of rows) {
      const tag = sanitizeText(row?._id, 32).toLowerCase().replace(/\s+/g, "-");
      if (!tag) continue;
      used.set(tag, Number(row.count) || 0);
    }
  } catch (err) {
    global.logger?.warn?.("[boards] listBoardTags aggregate:", err?.message || err);
  }

  const merged = new Map();
  for (const t of BOARD_TAG_CATALOG) {
    merged.set(t, { tag: t, count: used.get(t) || 0, source: true });
  }
  for (const [t, count] of used.entries()) {
    if (!merged.has(t)) merged.set(t, { tag: t, count, source: "user" });
    else merged.get(t).count = count;
  }

  let items = Array.from(merged.values());
  if (q) {
    items = items.filter((x?) => tagMatchesQuery(String(x.tag || ""), q));
  }
  items.sort((a?, b?) => b.count - a.count || a.tag.localeCompare(b.tag));
  items = items.slice(0, limit);
  return {
    ok: true,
    status: 200,
    maxTags: gate.cfg.maxTags,
    tags: items.map((x?) => x.tag),
    items,
  };
}

export = {
  boardsConfig,
  getBoardsPublicConfig,
  listBoardTags,
  listListings,
  warmSiteBoardsListingsCache,
  invalidateListingsListCache,
  /* boardsPendingRedirect1 */
  getListingBySlug,
  createListing,
  patchListing,
  submitListing,
  generateInvite,
  guildBoardDefaults,
  probeBoardLink,
  uploadBoardBanner,
  serveBoardBannerFile,
  listMine,
  getMyListingById,
  deleteMyListing,
  deleteServerListingsForLeftGuild,
  purgeBoardListingDoc,
  refreshMyListing,
  listClaimableServers,
  startListingVoteSession,
  progressListingVoteSession,
  voteListing,
  setListingVoteReminder,
  sweepBoardVoteReminders,
  ensureBoardsVoteReminderScheduler,
  bumpListing,
  reportListing,
  listListingReviews,
  createListingReview,
  toggleListingReviewLike,
  reportListingReview,
  upsertListingReviewReply,
  /* boardsImportSiteServerReviews1: mirror /recensioni SERVER → scheda main */
  syncSiteServerReviewToMainBoardListing,
  removeSiteServerReviewFromMainBoardListing,
  modListPending,
  getListingForStaffReview,
  modDecide,
  runBoardsStatsJob,
  ensureBoardsStatsScheduler,
  refreshListingStats,
  serializeListing,
  clientIp,
  BOARD_CATEGORIES,
  BOARD_LOCALES,
  BOARD_LOCALE_LABELS,
  BOARD_TAG_CATALOG,
};

/* boardsAnimIcon1 */

