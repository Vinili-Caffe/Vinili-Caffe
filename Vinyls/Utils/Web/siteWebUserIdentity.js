/**
 * Shared Discord identity for staff web APIs.
 * Never use a snowflake as a visible displayName — keep that only in userId.
 */
const { getGuildMemberCached, getUserCached } = require("../Interaction/interactionEntityCache");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity");
const { identityFromMember } = require("./siteStaffRosterCache");

const DEFAULT_BATCH = 5;
const DEFAULT_CAP = 80;
const DEFAULT_BUDGET_MS = 3500;
const FALLBACK_LABEL = "Utente";
/** Process-local cache of successful resolves (survives organico reloads; avoids Discord rate limits). */
const IDENTITY_OK_TTL_MS = 6 * 60 * 60_000;
const identityOkCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isDiscordSnowflake(value) {
  return /^\d{16,22}$/.test(String(value || "").trim());
}

function isSnowflakeLabel(value, userId) {
  const name = String(value || "").trim();
  const uid = String(userId || "").trim();
  if (!name) return true;
  if (uid && name === uid) return true;
  return isDiscordSnowflake(name);
}

function safeDisplayLabel(value, userId, fallback = FALLBACK_LABEL) {
  const name = String(value || "").trim();
  if (!name || isSnowflakeLabel(name, userId)) return fallback;
  return name;
}

/** Prefer username when globalName is empty / single punctuation / emoji-only junk. */
function pickUserDisplayName(user) {
  const global = String(user?.globalName || "").trim();
  const username = String(user?.username || "").trim();
  const globalOk =
    global &&
    global.length > 1 &&
    !/^[\p{P}\p{S}\p{Z}]+$/u.test(global);
  if (globalOk) return global;
  return username || global || "";
}

function identityFallback(userId, label = FALLBACK_LABEL) {
  const uid = String(userId || "").trim();
  return {
    userId: uid,
    displayName: label,
    username: "",
    avatarUrl: discordDefaultAvatarUrl({ id: uid }, { size: 128 }),
  };
}

function identityFromUser(user, userId) {
  const uid = String(user?.id || userId || "").trim();
  const displayName = pickUserDisplayName(user);
  return {
    userId: uid,
    displayName: displayName || FALLBACK_LABEL,
    username: accountUsername(user) || "",
    avatarUrl: userAvatarUrlDynamic(user, { size: 128 }) || discordDefaultAvatarUrl(user || { id: uid }, { size: 128 }),
  };
}

function readIdentityOkCache(userId) {
  const uid = String(userId || "").trim();
  const hit = identityOkCache.get(uid);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    identityOkCache.delete(uid);
    return null;
  }
  if (!hit.id || hit.id.displayName === FALLBACK_LABEL || isSnowflakeLabel(hit.id.displayName, uid)) {
    identityOkCache.delete(uid);
    return null;
  }
  return hit.id;
}

function writeIdentityOkCache(id) {
  const uid = String(id?.userId || "").trim();
  if (!uid || !id || id.displayName === FALLBACK_LABEL || isSnowflakeLabel(id.displayName, uid)) return;
  if (identityOkCache.size > 5000) {
    const first = identityOkCache.keys().next().value;
    if (first) identityOkCache.delete(first);
  }
  identityOkCache.set(uid, { exp: Date.now() + IDENTITY_OK_TTL_MS, id: { ...id, userId: uid } });
}

function isRateLimitError(err) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.httpStatus ?? err?.rawError?.status);
  if (status === 429) return true;
  return /rate.?limit|too many requests/i.test(String(err?.message || err || ""));
}

function retryAfterMs(err) {
  const raw =
    err?.retry_after ??
    err?.rawError?.retry_after ??
    err?.data?.retry_after ??
    err?.headers?.["retry-after"] ??
    err?.headers?.get?.("retry-after");
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000) + 75;
  return 1100;
}

/**
 * Fetch user without caching failures as null (interactionEntityCache would do that for 15s).
 * Retries on Discord 429 so organico history can resolve leavers.
 */
async function fetchDiscordUserFresh(client, userId) {
  const uid = String(userId || "").trim();
  if (!client || !isDiscordSnowflake(uid)) return null;
  const cached = client.users?.cache?.get?.(uid);
  if (cached) return cached;
  if (typeof client.users?.fetch !== "function") return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await client.users.fetch(uid);
    } catch (err) {
      if (isRateLimitError(err) && attempt < 4) {
        await sleep(retryAfterMs(err));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Resolve one user: guild member → Discord user cache/fetch.
 * displayName is never a raw snowflake.
 * @param {{ skipGuildMember?: boolean, preferFreshUser?: boolean }} [opts]
 */
async function resolveWebUserIdentity(client, guild, userId, opts = {}) {
  const uid = String(userId || "").trim();
  if (!isDiscordSnowflake(uid)) return identityFallback(uid);

  const warm = readIdentityOkCache(uid);
  if (warm) return warm;

  if (!opts.skipGuildMember) {
    const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
    if (member) {
      const id = identityFromMember(member);
      const out = {
        userId: uid,
        displayName: safeDisplayLabel(id.displayName, uid),
        username: id.username || "",
        avatarUrl: id.avatarUrl || discordDefaultAvatarUrl({ id: uid }, { size: 128 }),
      };
      writeIdentityOkCache(out);
      return out;
    }
  }

  let user = client?.users?.cache?.get?.(uid) || null;
  if (!user && client) {
    user = opts.preferFreshUser
      ? await fetchDiscordUserFresh(client, uid)
      : await getUserCached(client, uid).catch(() => null);
  }
  if (user) {
    const out = identityFromUser(user, uid);
    writeIdentityOkCache(out);
    return out;
  }
  return identityFallback(uid);
}

/**
 * Batch resolve with small concurrency + time budget (site-api REST friendly).
 */
async function resolveWebUserIdentitiesBatch(client, guild, userIds, opts = {}) {
  const batchSize = Math.max(1, Number(opts.batchSize) || DEFAULT_BATCH);
  const cap = Math.max(1, Number(opts.cap) || DEFAULT_CAP);
  const budgetMs = Math.max(250, Number(opts.budgetMs) || DEFAULT_BUDGET_MS);
  const paceMs = Math.max(0, Number(opts.paceMs) || 0);
  const unique = [...new Set((userIds || []).map((x) => String(x || "").trim()).filter(isDiscordSnowflake))];
  const out = new Map();
  const missing = [];

  for (const uid of unique) {
    const warm = readIdentityOkCache(uid);
    if (warm) {
      out.set(uid, warm);
      continue;
    }
    const member = guild?.members?.cache?.get?.(uid);
    if (member) {
      const id = identityFromMember(member);
      const resolved = {
        userId: uid,
        displayName: safeDisplayLabel(id.displayName, uid),
        username: id.username || "",
        avatarUrl: id.avatarUrl || discordDefaultAvatarUrl({ id: uid }, { size: 128 }),
      };
      writeIdentityOkCache(resolved);
      out.set(uid, resolved);
      continue;
    }
    const cachedUser = client?.users?.cache?.get?.(uid);
    if (cachedUser) {
      const resolved = identityFromUser(cachedUser, uid);
      writeIdentityOkCache(resolved);
      out.set(uid, resolved);
      continue;
    }
    missing.push(uid);
  }

  const toFetch = missing.slice(0, cap);
  const t0 = Date.now();
  for (let i = 0; i < toFetch.length; i += batchSize) {
    if (Date.now() - t0 > budgetMs) break;
    const chunk = toFetch.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (uid) => {
        // Prefer fresh users.fetch: do not cache 429/failures as null via getUserCached.
        const id = await resolveWebUserIdentity(client, guild, uid, {
          // History includes leavers: skip guild.members.fetch (Unknown Member noise).
          skipGuildMember: opts.skipGuildMember !== false,
          preferFreshUser: true,
        });
        out.set(uid, id);
      }),
    );
    if (paceMs && i + batchSize < toFetch.length) await sleep(paceMs);
  }

  for (const uid of missing) {
    if (!out.has(uid)) out.set(uid, identityFallback(uid));
  }
  return out;
}

module.exports = {
  FALLBACK_LABEL,
  isDiscordSnowflake,
  isSnowflakeLabel,
  safeDisplayLabel,
  identityFallback,
  identityFromUser,
  resolveWebUserIdentity,
  resolveWebUserIdentitiesBatch,
};
