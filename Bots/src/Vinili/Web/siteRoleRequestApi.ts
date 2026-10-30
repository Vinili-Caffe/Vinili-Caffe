const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { CustomRole, SiteDocument, SITE_DOCUMENT_TYPE } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");

const COOLDOWN = SITE_DOCUMENT_TYPE.ROLE_REQUEST_COOLDOWN;
const { createSiteRoleJoinRequest } = require("../Events/interaction/customRoleHandlers") as typeof import("../Events/interaction/customRoleHandlers");
const { isArchivedEventRoleId } = require("../Utils/Community/userCustomRoleFilter") as typeof import("../Utils/Community/userCustomRoleFilter");
const { collectBlockedSystemRoleIds, isListableUserCustomRole } = require("../Utils/Community/userCustomRoleFilter") as typeof import("../Utils/Community/userCustomRoleFilter");
const { fetchWebsiteGuildMember, isOnNegativeCache, readCachedWebsiteMember, writeCachedWebsiteMember, ensureWebsiteGuild } = require("../Utils/Web/websiteGuildMemberFetch") as typeof import("../Utils/Web/websiteGuildMemberFetch");
const { DISCORD_OAUTH_UA, fetchDiscordOAuthMe } = require("../Utils/Web/discordOauthMe") as typeof import("../Utils/Web/discordOauthMe");

const ROLE_REQUEST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const BLOCKED_ROLE_IDS = collectBlockedSystemRoleIds();
const RESOLVE_MEMBER_TTL_MS = 5 * 60_000;
const resolveMemberCache = new Map();
const resolveMemberInflight = new Map();
const OAUTH_GUILD_MEMBER_TTL_MS = 90_000;
const OAUTH_GUILD_MEMBER_NEG_TTL_MS = 20_000;
const oauthGuildMemberCache = new Map();
const oauthGuildMemberInflight = new Map();

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function resolveMemberCacheKey(token?) {
  return `${String(token || "").length}:${String(token || "").slice(-20)}`;
}

function oauthGuildMemberCacheKey(token?, guildId?) {
  return `${String(guildId || "")}:${String(token || "").length}:${String(token || "").slice(-24)}`;
}

async function fetchDiscordMeFast(accessToken?, timeoutMs = 4500) {
  const out = await fetchDiscordOAuthMe(accessToken, { timeoutMs: Math.max(800, Number(timeoutMs) || 4500) });
  return {
    ok: Boolean(out.ok),
    status: Number(out.status) || (out.ok ? 200 : 502),
    error: out.error || null,
    async json() {
      return out.me;
    },
  };
}

async function fetchOAuthGuildMemberFast(accessToken?, guildId?, timeoutMs = 3500) {
  const token = String(accessToken || "").trim();
  const gid = String(guildId || "").trim();
  if (!token || !gid) {
    return { json: null, notInGuild: false, unreachable: true };
  }
  const cacheKey = oauthGuildMemberCacheKey(token, gid);
  const now = Date.now();
  const cached = oauthGuildMemberCache.get(cacheKey);
  if (cached && Number(cached.exp || 0) > now) {
    return cached.value;
  }
  if (oauthGuildMemberInflight.has(cacheKey)) {
    return oauthGuildMemberInflight.get(cacheKey);
  }

  const work = (async () => {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        ctrl?.abort?.();
      } catch (_) {}
    }, Math.max(600, Number(timeoutMs) || 3500));
    try {
      const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${gid}/member`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": DISCORD_OAUTH_UA,
        },
        signal: ctrl ? ctrl.signal : undefined,
      });
      let value;
      if (res.status === 404) value = { json: null, notInGuild: true, unreachable: false };
      else if (!res.ok) value = { json: null, notInGuild: false, unreachable: res.status >= 500 };
      else {
        const json = await res.json().catch(() => null);
        value = { json: json || null, notInGuild: false, unreachable: !json };
      }
      const ttl = value.unreachable
        ? 0
        : value.notInGuild
          ? OAUTH_GUILD_MEMBER_NEG_TTL_MS
          : OAUTH_GUILD_MEMBER_TTL_MS;
      if (ttl > 0) {
        oauthGuildMemberCache.set(cacheKey, { value, exp: Date.now() + ttl });
        if (oauthGuildMemberCache.size > 600) {
          const cutoff = Date.now();
          for (const [k, v] of oauthGuildMemberCache) {
            if (!v || Number(v.exp || 0) <= cutoff) oauthGuildMemberCache.delete(k);
          }
        }
      }
      return value;
    } catch (_) {
      return { json: null, notInGuild: false, unreachable: true };
    } finally {
      clearTimeout(timer);
    }
  })();

  oauthGuildMemberInflight.set(cacheKey, work);
  work.finally(() => {
    if (oauthGuildMemberInflight.get(cacheKey) === work) oauthGuildMemberInflight.delete(cacheKey);
  }).catch(() => {});
  return work;
}

function synthMemberFromOAuth(guild?, meJson?, oauthMember?) {
  const userId = String(meJson?.id || oauthMember?.user?.id || "").trim();
  if (!userId) return null;
  const roleIds = Array.isArray(oauthMember?.roles)
    ? oauthMember.roles.map(String).filter(Boolean)
    : [];
  const mapLike = {
    has: (id?) => roleIds.includes(String(id)),
    get: (id?) => (roleIds.includes(String(id)) ? { id: String(id) } : undefined),
    keys: () => roleIds[Symbol.iterator](),
    values: () => roleIds.map((id?) => ({ id }))[Symbol.iterator](),
    entries: () => roleIds.map((id?) => [id, { id }])[Symbol.iterator](),
    forEach: (fn?) => {
      for (const id of roleIds) fn({ id }, id, mapLike);
    },
    get size() {
      return roleIds.length;
    },
    [Symbol.iterator]: () => roleIds.map((id?) => [id, { id }])[Symbol.iterator](),
  };
  const displayName =
    String(oauthMember?.nick || meJson?.global_name || meJson?.username || "Utente").trim() || "Utente";
  return {
    id: userId,
    user: {
      id: userId,
      username: String(meJson?.username || "").trim(),
      globalName: String(meJson?.global_name || "").trim(),
      avatar: meJson?.avatar || null,
      bot: false,
    },
    guild: guild || null,
    displayName,
    nickname: oauthMember?.nick || null,
    roles: { cache: mapLike },
    permissions: { has: () => false },
    _vcFromOAuth: true,
  };
}

function isExpired(doc?) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now();
}

function sanitizeReason(value?) {
  return String(value || "").trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, 500);
}

function formatDateTimeIt(value?) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
}

async function resolveWebsiteGuildMember(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante: effettua il login." };
  }

  const cacheKey = resolveMemberCacheKey(token);
  const cached = resolveMemberCache.get(cacheKey);
  if (cached && Number(cached.exp || 0) > Date.now() && cached.value) {
    return cached.value;
  }
  if (resolveMemberInflight.has(cacheKey)) {
    return resolveMemberInflight.get(cacheKey);
  }

  const work = (async () => {
    // mobileApisFast2: OAuth-first (short), never 8s+18s Discord bot retry — that killed tickets/candidature on phones.
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
    }

    const oauthPromise = fetchOAuthGuildMemberFast(token, guildId, 3500);
    let meJson;
    try {
      const meRes = await fetchDiscordMeFast(token, 4500);
      if (!meRes.ok) {
        if (meRes.status === 401 || meRes.error === "invalid_token") {
          return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta: effettua di nuovo il login." };
        }
        return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord in questo momento." };
      }
      meJson = await meRes.json();
    } catch {
      return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord in questo momento." };
    }

    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }

    const guild =
      (await ensureWebsiteGuild(client, guildId, 3000).catch(() => null)) ||
      client.guilds.cache.get(guildId) ||
      null;
    if (!guild) {
      return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
    }

    let member =
      guild.members.cache.get(userId) ||
      readCachedWebsiteMember(userId) ||
      null;

    const oauth = await oauthPromise;
    /* ticketStaffRolesOauth2: OAuth-first sui ruoli (cache Discord spesso incompleta/timeout → staffAccess false + toast) */
    if (oauth.json) {
      member = synthMemberFromOAuth(guild, meJson, oauth.json);
    } else if (!member && !oauth.notInGuild) {
      member = await fetchWebsiteGuildMember(guild, userId, {
        timeoutMs: 2000,
        retry: false,
        soft: true,
      }).catch(() => null);
    }

    if (!member) {
      if (oauth.notInGuild || isOnNegativeCache(userId)) {
        return {
          ok: false,
          status: 403,
          error: "not_in_guild",
          message: "Per richiedere un ruolo / usare i ticket devi essere presente nel server Discord.",
        };
      }
      return {
        ok: false,
        status: 503,
        error: "member_unavailable",
        message: "Discord non risponde: riprova tra pochi secondi.",
      };
    }

    if (!member._vcFromOAuth) {
      writeCachedWebsiteMember(userId, member);
    }

    const okPayload = { ok: true, status: 200, guild, member, userId, discordUser: meJson || null };
    resolveMemberCache.set(cacheKey, { exp: Date.now() + RESOLVE_MEMBER_TTL_MS, value: okPayload });
    if (resolveMemberCache.size > 400) {
      const first = resolveMemberCache.keys().next().value;
      if (first) resolveMemberCache.delete(first);
    }
    return okPayload;
  })();

  resolveMemberInflight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    resolveMemberInflight.delete(cacheKey);
  }
}

async function submitSiteRoleRequest(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const roleId = String(payload?.roleId || "").trim();
  const reason = sanitizeReason(payload?.reason);

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  if (!/^\d{17,22}$/.test(roleId)) {
    return { ok: false, status: 400, error: "invalid_role", message: "Ruolo richiesto non valido." };
  }
  if (isArchivedEventRoleId(roleId) || BLOCKED_ROLE_IDS.has(roleId)) {
    return {
      ok: false,
      status: 400,
      error: "system_role",
      message: "Questo non è un ruolo personalizzato creato da un utente.",
    };
  }
  if (reason.length < 10) {
    return { ok: false, status: 400, error: "reason_too_short", message: "Scrivi una motivazione di almeno 10 caratteri." };
  }

  const doc = await CustomRole.findOne({
    guildId: resolved.guild.id,
    $or: [{ roleId }, { secondaryRoleId: roleId }],
  }).lean().catch(() => null);
  const ownsRequested =
    String(doc?.roleId || "") === roleId || String(doc?.secondaryRoleId || "") === roleId;
  if (!ownsRequested || isExpired(doc)) {
    return { ok: false, status: 404, error: "role_unavailable", message: "Questo ruolo custom non è più disponibile." };
  }

  const ownerId = String(doc.userId || "").trim();
  if (!/^\d{17,22}$/.test(ownerId)) {
    return { ok: false, status: 404, error: "owner_missing", message: "Non trovo più il proprietario di questo ruolo." };
  }
  if (ownerId === resolved.userId) {
    return { ok: false, status: 400, error: "self_request", message: "Sei già il proprietario di questo ruolo." };
  }

  const role = resolved.guild.roles.cache.get(roleId) || (await resolved.guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { ok: false, status: 404, error: "role_missing", message: "Il ruolo Discord non esiste più." };
  }
  if (!isListableUserCustomRole(role, { blockedRoleIds: BLOCKED_ROLE_IDS })) {
    return {
      ok: false,
      status: 400,
      error: "not_custom_role",
      message: "Puoi richiedere solo ruoli personalizzati creati dagli utenti (༄).",
    };
  }
  if (resolved.member.roles.cache.has(role.id)) {
    return { ok: false, status: 409, error: "already_has_role", message: "Hai già questo ruolo." };
  }

  const ownerMember =
    resolved.guild.members.cache.get(ownerId) || (await resolved.guild.members.fetch(ownerId).catch(() => null));
  if (!ownerMember) {
    return { ok: false, status: 404, error: "owner_not_found", message: "Il proprietario del ruolo non è disponibile nel server." };
  }

  const cooldownDoc = await SiteDocument.findOne({
    docType: COOLDOWN,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    roleId: role.id,
  }).lean().catch(() => null);
  const cooldownUntil = cooldownDoc?.cooldownUntil ? new Date(cooldownDoc.cooldownUntil) : null;
  if (cooldownUntil && Number.isFinite(cooldownUntil.getTime()) && cooldownUntil.getTime() > Date.now()) {
    return {
      ok: false,
      status: 429,
      error: "cooldown_active",
      message: `Hai già inviato una richiesta per questo ruolo di recente. Potrai inviarne una nuova dal ${formatDateTimeIt(cooldownUntil)}.`,
      cooldownUntil: cooldownUntil.toISOString(),
    };
  }

  await Promise.allSettled([
    resolved.guild.members.fetch(resolved.userId).catch(() => null),
    resolved.guild.members.fetch(ownerId).catch(() => null),
    resolved.guild.roles.fetch(role.id).catch(() => null),
  ]);

  const out = await createSiteRoleJoinRequest({
    client,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    ownerId,
    roleId: role.id,
    reason,
    timeoutMs: 3 * 24 * 60 * 60 * 1000,
  });

  if (!out?.ok) {
    if (out?.error === "dm_closed") {
      return {
        ok: false,
        status: 409,
        error: "owner_dm_closed",
        message: "Il proprietario del ruolo ha i DM chiusi: non posso inviargli la richiesta.",
      };
    }
    if (out?.error === "already_pending") {
      return {
        ok: false,
        status: 409,
        error: "already_pending",
        message: "Hai già una richiesta in attesa per questo ruolo.",
      };
    }
    if (out?.error === "owner_not_found") {
      return {
        ok: false,
        status: 404,
        error: "owner_not_found",
        message: "Il proprietario del ruolo non è più disponibile nel server.",
      };
    }
    if (out?.error === "requester_not_found") {
      return {
        ok: false,
        status: 403,
        error: "requester_not_found",
        message: "Non riesco a trovarti nel server Discord. Rientra nel server e riprova.",
      };
    }
    if (out?.error === "role_missing") {
      return {
        ok: false,
        status: 404,
        error: "role_missing",
        message: "Il ruolo Discord non esiste più.",
      };
    }
    if (out?.error === "guild_unavailable") {
      return {
        ok: false,
        status: 503,
        error: "guild_unavailable",
        message: "Server Discord temporaneamente non disponibile. Riprova tra poco.",
      };
    }
    if (out?.error === "invalid_context") {
      return {
        ok: false,
        status: 503,
        error: "invalid_context",
        message: "Non riesco a preparare la richiesta in questo momento. Riprova tra qualche secondo.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: "request_failed",
      message: "Non sono riuscito a inoltrare la richiesta all'owner del ruolo.",
    };
  }

  const now = new Date();
  const nextAllowedAt = new Date(now.getTime() + ROLE_REQUEST_COOLDOWN_MS);
  await SiteDocument.findOneAndUpdate(
    {
      docType: COOLDOWN,
      guildId: resolved.guild.id,
      requesterId: resolved.userId,
      roleId: role.id,
    },
    {
      $set: {
        ownerId,
        lastRequestedAt: now,
        cooldownUntil: nextAllowedAt,
      },
      $setOnInsert: {
        docType: COOLDOWN,
        guildId: resolved.guild.id,
        requesterId: resolved.userId,
        roleId: role.id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    status: 200,
    message: "Richiesta inviata in DM al proprietario del ruolo. Potrai inviarne una nuova per questo ruolo tra 7 giorni.",
    cooldownUntil: nextAllowedAt.toISOString(),
  };
}

async function leaveSiteRole(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const roleId = String(payload?.roleId || "").trim();

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  if (!/^\d{17,22}$/.test(roleId)) {
    return { ok: false, status: 400, error: "invalid_role", message: "Ruolo non valido." };
  }
  if (isArchivedEventRoleId(roleId) || BLOCKED_ROLE_IDS.has(roleId)) {
    return {
      ok: false,
      status: 400,
      error: "system_role",
      message: "Questo non è un ruolo personalizzato creato da un utente.",
    };
  }

  const doc = await CustomRole.findOne({
    guildId: resolved.guild.id,
    $or: [{ roleId }, { secondaryRoleId: roleId }],
  })
    .lean()
    .catch(() => null);
  const ownsRequested =
    String(doc?.roleId || "") === roleId || String(doc?.secondaryRoleId || "") === roleId;
  if (!ownsRequested || isExpired(doc)) {
    return { ok: false, status: 404, error: "role_unavailable", message: "Questo ruolo custom non è più disponibile." };
  }

  const ownerId = String(doc.userId || "").trim();
  if (ownerId === resolved.userId) {
    return {
      ok: false,
      status: 400,
      error: "owner_cannot_leave",
      message: "Sei il creatore di questo ruolo: non puoi togliertelo da qui.",
    };
  }

  const role =
    resolved.guild.roles.cache.get(roleId) || (await resolved.guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { ok: false, status: 404, error: "role_missing", message: "Il ruolo Discord non esiste più." };
  }
  if (!isListableUserCustomRole(role, { blockedRoleIds: BLOCKED_ROLE_IDS })) {
    return {
      ok: false,
      status: 400,
      error: "not_custom_role",
      message: "Puoi lasciarti solo ruoli personalizzati creati dagli utenti.",
    };
  }

  if (!resolved.member.roles.cache.has(role.id)) {
    return { ok: false, status: 409, error: "not_member", message: "Non hai questo ruolo." };
  }

  const removed = await resolved.member.roles
    .remove(role.id, `Custom role self-leave via sito da ${resolved.userId}`)
    .then(() => true)
    .catch(() => false);
  if (!removed) {
    return {
      ok: false,
      status: 500,
      error: "remove_failed",
      message: "Non sono riuscito a rimuovere il ruolo. Riprova tra poco.",
    };
  }

  try {
    const { invalidateSiteRolesCache } = require("./siteRolesApi") as typeof import("./siteRolesApi");
    if (typeof invalidateSiteRolesCache === "function") invalidateSiteRolesCache();
  } catch {
      }

  return {
    ok: true,
    status: 200,
    message: "Ruolo rimosso dal tuo account Discord.",
    roleId: role.id,
  };
}

async function getSiteRoleRequestStates(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const now = Date.now();
  const byRoleId: Record<string, any> = {};

  const pendingDocs = await SiteDocument.find({
    docType: SITE_DOCUMENT_TYPE.ROLE_REQUEST_PENDING,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    expiresAt: { $gt: new Date(now) },
  })
    .select("roleId expiresAt")
    .lean()
    .catch(() => []);

  for (const doc of pendingDocs || []) {
    const roleId = String(doc?.roleId || "").trim();
    if (!/^\d{17,22}$/.test(roleId)) continue;
    const exp = doc?.expiresAt ? new Date(doc.expiresAt) : null;
    byRoleId[roleId] = {
      status: "pending",
      pendingExpiresAt: exp && Number.isFinite(exp.getTime()) ? exp.toISOString() : null,
    };
  }

  const cooldownDocs = await SiteDocument.find({
    docType: COOLDOWN,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    cooldownUntil: { $gt: new Date(now) },
  })
    .select("roleId cooldownUntil")
    .lean()
    .catch(() => []);

  for (const doc of cooldownDocs || []) {
    const roleId = String(doc?.roleId || "").trim();
    if (!/^\d{17,22}$/.test(roleId)) continue;
    const until = doc?.cooldownUntil ? new Date(doc.cooldownUntil) : null;
    if (!until || !Number.isFinite(until.getTime()) || until.getTime() <= now) continue;
    // Pending wins over cooldown for the same role
    if (byRoleId[roleId]?.status === "pending") {
      byRoleId[roleId].cooldownUntil = until.toISOString();
      continue;
    }
    byRoleId[roleId] = {
      status: "cooldown",
      cooldownUntil: until.toISOString(),
    };
  }

  return {
    ok: true,
    status: 200,
    byRoleId,
    serverNow: new Date(now).toISOString(),
  };
}

export = {
  resolveWebsiteGuildMember,
  submitSiteRoleRequest,
  leaveSiteRole,
  getSiteRoleRequestStates,
};