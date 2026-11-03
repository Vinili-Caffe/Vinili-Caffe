/** Public review list (avatars/names) — short TTL; viewer likes applied per request. */
const PUBLIC_REVIEWS_CACHE_TTL_MS = Math.max(
  8_000,
  Number(process.env.VC_SITE_REVIEWS_LIST_CACHE_MS || 20_000) || 20_000,
);
const publicReviewsListCache = new Map();
/** Bumped on invalidate so in-flight list builders cannot re-poison TTL cache after a like. */
let publicReviewsCacheGen = 0;

function publicReviewsCacheKey(guildId?, reviewKind?) {
  return `${String(guildId || "").trim()}:${String(reviewKind || "server").trim()}`;
}

function invalidatePublicReviewsListCache(guildId = "") {
  publicReviewsCacheGen += 1;
  const gid = String(guildId || "").trim();
  if (!gid) {
    publicReviewsListCache.clear();
    return;
  }
  for (const key of [...publicReviewsListCache.keys()]) {
    if (key.startsWith(`${gid}:`)) publicReviewsListCache.delete(key);
  }
}

function readPublicReviewsListCache(guildId?, reviewKind?) {
  const key = publicReviewsCacheKey(guildId, reviewKind);
  const hit = publicReviewsListCache.get(key);
  if (!hit || Number(hit.expiresAt || 0) <= Date.now()) {
    if (hit) publicReviewsListCache.delete(key);
    return null;
  }
  return Array.isArray(hit.items) ? hit.items : null;
}

function writePublicReviewsListCache(guildId?, reviewKind?, items?) {
  publicReviewsListCache.set(publicReviewsCacheKey(guildId, reviewKind), {
    expiresAt: Date.now() + PUBLIC_REVIEWS_CACHE_TTL_MS,
    items: Array.isArray(items) ? items : [],
  });
}

function applyViewerLikesToReviews(list?, viewerUserId?) {
  const uid = String(viewerUserId || "").trim();
  return (Array.isArray(list) ? list : []).map((entry?) => {
    if (!entry || typeof entry !== "object") return entry;
    const likes = Array.isArray(entry._likedUserIds) ? entry._likedUserIds.map(String) : [];
    const next = { ...entry };
    delete next._likedUserIds;
    next.likeCount = likes.length;
    next.likedByViewer = Boolean(uid && likes.includes(uid));
    return next;
  });
}

function getPublicReviewsCacheGen() {
  return publicReviewsCacheGen;
}

export = {
  PUBLIC_REVIEWS_CACHE_TTL_MS,
  invalidatePublicReviewsListCache,
  readPublicReviewsListCache,
  writePublicReviewsListCache,
  applyViewerLikesToReviews,
  getPublicReviewsCacheGen,
};
