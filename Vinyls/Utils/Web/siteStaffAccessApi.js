const crypto = require("crypto");
const IDs = require("../Config/ids");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
} = require("../Staff/staffRoleHierarchy");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity");

const ACCESS_CACHE_TTL_MS = 90_000;
const ACCESS_CACHE_MAX = 400;
const accessCache = new Map();

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

/** Staff ladder + ruolo ombrello Staff sul main server. */
function memberHasMainServerStaffAccess(member) {
  if (!member) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles.Staff || "").trim();
  if (staffRoleId && member.roles?.cache?.has?.(staffRoleId)) return true;
  return false;
}

/**
 * Assert staff access for staff-area APIs.
 * @returns {Promise<{ ok: true, member: import("discord.js").GuildMember, user: object } | { ok: false, status: number, error: string, message: string }>}
 */
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

  const cached = readCachedAccess(token);
  if (cached && cached.ok === false) {
    return {
      ok: false,
      status: Number(cached.status) || 403,
      error: cached.error || "forbidden",
      message: cached.message || "Accesso negato.",
    };
  }

  // Warm success: skip Discord /users/@me — only re-resolve guild member.
  if (cached && cached.ok === true && cached.userId) {
    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (guild) {
      const member =
        guild.members.cache.get(cached.userId) ||
        (await guild.members.fetch(cached.userId).catch(() => null));
      if (member && memberHasMainServerStaffAccess(member)) {
        return { ok: true, member, user: member.user || null };
      }
    }
  }

  const resolved = await resolveWebsiteCandidatureMember(client, token);
  if (!resolved.ok) {
    writeCachedAccess(token, {
      ok: false,
      status: Number(resolved.status) || 403,
      error: resolved.error,
      message: resolved.message,
    });
    return {
      ok: false,
      status: Number(resolved.status) || 403,
      error: resolved.error,
      message: resolved.message,
    };
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

  writeCachedAccess(token, { ok: true, status: 200, userId: String(member.id) });
  return { ok: true, member, user: resolved.user || null };
}

/**
 * GET Bearer: login Discord + membro main guild + ruolo staff.
 */
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
    if (cached && cached.ok === false) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(Number(cached.status) || 403).json({
        ok: false,
        error: cached.error || "forbidden",
        message: cached.message || "Accesso negato.",
        cached: true,
      });
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

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      canManage: isHighStaff,
      isHighStaff,
      isPm,
      identity: {
        userId,
        displayName:
          String(member?.displayName || user?.globalName || user?.username || "Staff").trim() || "Staff",
        username: accountUsername(user) || "",
        avatarUrl,
      },
    });
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
