const crypto = require("crypto");
const IDs = require("../Config/ids");
const {
  resolveWebsiteCandidatureMember,
  memberHasCandidatureReviewAccess,
} = require("../../Events/interaction/candidatureApplicationHandlers");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
  memberCanReviewAppelli,
  memberHasDirectorRole,
} = require("../Staff/staffRoleHierarchy");
const { memberIsResocontoPmReviewer } = require("../Ticket/ticketPartnershipStaffRoles");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity");

const ACCESS_CACHE_TTL_MS = 600_000;
const ACCESS_CACHE_MAX = 400;
const accessCache = new Map();
const accessInflight = new Map();
const STAFF_ACCESS_CACHE_MARKER = "staffAccessCache1";

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function accessCacheKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 40);
}

function pruneAccessCache() {
  const now = Date.now();
  for (const [key, entry] of accessCache) {
    if (!entry || Number(entry.exp || 0) <= now) accessCache.delete(key);
  }
  if (accessCache.size <= ACCESS_CACHE_MAX) return;
  const keys = [...accessCache.keys()];
  for (let i = 0; i < keys.length - ACCESS_CACHE_MAX; i += 1) {
    accessCache.delete(keys[i]);
  }
}

function readCachedAccess(token) {
  const key = accessCacheKey(token);
  const entry = accessCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    accessCache.delete(key);
    return null;
  }
  return entry;
}

function writeCachedAccess(token, payload) {
  pruneAccessCache();
  accessCache.set(accessCacheKey(token), {
    ...payload,
    exp: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

const TRANSIENT_ACCESS_ERRORS = new Set([
  "discord_unreachable",
  "guild_unavailable",
  "member_fetch_failed",
  "member_unavailable",
  "misconfigured",
  "upstream",
  "timeout",
  "internal",
]);

function isTransientAccessDeny(entry) {
  if (!entry || entry.ok !== false) return false;
  const st = Number(entry.status) || 0;
  if (st >= 500 || st === 429 || st === 408) return true;
  const err = String(entry.error || "").trim().toLowerCase();
  return TRANSIENT_ACCESS_ERRORS.has(err);
}

function shouldNegativeCacheAccessDeny(entry) {
  if (!entry || entry.ok !== false) return false;
  if (isTransientAccessDeny(entry)) return false;
  const err = String(entry.error || "").trim().toLowerCase();
    if (err === "invalid_token" || err === "missing_token") return false;
  if (err === "not_in_guild" || err === "forbidden") {
    return true;
  }
  const st = Number(entry.status) || 0;
  return st === 403;
}

function memberHasMainServerStaffAccess(member) {
  if (!member) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles.Staff || "").trim();
  if (staffRoleId && member.roles?.cache?.has?.(staffRoleId)) return true;
  return false;
}

function buildCachedStaffMember(guild, cached) {
  const userId = String(cached?.userId || "").trim();
  const roleIds = Array.isArray(cached?.roleIds) ? cached.roleIds.map(String).filter(Boolean) : [];
  const roleSet = new Set(roleIds);
  const displayName = String(cached?.displayName || cached?.username || "Staff").trim() || "Staff";
  const username = String(cached?.username || "staff").trim() || "staff";
  const avatarHash = String(cached?.avatarHash || "").trim() || null;
  const memberAvatarHash = String(cached?.memberAvatarHash || "").trim() || null;
  const user = {
    id: userId,
    username,
    globalName: displayName,
    avatar: avatarHash,
    displayAvatarURL: (opts = {}) => {
      const size = Number(opts.size) || 128;
      const hash = avatarHash;
      if (hash) {
        const animated = hash.startsWith("a_");
        const ext = opts.extension || (opts.forceStatic ? "png" : animated ? "gif" : "webp");
        return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${size}`;
      }
      return discordDefaultAvatarUrl({ id: userId }, { size });
    },
  };
  return {
    id: userId,
    guild: guild || null,
    avatar: memberAvatarHash,
    displayName,
    displayAvatarURL:
      memberAvatarHash && guild
        ? (opts = {}) => {
            const size = Number(opts.size) || 128;
            const animated = memberAvatarHash.startsWith("a_");
            const ext = opts.extension || (opts.forceStatic ? "png" : animated ? "gif" : "webp");
            return `https://cdn.discordapp.com/guilds/${String(guild.id)}/users/${userId}/avatars/${memberAvatarHash}.${ext}?size=${size}`;
          }
        : undefined,
    user,
    roles: {
      cache: {
        has: (id) => roleSet.has(String(id || "")),
        keys: function* keys() {
          yield* roleSet.values();
        },
        get size() {
          return roleSet.size;
        },
      },
    },
  };
}

function collectMemberAvatarMeta(member) {
  const user = member?.user || null;
  return {
    avatarHash: String(user?.avatar || "").trim() || null,
    memberAvatarHash: String(member?.avatar || "").trim() || null,
  };
}

function collectMemberRoleIds(member) {
  try {
    if (member?.roles?.cache && typeof member.roles.cache.keys === "function") {
      return [...member.roles.cache.keys()].map(String);
    }
  } catch (_) {}
  return [];
}

async function assertWebsiteStaffAccess(client, accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Header Authorization: Bearer <token> richiesto.",
    };
  }

  const cacheKey = accessCacheKey(token);
  const existing = accessInflight.get(cacheKey);
  if (existing) return existing;

  const run = doAssertWebsiteStaffAccess(client, token);
  accessInflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    if (accessInflight.get(cacheKey) === run) accessInflight.delete(cacheKey);
  }
}

async function doAssertWebsiteStaffAccess(client, token) {
  const cached = readCachedAccess(token);
  if (cached && cached.ok === false) {
    if (!isTransientAccessDeny(cached)) {
      return {
        ok: false,
        status: Number(cached.status) || 403,
        error: cached.error || "forbidden",
        message: cached.message || "Accesso negato.",
      };
    }
    accessCache.delete(accessCacheKey(token));
  }

    if (cached && cached.ok === true && cached.userId) {
    const guildId = String(IDs.guilds.main || "").trim();
    const guild = client.guilds.cache.get(guildId) || null;
    if (guild) {
      const cachedMember = guild.members.cache.get(cached.userId) || null;
      if (cachedMember && memberHasMainServerStaffAccess(cachedMember)) {
        const avatars = collectMemberAvatarMeta(cachedMember);
        writeCachedAccess(token, {
          ok: true,
          status: 200,
          userId: String(cachedMember.id),
          roleIds: collectMemberRoleIds(cachedMember),
          displayName: String(
            cachedMember.displayName || cachedMember.user?.globalName || cachedMember.user?.username || "",
          ).trim(),
          username: String(cachedMember.user?.username || "").trim(),
          avatarHash: avatars.avatarHash,
          memberAvatarHash: avatars.memberAvatarHash,
          payload: cached.payload || undefined,
        });
        return { ok: true, member: cachedMember, user: cachedMember.user || null };
      }
      if (Array.isArray(cached.roleIds) && cached.roleIds.length) {
        const synth = buildCachedStaffMember(guild, cached);
        if (memberHasMainServerStaffAccess(synth)) {
          return { ok: true, member: synth, user: synth.user || null };
        }
      }
    } else if (Array.isArray(cached.roleIds) && cached.roleIds.length) {
            const synth = buildCachedStaffMember(null, cached);
      if (memberHasMainServerStaffAccess(synth)) {
        return { ok: true, member: synth, user: synth.user || null };
      }
    }
  }

  const resolved = await resolveWebsiteCandidatureMember(client, token);
  if (!resolved.ok) {
    const deny = {
      ok: false,
      status: Number(resolved.status) || 403,
      error: resolved.error,
      message: resolved.message,
    };
    if (shouldNegativeCacheAccessDeny(deny)) {
      writeCachedAccess(token, deny);
    }
    return deny;
  }

  const member = resolved.member;
  if (!memberHasMainServerStaffAccess(member)) {
    writeCachedAccess(token, {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Questa area è riservata allo staff del server Vinili & Caffè.",
    });
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Questa area è riservata allo staff del server Vinili & Caffè.",
    };
  }

  const avatars = collectMemberAvatarMeta(member);
  writeCachedAccess(token, {
    ok: true,
    status: 200,
    userId: String(member.id),
    roleIds: collectMemberRoleIds(member),
    displayName: String(member.displayName || member.user?.globalName || member.user?.username || "").trim(),
    username: String(member.user?.username || "").trim(),
    avatarHash: avatars.avatarHash,
    memberAvatarHash: avatars.memberAvatarHash,
    payload: (readCachedAccess(token) || {}).payload || undefined,
  });
  return { ok: true, member, user: resolved.user || null };
}

async function handleSiteStaffAccessGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }

    const cached = readCachedAccess(accessToken);
    if (cached && cached.ok === false && !isTransientAccessDeny(cached)) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(Number(cached.status) || 403).json({
        ok: false,
        error: cached.error || "forbidden",
        message: cached.message || "Accesso negato.",
        cached: true,
      });
    }
    if (cached && cached.ok === false && isTransientAccessDeny(cached)) {
      accessCache.delete(accessCacheKey(accessToken));
    }

        if (cached && cached.ok === true && cached.payload) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ...cached.payload, cached: true });
    }

    const out = await assertWebsiteStaffAccess(client, accessToken);
    if (!out.ok) {
      return res.status(out.status).json({
        ok: false,
        error: out.error,
        message: out.message,
      });
    }

    const member = out.member;
    const user = member?.user || out.user;
    const userId = String(member?.id || user?.id || "");
    const avatarUrl =
      userAvatarUrlDynamic(member, { size: 128 }) ||
      userAvatarUrlDynamic(user, { size: 128 }) ||
      discordDefaultAvatarUrl(user || { id: userId }, { size: 128 });
    const isHighStaff = memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
    const pmRole = String(IDs.roles.PartnerManager || "").trim();
    const isPm = Boolean(pmRole && member?.roles?.cache?.has?.(pmRole));
    const isPmGestore = memberIsResocontoPmReviewer(member);
    const canManagePm = Boolean(isHighStaff || isPmGestore);
    const candidatureReview = memberHasCandidatureReviewAccess(member, member?.guild || null);
    const appelliReview = memberCanReviewAppelli(member);
    const isDirector = memberHasDirectorRole(member);

    const payload = {
      ok: true,
      canManage: isHighStaff,
      isHighStaff,
      isPm,
      isPmGestore,
      canManagePm,
      canViewPmPointsRemoved: Boolean(isHighStaff || isPm || isPmGestore),
      canReviewPmPointsRemoved: Boolean(isHighStaff || isPmGestore),
      candidatureReview,
      appelliReview,
      director: isDirector,
      permissions: {
        staff: true,
        highStaff: isHighStaff,
        canManage: isHighStaff,
        isPm,
        isPmGestore,
        canManagePm,
        canViewPmPointsRemoved: Boolean(isHighStaff || isPm || isPmGestore),
        canReviewPmPointsRemoved: Boolean(isHighStaff || isPmGestore),
        candidatureReview,
        appelliReview,
        director: isDirector,
      },
      identity: {
        userId,
        displayName:
          String(member?.displayName || user?.globalName || user?.username || "Staff").trim() || "Staff",
        username: accountUsername(user) || "",
        avatarUrl,
      },
    };
    const prev = readCachedAccess(accessToken) || {};
    const roleIds = collectMemberRoleIds(member);
    writeCachedAccess(accessToken, {
      ok: true,
      status: 200,
      userId,
      roleIds: roleIds.length ? roleIds : Array.isArray(prev.roleIds) ? prev.roleIds : [],
      displayName: String(member?.displayName || user?.globalName || user?.username || prev.displayName || "").trim(),
      username: String(user?.username || prev.username || "").trim(),
      payload,
    });

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffAccessGet,
  assertWebsiteStaffAccess,
  memberHasMainServerStaffAccess,
  normalizeHeaderSecret,
};
