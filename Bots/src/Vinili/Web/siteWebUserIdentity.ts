const { getGuildMemberCached, getUserCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const {
  accountUsername,
  userAvatarUrlDynamic,
  sitePreferredAvatarUrl,
} = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { identityFromMember } = require("../features/staff/siteStaffRosterCache") as typeof import("../features/staff/siteStaffRosterCache");

const DEFAULT_BATCH = 5;
const DEFAULT_CAP = 80;
const DEFAULT_BUDGET_MS = 3500;
const FALLBACK_LABEL = "Utente";
const IDENTITY_OK_TTL_MS = 6 * 60 * 60_000;
const identityOkCache = new Map();

function sleep(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isDiscordSnowflake(value?) {
  return /^\d{16,22}$/.test(String(value || "").trim());
}

function isSnowflakeLabel(value?, userId?) {
  const name = String(value || "").trim();
  const uid = String(userId || "").trim();
  if (!name) return true;
  if (uid && name === uid) return true;
  return isDiscordSnowflake(name);
}

function safeDisplayLabel(value?, userId?, fallback = FALLBACK_LABEL) {
  const name = String(value || "").trim();
  if (!name || isSnowflakeLabel(name, userId)) return fallback;
  return name;
}

function pickUserDisplayName(user?) {
  const global = String(user?.globalName || "").trim();
  const username = String(user?.username || "").trim();
  const globalOk =
    global &&
    global.length > 1 &&
    !/^[\p{P}\p{S}\p{Z}]+$/u.test(global);
  if (globalOk) return global;
  return username || global || "";
}

function identityFallback(userId?, label = FALLBACK_LABEL) {
  const uid = String(userId || "").trim();
  return {
    userId: uid,
    displayName: label,
    username: "",
    // avatarSiteFb1: empty → client site silhouette (never Discord embed defaults).
    avatarUrl: "",
  };
}

function identityFromUser(user?, userId?) {
  const uid = String(user?.id || userId || "").trim();
  const displayName = pickUserDisplayName(user);
  return {
    userId: uid,
    displayName: displayName || FALLBACK_LABEL,
    username: accountUsername(user) || "",
    /* organicoAvatarGlobal1: preferisci CDN /avatars/ globale (no guild URL fantasma) */
    avatarUrl:
      sitePreferredAvatarUrl(user, { size: 128, preferAnimated: true, allowDefault: false }) ||
      userAvatarUrlDynamic(user, { size: 128, allowDefault: false }) ||
      "",
  };
}

function readIdentityOkCache(userId?) {
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

function writeIdentityOkCache(id?) {
  const uid = String(id?.userId || "").trim();
  if (!uid || !id || id.displayName === FALLBACK_LABEL || isSnowflakeLabel(id.displayName, uid)) return;
  const av = String(id.avatarUrl || "").trim();
  /* organicoAvatarHeal1: non cacheare embed / URL non-CDN (snap 404) come “ok” */
  if (av && !/^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d+\/|guilds\/\d+\/users\/\d+\/avatars\/)/i.test(av)) return;
  if (av && /\/embed\/avatars\//i.test(av)) return;
  /* organicoAvatarOutSync1: senza avatar non è “ok” — altrimenti blocca i refetch */
  if (!av) return;
  if (identityOkCache.size > 5000) {
    const first = identityOkCache.keys().next().value;
    if (first) identityOkCache.delete(first);
  }
  identityOkCache.set(uid, { exp: Date.now() + IDENTITY_OK_TTL_MS, id: { ...id, userId: uid } });
}

function isRateLimitError(err?) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.httpStatus ?? err?.rawError?.status);
  if (status === 429) return true;
  return /rate.?limit|too many requests/i.test(String(err?.message || err || ""));
}

function retryAfterMs(err?) {
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

async function fetchDiscordUserFresh(client?, userId?) {
  const uid = String(userId || "").trim();
  if (!client || !isDiscordSnowflake(uid)) return null;
  if (typeof client.users?.fetch !== "function") return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      /* organicoAvatarHeal1: force — evita hash avatar stale nella cache d.js */
      return await client.users.fetch(uid, { force: true });
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

async function resolveWebUserIdentity(client?, guild?, userId?, opts: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!isDiscordSnowflake(uid)) return identityFallback(uid);

  const preferFreshUser = Boolean(opts.preferFreshUser);
  if (!preferFreshUser) {
    const warm = readIdentityOkCache(uid);
    /* organicoLiveAvatar1: cache senza avatar non è “ok” — rifetch (depexed con foto live) */
    if (warm && String(warm.avatarUrl || "").trim()) return warm;
  }

  if (!opts.skipGuildMember) {
    const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
    if (member) {
      const id = identityFromMember(member);
      const out = {
        userId: uid,
        displayName: safeDisplayLabel(id.displayName, uid),
        username: id.username || "",
        avatarUrl: id.avatarUrl || "",
      };
      writeIdentityOkCache(out);
      return out;
    }
  }

  let user = null;
  if (!preferFreshUser) {
    user = client?.users?.cache?.get?.(uid) || null;
  }
  if (!user && client) {
    user = preferFreshUser
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

async function resolveWebUserIdentitiesBatch(client?, guild?, userIds?, opts: Record<string, any> = {}) {
  const batchSize = Math.max(1, Number(opts.batchSize) || DEFAULT_BATCH);
  const cap = Math.max(1, Number(opts.cap) || DEFAULT_CAP);
  const budgetMs = Math.max(250, Number(opts.budgetMs) || DEFAULT_BUDGET_MS);
  const paceMs = Math.max(0, Number(opts.paceMs) || 0);
  const cacheOnly = Boolean(opts.cacheOnly);
  const fillFallback = opts.fillFallback !== false && !cacheOnly;
  const preferFreshUser = Boolean(opts.preferFreshUser);
  const unique = [...new Set((userIds || []).map((x?) => String(x || "").trim()).filter(isDiscordSnowflake))];
  const out = new Map();
  const missing = [];

  for (const uid of unique) {
    if (!preferFreshUser) {
      const warm = readIdentityOkCache(uid);
      if (warm && String(warm.avatarUrl || "").trim()) {
        out.set(uid, warm);
        continue;
      }
    }
    const member = guild?.members?.cache?.get?.(uid);
    if (member) {
      const id = identityFromMember(member);
      const resolved = {
        userId: uid,
        displayName: safeDisplayLabel(id.displayName, uid),
        username: id.username || "",
        avatarUrl: id.avatarUrl || "",
      };
      writeIdentityOkCache(resolved);
      out.set(uid, resolved);
      continue;
    }
    if (!preferFreshUser) {
      const cachedUser = client?.users?.cache?.get?.(uid);
      if (cachedUser) {
        const resolved = identityFromUser(cachedUser, uid);
        writeIdentityOkCache(resolved);
        out.set(uid, resolved);
        continue;
      }
    }
    missing.push(uid);
  }

  if (!cacheOnly) {
    const toFetch = missing.slice(0, cap);
    const t0 = Date.now();
    for (let i = 0; i < toFetch.length; i += batchSize) {
      if (Date.now() - t0 > budgetMs) break;
      const chunk = toFetch.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (uid?) => {
          const id = await resolveWebUserIdentity(client, guild, uid, {
            // Default: allow guild cache/member. Callers that fear member storms pass skipGuildMember:true.
            skipGuildMember: Boolean(opts.skipGuildMember),
            preferFreshUser,
          });
          out.set(uid, id);
        }),
      );
      if (paceMs && i + batchSize < toFetch.length) await sleep(paceMs);
    }
  }

  if (fillFallback) {
    for (const uid of missing) {
      if (!out.has(uid)) out.set(uid, identityFallback(uid));
    }
  }
  return out;
}

export = {
  FALLBACK_LABEL,
  isDiscordSnowflake,
  isSnowflakeLabel,
  safeDisplayLabel,
  identityFallback,
  resolveWebUserIdentity,
  resolveWebUserIdentitiesBatch,
};
