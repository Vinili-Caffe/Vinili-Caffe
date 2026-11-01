const crypto = require("crypto") as typeof import("crypto");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  resolveWebsiteCandidatureMember,
  memberHasCandidatureReviewAccess,
} = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
  memberCanReviewAppelli,
  memberHasDirectorRole,
} = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { memberIsResocontoPmReviewer } = require("../tickets/discord/ticketPartnershipStaffRoles") as typeof import("../tickets/discord/ticketPartnershipStaffRoles");
const {
  getResocontoSegmentsForReviewerUserId,
  memberHasResocontoReviewerRole,
} = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const {
  parseViewAsFromReq,
  canUseViewAs,
  applyViewAsToStaffAccessPayload,
  normalizeViewAs,
  applyViewAsToResolvedMember,
  flagsForPreset,
} = require("../../Web/siteViewAsPreview") as typeof import("../../Web/siteViewAsPreview");

const ACCESS_CACHE_TTL_MS = 600_000;
const ACCESS_CACHE_MAX = 400;
const accessCache = new Map();
const accessInflight = new Map();
/* inboxNoDirector1 */
/** Inbox Resoconti: HS / gestore PM / reviewer — non Director, non staff ladder. */
function memberCanViewResocontiInbox(member?) {
  if (!member) return false;
  if (memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS)) return true;
  if (memberHasDirectorRole(member)) return false;
  if (memberIsResocontoPmReviewer(member)) return true;
  if (memberHasResocontoReviewerRole(member)) return true;
  const uid = String(member.id || "").trim();
  if (uid && getResocontoSegmentsForReviewerUserId(uid).length) return true;
  return false;
}

/** Punti tolti inbox: tutti i Partner Manager + HS/gestore — non Director. */
function memberCanViewPmPointsRemovedInbox(member?) {
  if (!member) return false;
  if (memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS)) return true;
  if (memberHasDirectorRole(member)) return false;
  if (memberIsResocontoPmReviewer(member)) return true;
  const pmRole = String(IDs.roles.PartnerManager || "").trim();
  if (pmRole && member?.roles?.cache?.has?.(pmRole)) return true;
  return false;
}

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function accessCacheKey(token?) {
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

function readCachedAccess(token?) {
  const key = accessCacheKey(token);
  const entry = accessCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    accessCache.delete(key);
    return null;
  }
  return entry;
}

function writeCachedAccess(token?, payload?) {
  pruneAccessCache();
  accessCache.set(accessCacheKey(token), {
    ...payload,
    exp: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

const TRANSIENT_ACCESS_ERRORS = new Set([
  "discord_unreachable",
  "discord_timeout",
  "guild_unavailable",
  "member_fetch_failed",
  "member_unavailable",
  "misconfigured",
  "upstream",
  "timeout",
  "internal",
]);

function isTransientAccessDeny(entry?) {
  if (!entry || entry.ok !== false) return false;
  const st = Number(entry.status) || 0;
  if (st >= 500 || st === 429 || st === 408) return true;
  const err = String(entry.error || "").trim().toLowerCase();
  return TRANSIENT_ACCESS_ERRORS.has(err);
}

function shouldNegativeCacheAccessDeny(entry?) {
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

function memberHasMainServerStaffAccess(member?) {
  if (!member) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles.Staff || "").trim();
  if (staffRoleId && member.roles?.cache?.has?.(staffRoleId)) return true;
  return false;
}

/** Compiti + Confessionale: High Staff oppure Helper/Mod/Senior/Director. Solo-PM esclusi (PM+staff ok). */
function memberCanUseOpsStaffPages(member?) {
  if (!member) return false;
  if (memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS)) return true;
  return memberHasAnyRoleKey(member, ["Helper", "Mod", "SeniorModerator", "Director"]);
}

function buildCachedStaffMember(guild?, cached?) {
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
    displayAvatarURL: (opts: Record<string, any> = {}) => {
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
        ? (opts: Record<string, any> = {}) => {
            const size = Number(opts.size) || 128;
            const animated = memberAvatarHash.startsWith("a_");
            const ext = opts.extension || (opts.forceStatic ? "png" : animated ? "gif" : "webp");
            return `https://cdn.discordapp.com/guilds/${String(guild.id)}/users/${userId}/avatars/${memberAvatarHash}.${ext}?size=${size}`;
          }
        : undefined,
    user,
    roles: {
      cache: {
        has: (id?) => roleSet.has(String(id || "")),
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

function collectMemberAvatarMeta(member?) {
  const user = member?.user || null;
  return {
    avatarHash: String(user?.avatar || "").trim() || null,
    memberAvatarHash: String(member?.avatar || "").trim() || null,
  };
}

function collectMemberRoleIds(member?) {
  try {
    if (member?.roles?.cache && typeof member.roles.cache.keys === "function") {
      return [...member.roles.cache.keys()].map(String);
    }
  } catch (_) {}
  return [];
}

async function assertWebsiteStaffAccess(client?, accessToken?, opts: Record<string, any> = {}) {
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
  const run = existing || doAssertWebsiteStaffAccess(client, token);
  if (!existing) accessInflight.set(cacheKey, run);
  let out;
  try {
    out = await run;
  } finally {
    if (accessInflight.get(cacheKey) === run) accessInflight.delete(cacheKey);
  }

  /* viewAsRoleHard1: remap / deny after real staff assert so preview never keeps Founder powers. */
  const viewAs = normalizeViewAs(opts.viewAs || (opts.req ? parseViewAsFromReq(opts.req) : ""));
  if (!out?.ok || !viewAs || !out.member) return out;
  if (!canUseViewAs(out.member, { userId: out.member.id })) return out;

  const remapped = applyViewAsToResolvedMember(out.member, viewAs, { userId: out.member.id });
  if (remapped.denied) {
    return {
      ok: false,
      status: 403,
      error: "view_as_preview",
      message: `Preview (${viewAs}): area staff non disponibile.`,
      viewAs,
      viewAsActive: true,
    };
  }
  return {
    ...out,
    member: remapped.member,
    viewAs,
    viewAsActive: true,
    viewAsFlags: remapped.flags || flagsForPreset(viewAs),
  };
}

async function doAssertWebsiteStaffAccess(client?, token?) {
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
      if (cachedMember) {
        if (memberHasMainServerStaffAccess(cachedMember)) {
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
        // staffCacheLiveDeny1: member live in cache senza staff → niente synth da roleIds stale
        const deny = {
          ok: false,
          status: 403,
          error: "forbidden",
          message: "Questa area è riservata allo staff del server Vinili & Caffè.",
        };
        writeCachedAccess(token, deny);
        return deny;
      }
      // Member non in cache: non fidarsi dei roleIds vecchi — riresolve sotto.
    }
    // guild offline / member missing: fall through to full resolve (no synth privilege)
  }

  const resolved: any = await resolveWebsiteCandidatureMember(client, token);
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

function respondStaffAccessPayload(res?, realPayload?, req?, member?, extra: Record<string, any> = {}) {
  const viewAs: any = parseViewAsFromReq(req);
  const out = applyViewAsToStaffAccessPayload(
    { ...realPayload, ...(extra || {}) },
    viewAs,
    member || {
      id: String(extra.userId || realPayload?.identity?.userId || ""),
      roles: {
        cache: {
          has: (id?) => (Array.isArray(extra.roleIds) ? extra.roleIds.map(String).includes(String(id)) : false),
          keys: () => (Array.isArray(extra.roleIds) ? extra.roleIds.map(String) : []),
        },
      },
    },
  );
  /* siteApiW3: ETag/304 on staff-access payload */
  const uid = String(extra.userId || out?.identity?.userId || member?.id || "").trim();
  const rolesKey = Array.isArray(extra.roleIds)
    ? extra.roleIds.map(String).sort().join(",")
    : Array.isArray(out?.roleIds)
      ? out.roleIds.map(String).sort().join(",")
      : "";
  const viewAsKey = viewAs && viewAs.userId ? String(viewAs.userId) : "0";
  const flags = [
    out?.ok ? "1" : "0",
    out?.staff ? "1" : "0",
    out?.highStaff ? "1" : "0",
    out?.canManageStaff ? "1" : "0",
    out?.canReviewCandidature ? "1" : "0",
    out?.canReviewAppelli ? "1" : "0",
  ].join("");
  const etag = `"sa-${uid}-${viewAsKey}-${flags}-${rolesKey.slice(0, 48)}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, no-cache");
  const inm = String(req?.headers?.["if-none-match"] || "").trim();
  if (inm && inm === etag) {
    return res.status(304).end();
  }
  return res.status(200).json(out);
}

async function handleSiteStaffAccessGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      res.setHeader("Cache-Control", "private, no-store");
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
      const stubMember = buildCachedStaffMember(null, cached);
      return respondStaffAccessPayload(res, { ...cached.payload, cached: true }, req, stubMember, {
        userId: cached.userId,
        roleIds: cached.roleIds,
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
    const isPmGestore = memberIsResocontoPmReviewer(member);
    const canManagePm = Boolean(isHighStaff || isPmGestore);
    const candidatureReview = memberHasCandidatureReviewAccess(member, member?.guild || null);
    const appelliReview = memberCanReviewAppelli(member);
    const isDirector = memberHasDirectorRole(member);
    const canViewResoconti = memberCanViewResocontiInbox(member);
    const canViewPmPointsRemoved = memberCanViewPmPointsRemovedInbox(member);
    const canOpsStaff = memberCanUseOpsStaffPages(member);
    const canCompiti = canOpsStaff;
    const canConfessionale = canOpsStaff;
    const founder = canUseViewAs(member);

    const payload = {
      ok: true,
      canManage: isHighStaff,
      isHighStaff,
      isPm,
      isPmGestore,
      canManagePm,
      canCompiti,
      canConfessionale,
      canViewResoconti,
      canViewPmPointsRemoved,
      canReviewPmPointsRemoved: Boolean(isHighStaff || (isPmGestore && !isDirector)),
      candidatureReview,
      appelliReview,
      director: isDirector,
      isFounder: founder,
      viewAsAllowed: founder,
      permissions: {
        staff: true,
        highStaff: isHighStaff,
        canManage: isHighStaff,
        isPm,
        isPmGestore,
        canManagePm,
        canCompiti,
        canConfessionale,
        canViewResoconti,
        canViewPmPointsRemoved,
        canReviewPmPointsRemoved: Boolean(isHighStaff || (isPmGestore && !isDirector)),
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
    // Cache only the real (non view-as) payload.
    writeCachedAccess(accessToken, {
      ok: true,
      status: 200,
      userId,
      roleIds: roleIds.length ? roleIds : Array.isArray(prev.roleIds) ? prev.roleIds : [],
      displayName: String(member?.displayName || user?.globalName || user?.username || prev.displayName || "").trim(),
      username: String(user?.username || prev.username || "").trim(),
      payload,
    });

    return respondStaffAccessPayload(res, payload, req, member, { userId, roleIds });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffAccessGet,
  assertWebsiteStaffAccess,
  memberCanUseOpsStaffPages,
  memberCanViewResocontiInbox,
  normalizeHeaderSecret,
  parseViewAsFromReq,
};
