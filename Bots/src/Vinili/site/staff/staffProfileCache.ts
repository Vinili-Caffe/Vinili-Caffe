/** Profilo staff: cache dei profili già calcolati. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { readCachedWebsiteMember } = require("../../site/http/websiteGuildMemberFetch") as typeof import("../../site/http/websiteGuildMemberFetch");

const PROFILE_CACHE_TTL_MS = 120_000;
const PROFILE_STALE_CACHE_MS = 45 * 60 * 1000;
const PROFILE_CACHE_MAX = 200;
const profileCache = new Map();
/* careerPinRecentPex2: ultimo pex Helper = qualsiasi →Helper (anche PM→Helper); niente Member→Helper stale */
const PROFILE_PAYLOAD_VERSION = 26;

function profileCacheKey(viewerUserId?, targetUserId?) {
  const guild = String(IDs.guilds.main || "");
  const target = String(targetUserId || "").trim();
  const viewer = String(viewerUserId || "").trim();
  if (!target) return "";
  if (viewer && viewer !== target) {
    return `v${PROFILE_PAYLOAD_VERSION}:${guild}:${viewer}->${target}`;
  }
  return `v${PROFILE_PAYLOAD_VERSION}:${guild}:${target}`;
}

function readProfileCache(viewerUserId?, targetUserId?) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return null;
  const entry = profileCache.get(key);
  if (!entry || !entry.payload) return null;
  if (Number(entry.exp || 0) <= Date.now()) return null;
  return entry.payload;
}

function readStaleProfileCache(viewerUserId?, targetUserId?) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return null;
  const entry = profileCache.get(key);
  if (!entry || !entry.payload) return null;
  const age = Date.now() - Number(entry.writtenAt || 0);
  if (!Number.isFinite(age) || age > PROFILE_STALE_CACHE_MS) return null;
  return { ...entry.payload, cached: true, stale: true };
}

/* peerProfileTimeout1: se Discord timeout, riusa qualsiasi payload fresco per lo stesso target
   (anche cache di un altro viewer) così i peer-switch non restano vuoti. */
function readAnyStaleProfileCacheForTarget(targetUserId?) {
  const uid = String(targetUserId || "").trim();
  if (!uid) return null;
  const guild = String(IDs.guilds.main || "");
  const prefix = `v${PROFILE_PAYLOAD_VERSION}:${guild}:`;
  let best = null;
  for (const [key, entry] of profileCache) {
    if (!entry?.payload?.ok || entry.payload.prospect) continue;
    if (!String(key || "").startsWith(prefix)) continue;
    if (!(key === `${prefix}${uid}` || key.endsWith(`->${uid}`))) continue;
    const age = Date.now() - Number(entry.writtenAt || 0);
    if (!Number.isFinite(age) || age > PROFILE_STALE_CACHE_MS) continue;
    if (!best || age < best.age) best = { age, payload: entry.payload };
  }
  return best ? { ...best.payload, cached: true, stale: true } : null;
}

async function warmStaffRosterMembers(client?, preferUserId?) {
  try {
    const { getCachedStaffRoster } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
    await Promise.race([
      getCachedStaffRoster(client).catch(() => null),
      new Promise((resolve?) => setTimeout(resolve, 2800)),
    ]);
  } catch (_) {}
  const uid = String(preferUserId || "").trim();
  if (!uid) return null;
  return readCachedWebsiteMember(uid) || null;
}

function writeProfileCache(viewerUserId?, targetUserId?, payload?) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return;
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const first = profileCache.keys().next().value;
    if (first) profileCache.delete(first);
  }
  profileCache.set(key, {
    exp: Date.now() + PROFILE_CACHE_TTL_MS,
    writtenAt: Date.now(),
    payload,
  });
}

function clearStaffProfileCacheForUser(userId?, extras: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    const prefix = `v${PROFILE_PAYLOAD_VERSION}:${String(IDs.guilds.main || "")}:`;
    for (const key of profileCache.keys()) {
      if (key === `${prefix}${uid}` || key.endsWith(`->${uid}`) || key.startsWith(`${prefix}${uid}->`)) {
        profileCache.delete(key);
      }
    }
  } catch (e) {}
  /* staffProfLiveAll1: ogni mutazione profilo → WS ai viewer aperti (anche di altri) */
  if (extras && extras.silent === true) return;
  try {
    const { broadcastSiteStaffProfileChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    broadcastSiteStaffProfileChanged(uid, extras && typeof extras === "object" ? extras : {});
  } catch (_) {}
}

export = { PROFILE_PAYLOAD_VERSION, readProfileCache, readStaleProfileCache, readAnyStaleProfileCacheForTarget, warmStaffRosterMembers, writeProfileCache, clearStaffProfileCacheForUser };
