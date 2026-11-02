/** Classifiche utenti: cache delle risposte. */
const LIST_CACHE_TTL_MS = 90_000;
/* siteUsersSwr1: servi stale fino a 10m mentre rebuild in background (come site-roles) */
const LIST_STALE_KEEP_MS = 10 * 60 * 1000;
const listCache = new Map();
/* siteUsersW2: singleflight on listCache miss — stampede → one Mongo/Discord build */
const listCacheInflight = new Map();

function cacheLookup(key?, staleKeepMs?) {
  const row = listCache.get(key);
  if (!row || row.payload == null) return { hit: null, stale: false };
  const now = Date.now();
  if (row.expiresAt > now) return { hit: row.payload, stale: false };
  const at = Number(row.at) > 0 ? Number(row.at) : Number(row.expiresAt) || 0;
  const keep = Number.isFinite(staleKeepMs) && staleKeepMs > 0 ? staleKeepMs : LIST_STALE_KEEP_MS;
  if (at > 0 && now - at < keep) return { hit: row.payload, stale: true };
  return { hit: null, stale: false };
}

function cacheGet(key?) {
  const { hit, stale } = cacheLookup(key, LIST_STALE_KEEP_MS);
  return hit && !stale ? hit : null;
}

function cacheSet(key?, payload?, ttlMs?) {
  const ttl = Number(ttlMs);
  const now = Date.now();
  listCache.set(key, {
    payload,
    at: now,
    expiresAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl : LIST_CACHE_TTL_MS),
  });
}

function startCacheBuild(key?, builder?, ttlMs?) {
  let inflight = listCacheInflight.get(key);
  if (inflight) return inflight;
  inflight = Promise.resolve()
    .then(() => builder())
    .then((payload?) => {
      cacheSet(key, payload, ttlMs);
      return payload;
    })
    .finally(() => {
      listCacheInflight.delete(key);
    });
  listCacheInflight.set(key, inflight);
  return inflight;
}

/** siteUsersSwr1: se stale, ritorna subito e refresh in background (force=await rebuild) */
async function cacheGetOrBuild(key?, builder?, ttlMs?, opts?) {
  const staleKeep =
    Number(opts?.staleKeepMs) > 0 ? Number(opts.staleKeepMs) : LIST_STALE_KEEP_MS;
  const force = Boolean(opts?.force);
  const { hit, stale } = cacheLookup(key, staleKeep);
  if (hit && !stale) return hit;
  const inflight = startCacheBuild(key, builder, ttlMs);
  if (hit && stale && !force) {
    inflight.catch((err?) => {
      global.logger?.warn?.("[WEBHOOK] site-users swr refresh:", key, err?.message || err);
    });
    return hit;
  }
  return inflight;
}

function cacheLookupMeta(key?, staleKeepMs?) {
  return cacheLookup(key, staleKeepMs);
}

export = { LIST_CACHE_TTL_MS, LIST_STALE_KEEP_MS, listCache, listCacheInflight, cacheGet, cacheSet, startCacheBuild, cacheGetOrBuild, cacheLookupMeta };
