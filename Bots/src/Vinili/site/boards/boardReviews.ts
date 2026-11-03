/** Bacheche: recensioni dei server (elenco, scrittura, like, segnalazioni, risposte) e allineamento con le recensioni del sito. */
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { BOARD_CATEGORIES, BOARD_LOCALES } = require("./boardCatalog") as typeof import("./boardCatalog");
const { snowflakeOk, sanitizeText, preferAnimatedDiscordMediaUrl } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");

const BL = SITE_DOCUMENT_TYPE.BOARD_LISTING;
const MAIN_GUILD_ID = String(IDs?.guilds?.main || "").trim();
const BR = SITE_DOCUMENT_TYPE.BOARD_REPORT;
const BREV = SITE_DOCUMENT_TYPE.BOARD_REVIEW;
const listingsCache = new Map();
const listingsInflight = new Map();

function invalidateListingsListCache() {
  listingsCache.clear();
  listingsInflight.clear();
}

function emitBoardsChanged(action?, extras: Record<string, any> = {}) {
  try {
    invalidateListingsListCache();
  } catch (_) {}
  try {
    const { broadcastSiteBoardsChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    broadcastSiteBoardsChanged(action, extras && typeof extras === "object" ? extras : {});
  } catch (_) {}
}
function boardsConfig(client?) {
  const raw = client?.config?.boards && typeof client.config.boards === "object" ? client.config.boards : {};
  const turnstile =
    raw.turnstile && typeof raw.turnstile === "object" ? raw.turnstile : {};
  const ads = raw.ads && typeof raw.ads === "object" ? raw.ads : {};
  const adProvider = String(ads.provider || "mock").trim().toLowerCase() || "mock";
  return {
    enabled: raw.enabled !== false,
    publicOpen: raw.publicOpen === true,
    voteCooldownHours: Math.max(1, Number(raw.voteCooldownHours) || 12),
    bumpCooldownHours: Math.max(0.25, Number(raw.bumpCooldownHours) || 2),
    scoreVotesWeight: Math.max(0, Number(raw.scoreVotesWeight) || 1),
    scoreBumpsWeight: Math.max(0, Number(raw.scoreBumpsWeight) || 3),
    /* boardsMaxCatsTags12: default 12 categorie / 12 tag */
    maxTags: Math.max(1, Math.min(24, Number(raw.maxTags) || 12)),
    maxCategories: Math.max(1, Math.min(24, Number(raw.maxCategories) || 12)),
    /* boardsLocalesDd32: max 32 lingue */
    maxLocales: Math.max(1, Math.min(32, Number(raw.maxLocales) || 32)),
    maxMarkdownChars: Math.max(200, Math.min(8000, Number(raw.maxMarkdownChars) || 4000)),
    /* boardsDescMinPreview1: min caratteri descrizioni */
    minTaglineChars: Math.max(8, Math.min(80, Number(raw.minTaglineChars) || 20)),
    minDescriptionChars: Math.max(20, Math.min(500, Number(raw.minDescriptionChars) || 80)),
    /* boardsVoteFlow1 + boardsVoteNoCountdown1: 0 = Vota subito (ad+turnstile restano) */
    voteCountdownSeconds: Math.max(0, Math.min(60, Number(raw.voteCountdownSeconds) || 0)),
    /* boardsVoteNoAdCountdown1: 0 = niente attesa sponsor */
    voteAdSeconds: Math.max(0, Math.min(120, Number(raw.voteAdSeconds) || Number(ads.minWatchSeconds) || 0)),
    turnstileSiteKey: String(turnstile.siteKey || "").trim(),
    turnstileSecretKey: String(turnstile.secretKey || "").trim(),
    ads: {
      provider: ["mock", "adsense", "none"].includes(adProvider) ? adProvider : "mock",
      adsenseClient: String(ads.adsenseClient || "").trim(),
      adsenseSlot: String(ads.adsenseSlot || "").trim(),
      minWatchSeconds: Math.max(0, Math.min(120, Number(ads.minWatchSeconds) || Number(raw.voteAdSeconds) || 0)),
    },
    categories: BOARD_CATEGORIES.slice(),
    locales: BOARD_LOCALES.slice(),
  };
}

function featureGate(client?) {
  const cfg = boardsConfig(client);
  if (!cfg.enabled) {
    return { ok: false, status: 503, error: "boards_disabled", message: "La Vetrina non è attiva." };
  }
  return { ok: true, cfg };
}

/* siteApiFetchLiteBoot1: prefer fetchLite on site-api REST client */
async function fetchGuildPreferLite(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!client?.guilds || !snowflakeOk(gid)) return null;
  const cached = client.guilds.cache?.get?.(gid) || null;
  if (cached?.members && typeof cached.members.fetch === "function" && cached.partial !== true) {
    return cached;
  }
  try {
    const lite = client.guilds.fetchLite;
    if (client._isSiteApiRestClient && typeof lite === "function") {
      return await lite(gid);
    }
  } catch (_) {}
  try {
    return (await client.guilds.fetch?.(gid).catch(() => null)) || cached;
  } catch (_) {
    return cached;
  }
}

function hashIp(ip?) {
  const raw = String(ip || "").trim();
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

/* boardsListingReviews1 */
function boardReviewAuthorAvatar(auth?) {
  const uid = String(auth?.userId || "").trim();
  const hash = String(auth?.avatar || "").trim();
  if (!uid || !hash) return "";
  const ext = /^a_/i.test(hash) ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${uid}/${hash}.${ext}?size=64`;
}

function discordDefaultAvatarUrl(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return "";
  try {
    const idx = Number((BigInt(uid) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${Number.isFinite(idx) ? idx : 0}.png`;
  } catch (_) {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function serializeBoardReview(doc?, viewerUserId?) {
  if (!doc) return null;
  const likes = Array.isArray(doc.likedUserIds) ? doc.likedUserIds.map(String) : [];
  const uid = String(viewerUserId || "").trim();
  const replyText = String(doc.serverReplyContent || "").trim();
  const authorUserId = String(doc.userId || "").trim();
  let authorName = String(doc.authorName || "").trim();
  let authorAvatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!authorAvatarUrl && authorUserId) {
    authorAvatarUrl = discordDefaultAvatarUrl(authorUserId);
  }
  return {
    id: String(doc._id),
    listingId: String(doc.boardListingId || ""),
    userId: authorUserId,
    rating: Math.max(1, Math.min(5, Number(doc.rating) || 0)),
    content: String(doc.content || ""),
    status: String(doc.status || "approved"),
    authorName: authorName || "Utente",
    authorAvatarUrl,
    likeCount: likes.length,
    likedByMe: uid ? likes.includes(uid) : false,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    /* boardsReviewReply1 */
    reply: replyText
      ? {
          content: replyText,
          at: doc.serverReplyAt ? new Date(doc.serverReplyAt).toISOString() : null,
          authorId: String(doc.serverReplyAuthorId || ""),
        }
      : null,
  };
}

/* boardsReviewsUiPager1 + boardsReviewsUiPolish1: sempre nick+avatar live da Discord userId */
async function hydrateBoardReviewAuthor(client?, doc?) {
  if (!doc) return null;
  const uid = String(doc.userId || "").trim();
  let name = String(doc.authorName || "").trim();
  let avatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!uid) {
    if (!avatarUrl) avatarUrl = "";
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: false };
  }
  try {
    let user = client?.users?.cache?.get?.(uid) || null;
    if (!user && client?.users?.fetch) {
      user = await client.users.fetch(uid).catch(() => null);
    }
    let member = null;
    if (MAIN_GUILD_ID && client?.guilds) {
      const g =
        client.guilds.cache?.get?.(MAIN_GUILD_ID) ||
        (await fetchGuildPreferLite(client, MAIN_GUILD_ID));
      if (g?.members?.fetch) {
        member = g.members.cache?.get?.(uid) || (await g.members.fetch(uid).catch(() => null));
      }
    }
    /* Sempre preferisci profilo Discord vivo (nick salvato spesso stale) */
    const liveName = String(
      member?.displayName || user?.globalName || user?.username || "",
    ).trim();
    if (liveName) name = liveName;
    else if (!name || /^\d{16,22}$/.test(name) || /^utente$/i.test(name)) name = "Utente";

    if (user?.displayAvatarURL) {
      avatarUrl = preferAnimatedDiscordMediaUrl(
        String(user.displayAvatarURL({ size: 64, extension: "png", forceStatic: false })),
      );
    } else if (member?.displayAvatarURL) {
      avatarUrl = preferAnimatedDiscordMediaUrl(
        String(member.displayAvatarURL({ size: 64, extension: "png", forceStatic: false })),
      );
    } else if (!avatarUrl) {
      avatarUrl = discordDefaultAvatarUrl(uid);
    }

    const patch: Record<string, any> = {};
    if (name && name !== String(doc.authorName || "").trim()) patch.authorName = name;
    if (avatarUrl && avatarUrl !== String(doc.authorAvatarUrl || "").trim()) {
      patch.authorAvatarUrl = avatarUrl;
    }
    if (user?.avatar != null && String(user.avatar || "") !== String(doc.authorAvatar || "").trim()) {
      patch.authorAvatar = String(user.avatar || "");
    }
    if (Object.keys(patch).length && doc._id) {
      await SiteDocument.updateOne({ _id: doc._id, docType: BREV }, { $set: patch }).catch(() => null);
    }
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: Object.keys(patch).length > 0 };
  } catch (_) {
    if (!avatarUrl && uid) avatarUrl = discordDefaultAvatarUrl(uid);
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: false };
  }
}

async function recomputeListingRating(listingId?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ratingAvg: 0, reviewsCount: 0 };
  const rows = await SiteDocument.find({
    docType: BREV,
    boardListingId: id,
    status: "approved",
  })
    .select({ rating: 1 })
    .lean();
  const count = rows.length;
  let avg = 0;
  if (count) {
    const sum = rows.reduce((acc?, r?) => acc + (Number(r.rating) || 0), 0);
    avg = Math.round((sum / count) * 10) / 10;
  }
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardRatingAvg: avg, boardReviewsCount: count } },
  );
  return { ratingAvg: avg, reviewsCount: count };
}

async function listListingReviews(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  let viewerUserId = "";
  if (payload.accessToken) {
    const auth = await resolveBoardsUser(payload.accessToken);
    if (auth?.ok) viewerUserId = auth.userId;
  }

  const sortKey = String(payload.sort || "relevant").toLowerCase();
  /* boardsReviewsUiPager1 */
  const page = Math.max(1, Number(payload.page) || 1);
  const perPage = Math.min(24, Math.max(1, Number(payload.perPage) || 8));
  const rows = await SiteDocument.find({
    docType: BREV,
    boardListingId: id,
    status: "approved",
  })
    .limit(500)
    .lean();

  let reviews = rows.map((r?) => serializeBoardReview(r, viewerUserId)).filter(Boolean);
  if (sortKey === "newest") {
    reviews.sort((a?, b?) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  } else if (sortKey === "highest") {
    reviews.sort(
      (a?, b?) =>
        Number(b.rating) - Number(a.rating) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  } else {
    reviews.sort(
      (a?, b?) =>
        Number(b.likeCount) - Number(a.likeCount) ||
        Number(b.rating) - Number(a.rating) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  }

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const k = String(Math.max(1, Math.min(5, Number(r.rating) || 0)));
    if (dist[k] != null) dist[k] += 1;
  }
  const ratingAvg = Number(listing.boardRatingAvg) || 0;
  const reviewsCount = Number(listing.boardReviewsCount) || reviews.length;
  const totalPages = Math.max(1, Math.ceil(reviews.length / perPage) || 1);
  const pageClamped = Math.min(page, totalPages);
  const sliceStart = (pageClamped - 1) * perPage;
  const pageSlice = reviews.slice(sliceStart, sliceStart + perPage);
  const docById = new Map(rows.map((d?) => [String(d._id), d]));

  const pageReviews = [];
  for (const r of pageSlice) {
    const doc: any = docById.get(String(r.id));
    if (!doc) {
      pageReviews.push(r);
      continue;
    }
    const hydrated = await hydrateBoardReviewAuthor(client, doc);
    const base = serializeBoardReview(
      {
        ...doc,
        authorName: hydrated?.authorName || doc.authorName,
        authorAvatarUrl: hydrated?.authorAvatarUrl || doc.authorAvatarUrl,
      },
      viewerUserId,
    );
    pageReviews.push(base || r);
  }

  let mine = null;
  if (viewerUserId) {
    const mineDoc: any = await SiteDocument.findOne({
      docType: BREV,
      boardListingId: id,
      userId: viewerUserId,
    }).lean();
    if (mineDoc) {
      const hydratedMine = await hydrateBoardReviewAuthor(client, mineDoc);
      mine = serializeBoardReview(
        {
          ...mineDoc,
          authorName: hydratedMine?.authorName || mineDoc.authorName,
          authorAvatarUrl: hydratedMine?.authorAvatarUrl || mineDoc.authorAvatarUrl,
        },
        viewerUserId,
      );
    }
  }

  const ownerId = String(listing.userId || listing.ownerId || "").trim();
  const isOwner = Boolean(viewerUserId) && Boolean(ownerId) && viewerUserId === ownerId;
  const canReply = isOwner;
  const cats = Array.isArray(listing.boardCategories)
    ? listing.boardCategories.map(String).filter(Boolean).slice(0, 4)
    : [];
  return {
    ok: true,
    status: 200,
    listingId: id,
    ratingAvg,
    reviewsCount,
    distribution: dist,
    reviews: pageReviews,
    page: pageClamped,
    perPage,
    totalPages,
    mine,
    /* boardsReviewsOwnerGuard1: creatore scheda non può auto-recensirsi */
    canReview:
      Boolean(viewerUserId) &&
      String(listing.status) === "approved" &&
      !mine &&
      !isOwner,
    isOwner,
    canReply,
    listing: {
      id,
      name: String(listing.title || ""),
      iconUrl: preferAnimatedDiscordMediaUrl(String(listing.boardIconUrl || "")),
      categories: cats,
    },
  };
}

async function createListingReview(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const rating = Math.round(Number(payload.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, status: 400, error: "invalid_rating", message: "Seleziona una valutazione da 1 a 5 stelle." };
  }
  const content = sanitizeText(payload.content || payload.text || "", 2048);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "short_content", message: "La recensione è troppo corta." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" }).lean();
  if (!listing) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  }
  const listingOwnerId = String(listing.userId || listing.ownerId || "").trim();
  if (listingOwnerId && listingOwnerId === auth.userId) {
    return {
      ok: false,
      status: 403,
      error: "own_listing",
      message: "Non puoi recensire la tua stessa scheda o il tuo stesso server.",
    };
  }
  const existing = await SiteDocument.findOne({
    docType: BREV,
    boardListingId: id,
    userId: auth.userId,
  }).lean();
  if (existing) {
    return { ok: false, status: 409, error: "already_reviewed", message: "Hai già recensito questa scheda." };
  }

  let doc;
  try {
    doc = await SiteDocument.create({
      docType: BREV,
      userId: auth.userId,
      boardListingId: id,
      guildId: String(listing.boardDiscordId || ""),
      rating,
      content,
      status: "approved",
      likedUserIds: [],
      authorName: auth.globalName || auth.username || "",
      authorAvatarUrl: boardReviewAuthorAvatar(auth),
      boardClientIpHash: hashIp(reqMeta.ip),
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("duplicate"))) {
      return { ok: false, status: 409, error: "already_reviewed", message: "Hai già recensito questa scheda." };
    }
    throw err;
  }

  const agg = await recomputeListingRating(id);
  emitBoardsChanged("review", { listingId: id });
  return {
    ok: true,
    status: 201,
    review: serializeBoardReview(doc, auth.userId),
    ...agg,
  };
}

async function toggleListingReviewLike(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const review = await SiteDocument.findOne({ _id: reviewId, docType: BREV, status: "approved" });
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  const likes = Array.isArray(review.likedUserIds) ? review.likedUserIds.map(String) : [];
  const has = likes.includes(auth.userId);
  await SiteDocument.updateOne(
    { _id: reviewId, docType: BREV },
    has ? { $pull: { likedUserIds: auth.userId } } : { $addToSet: { likedUserIds: auth.userId } },
  );
  const updated = await SiteDocument.findById(reviewId).lean();
  return {
    ok: true,
    status: 200,
    review: serializeBoardReview(updated, auth.userId),
    liked: !has,
  };
}

async function reportListingReview(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 8) {
    return { ok: false, status: 400, error: "short_reason", message: "Motivo troppo corto." };
  }
  const review: any = await SiteDocument.findOne({ _id: reviewId, docType: BREV }).lean();
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  await SiteDocument.create({
    docType: BR,
    userId: auth.userId,
    boardListingId: String(review.boardListingId || ""),
    guildId: String(review.guildId || ""),
    content: `review:${reviewId}: ${reason}`,
    status: "open",
    authorName: auth.globalName || auth.username || "",
  });
  return { ok: true, status: 201, reported: true };
}

/* boardsReviewReply1: risposta ufficiale del proprietario scheda */
async function upsertListingReviewReply(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const review: any = await SiteDocument.findOne({ _id: reviewId, docType: BREV, status: "approved" }).lean();
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  const listingId = String(review.boardListingId || "").trim();
  if (!mongoose.isValidObjectId(listingId)) {
    return { ok: false, status: 400, error: "invalid_listing", message: "Scheda non valida." };
  }
  const listing: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(listing.userId || listing.ownerId || "") !== auth.userId) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo il creatore della scheda può rispondere alle recensioni.",
    };
  }

  const clear = payload.clear === true || payload.delete === true;
  const content = sanitizeText(payload.content || payload.text || "", 2000);
  if (!clear && content.length < 8) {
    return { ok: false, status: 400, error: "reply_too_short", message: "La risposta deve avere almeno 8 caratteri." };
  }

  const $set = clear
    ? {
        serverReplyContent: "",
        serverReplyAt: null,
        serverReplyAuthorId: "",
      }
    : {
        serverReplyContent: content,
        serverReplyAt: new Date(),
        serverReplyAuthorId: auth.userId,
      };

  const nextDoc = await SiteDocument.findOneAndUpdate(
    { _id: reviewId, docType: BREV },
    { $set },
    { new: true },
  ).lean();
  if (!nextDoc) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare la risposta." };
  }
  return {
    ok: true,
    status: 200,
    review: serializeBoardReview(nextDoc, auth.userId),
    message: clear ? "Risposta rimossa." : "Risposta pubblicata.",
  };
}

/**
 * boardsImportSiteServerReviews1
 * Specchio continuo: recensione SITE kind=server → board_review sulla scheda main guild.
 */
async function findMainGuildServerListing() {
  const gid = String(MAIN_GUILD_ID || "").trim();
  if (!gid) return null;
  const listing = await SiteDocument.findOne({
    docType: BL,
    boardKind: "server",
    status: "approved",
    $or: [{ boardDiscordId: gid }, { guildId: gid }],
  })
    .select({ _id: 1, boardDiscordId: 1, userId: 1 })
    .lean();
  return listing || null;
}

async function syncSiteServerReviewToMainBoardListing(siteReviewDoc?) {
  try {
    const src = siteReviewDoc && typeof siteReviewDoc === "object" ? siteReviewDoc : null;
    if (!src) return { ok: false, skipped: true };
    if (String(src.reviewKind || "").toLowerCase() !== "server") return { ok: false, skipped: true };
    const uid = String(src.userId || "").trim();
    if (!uid) return { ok: false, skipped: true };
    const listing: any = await findMainGuildServerListing();
    if (!listing) return { ok: false, skipped: true, reason: "no_listing" };
    const listingOwnerId = String(listing.userId || listing.ownerId || "").trim();
    if (listingOwnerId && listingOwnerId === uid) {
      return { ok: false, skipped: true, reason: "own_listing" };
    }
    const listingId = String(listing._id);
    const rating = Math.max(1, Math.min(5, Math.round(Number(src.rating) || 0)));
    const content = String(src.content || "").trim();
    if (!rating || content.length < 1) return { ok: false, skipped: true };

    const $set = {
      rating,
      content,
      status: "approved",
      likedUserIds: Array.isArray(src.likedUserIds) ? src.likedUserIds.map(String) : [],
      authorName: String(src.authorName || "Utente").trim() || "Utente",
      authorAvatarUrl: preferAnimatedDiscordMediaUrl(String(src.authorAvatarUrl || "")),
      serverReplyContent: String(src.serverReplyContent || ""),
      serverReplyAt: src.serverReplyAt ? new Date(src.serverReplyAt) : null,
      serverReplyAuthorId: String(src.serverReplyAuthorId || ""),
      guildId: String(listing.boardDiscordId || MAIN_GUILD_ID || ""),
      provider: "site_reviews_mirror",
    };

    await SiteDocument.findOneAndUpdate(
      { docType: BREV, boardListingId: listingId, userId: uid },
      {
        $set,
        $setOnInsert: {
          docType: BREV,
          boardListingId: listingId,
          userId: uid,
          createdBy: "site",
          dedupeKey: src._id ? `mirror_site_review:${String(src._id)}` : undefined,
          createdAt: src.createdAt ? new Date(src.createdAt) : new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await recomputeListingRating(listingId);
    return { ok: true, listingId };
  } catch (err) {
    try {
      global.logger?.warn?.("[siteBoardsApi] syncSiteServerReviewToMainBoardListing:", err?.message || err);
    } catch (_) {}
    return { ok: false, error: String(err?.message || err) };
  }
}

async function removeSiteServerReviewFromMainBoardListing(userId?) {
  try {
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false, skipped: true };
    const listing: any = await findMainGuildServerListing();
    if (!listing) return { ok: false, skipped: true };
    const listingId = String(listing._id);
    const del = await SiteDocument.deleteOne({
      docType: BREV,
      boardListingId: listingId,
      userId: uid,
    });
    if (del?.deletedCount) await recomputeListingRating(listingId);
    return { ok: true, listingId, deleted: Number(del?.deletedCount || 0) };
  } catch (err) {
    try {
      global.logger?.warn?.("[siteBoardsApi] removeSiteServerReviewFromMainBoardListing:", err?.message || err);
    } catch (_) {}
    return { ok: false, error: String(err?.message || err) };
  }
}

export = { BL, MAIN_GUILD_ID, BR, BREV, listingsCache, listingsInflight, invalidateListingsListCache, emitBoardsChanged, boardsConfig, featureGate, fetchGuildPreferLite, hashIp, listListingReviews, createListingReview, toggleListingReviewLike, reportListingReview, upsertListingReviewReply, syncSiteServerReviewToMainBoardListing, removeSiteServerReviewFromMainBoardListing };
