const { PermissionFlagsBits, Routes } = require("discord.js");
const IDs = require("../Config/ids");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { resolveGuildAccess, listRegisteredGuildIds } = require("../../MultiGuild/core/guildRegistry");
const {
  getPartnershipConfigSync,
  isPartnershipSetupComplete,
  refreshPartnershipConfigCache,
  listConfiguredPartnershipGuildIds,
} = require("../../MultiGuild/core/tenantPartnershipSettings");
const {
  getTenantDashboardRoleIdsSync,
  refreshTenantGuildSettingsCache,
} = require("../../MultiGuild/core/tenantGuildSettings");
const {
  ensureTenantPremiumCacheFresh,
  isTenantPremiumActiveSync,
} = require("../../MultiGuild/core/tenantPremium");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
} = require("../Staff/staffRoleHierarchy");
const { isGuildBotUsageBlacklisted, listBotUsageBlacklist, isUserBotUsageBlacklisted } = require("../../Services/Moderation/botUsageBlacklistService");

const PERM_ADMIN = 0x8n;
const PERM_MANAGE_GUILD = 0x20n;

/**
 * High Staff vero = Founder / Manager / Admin / HighStaff (NON Director).
 * Usato per voce menù + gate URL `/dashboard*` (`GET /access`).
 * Nessun altro percorso (Manage Server, ruoli dashboard tenant) apre la dashboard.
 */
function memberHasDashboardHighStaffAccess(member) {
  return memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
}

function highStaffOnlyDenied() {
  return {
    ok: false,
    status: 403,
    error: "high_staff_only",
    message: "Questa sezione non è disponibile.",
  };
}

function dashboardForbidden(message) {
  return {
    ok: false,
    status: 403,
    error: "forbidden",
    message: message || "Non hai i permessi per gestire questo server dalla dashboard.",
  };
}

function botUsageBlacklistedDenied() {
  return {
    ok: false,
    status: 403,
    error: "bot_usage_blacklisted",
    blacklisted: true,
    message: "Il tuo account è in blacklist e non può usare la dashboard.",
  };
}

async function assertDashboardHighStaffAccess(client, accessToken) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" || resolved.status === 403) {
      return highStaffOnlyDenied();
    }
    return resolved;
  }
  if (await isUserBotUsageBlacklisted(resolved.userId).catch(() => false)) {
    return botUsageBlacklistedDenied();
  }
  if (!memberHasDashboardHighStaffAccess(resolved.member)) {
    return highStaffOnlyDenied();
  }
  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    member: resolved.member,
    guild: resolved.guild,
  };
}

function botDevOnlyDenied() {
  return {
    ok: false,
    status: 403,
    error: "bot_dev_only",
    message: "Solo i developer del bot possono usare questa sezione.",
  };
}

function isDashboardBotDevUser(client, userId) {
  try {
    const { getDevIds } = require("../Moderation/commandPermissions");
    return getDevIds(client).includes(String(userId || "").trim());
  } catch {
    return false;
  }
}

/** Soft: auth errors propagate; non-dev → botDev:false. */
async function resolveDashboardBotDevFlag(client, accessToken) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" || resolved.status === 403) {
      return { ok: true, status: 200, botDev: false, userId: null };
    }
    return resolved;
  }
  return {
    ok: true,
    status: 200,
    botDev: isDashboardBotDevUser(client, resolved.userId),
    userId: resolved.userId,
  };
}

async function assertDashboardBotDevAccess(client, accessToken) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" || resolved.status === 403) {
      return botDevOnlyDenied();
    }
    return resolved;
  }
  if (!isDashboardBotDevUser(client, resolved.userId)) {
    return botDevOnlyDenied();
  }
  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    member: resolved.member,
    guild: resolved.guild,
  };
}

/** Soft check: auth errors propagate; “non staff” → highStaff:false. */
async function resolveDashboardHighStaffFlag(client, accessToken) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" || resolved.status === 403) {
      return { ok: true, status: 200, highStaff: false };
    }
    return resolved;
  }
  return {
    ok: true,
    status: 200,
    highStaff: memberHasDashboardHighStaffAccess(resolved.member),
    userId: resolved.userId,
    member: resolved.member,
    guild: resolved.guild,
  };
}

async function guildMemberHasAnyRole(client, guildId, userId, roleIds) {
  const ids = Array.isArray(roleIds)
    ? roleIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return false;
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  try {
    const guild =
      client?.guilds?.cache?.get?.(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
    if (guild?.members?.fetch) {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member?.roles?.cache) {
        return ids.some((rid) => member.roles.cache.has(rid));
      }
      if (member) return false;
    }
  } catch (_) {}
  try {
    const rest = client?._rest || client?.rest;
    if (!rest) return false;
    const raw = await rest.get(Routes.guildMember(gid, uid));
    const roles = new Set(Array.isArray(raw?.roles) ? raw.roles.map(String) : []);
    return ids.some((rid) => roles.has(rid));
  } catch {
    return false;
  }
}

async function guildMemberHasRole(client, guildId, userId, roleId) {
  return guildMemberHasAnyRole(client, guildId, userId, [roleId]);
}

function hasManageServerPermission(permissions, owner = false) {
  if (owner === true) return true;
  try {
    const perms = BigInt(permissions ?? 0);
    return (perms & PERM_ADMIN) === PERM_ADMIN || (perms & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
  } catch {
    return false;
  }
}

function permissionBitsFromRole(role) {
  const p = role?.permissions;
  if (p == null) return 0n;
  if (typeof p === "object" && p.bitfield != null) {
    try {
      return BigInt(p.bitfield);
    } catch {
      return 0n;
    }
  }
  try {
    return BigInt(p);
  } catch {
    return 0n;
  }
}

/**
 * Fallback quando OAuth `/users/@me/guilds` è incompleto (cap 200) o non espone i bit.
 * Proprietario / Administrator / Manage Server via REST del bot.
 */
async function userHasGuildManageAccessViaBot(client, guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !/^\d{17,22}$/.test(gid) || !/^\d{17,22}$/.test(uid)) return false;
  try {
    let guild =
      client?.guilds?.cache?.get?.(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
    if (!guild) return false;
    // Stub da sync guild ids: senza ownerId/members serve hydrate completa.
    if (!guild.ownerId || typeof guild.members?.fetch !== "function") {
      guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
    }
    if (String(guild.ownerId || "") === uid) return true;
    if (typeof guild.members?.fetch !== "function") return false;

    if (typeof guild.roles?.fetch === "function" && (guild.roles.cache?.size || 0) < 2) {
      await guild.roles.fetch().catch(() => null);
    }

    const member =
      guild.members.cache?.get?.(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (!member) return false;

    let bits = 0n;
    const everyone = guild.roles?.cache?.get?.(gid) || guild.roles?.everyone || null;
    bits |= permissionBitsFromRole(everyone);
    for (const role of member.roles?.cache?.values?.() || []) {
      bits |= permissionBitsFromRole(role);
    }
    return (bits & PERM_ADMIN) === PERM_ADMIN || (bits & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
  } catch {
    return false;
  }
}

function oauthRowHasManageAccess(row) {
  return Boolean(row && (row.owner === true || hasManageServerPermission(row.permissions, row.owner === true)));
}

function guildIconUrlFromPartial(guild) {
  const id = String(guild?.id || "").trim();
  if (!id) return null;
  if (typeof guild?.iconURL === "function") {
    const fromMethod = guild.iconURL({ size: 128 });
    if (fromMethod) return String(fromMethod);
  }
  const icon = String(guild?.icon || "").trim();
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=128`;
}

function resolveBotClientId(client) {
  return String(
    client?.user?.id ||
      process.env.DISCORD_CLIENT_ID ||
      process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      IDs?.bots?.ViniliCaffeBot ||
      "",
  ).trim();
}

function buildBotInviteUrl(client, guildId = null) {
  const clientId = resolveBotClientId(client);
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PermissionFlagsBits.Administrator),
    scope: "bot applications.commands",
  });
  const gid = String(guildId || "").trim();
  if (/^\d{17,22}$/.test(gid)) {
    params.set("guild_id", gid);
    params.set("disable_guild_select", "true");
  }
  // Path senza /api/: apre direttamente la UI authorize (con server già selezionato se guild_id).
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

const DISCORD_USER_CACHE_TTL_MS = 60_000;
const DISCORD_GUILDS_CACHE_TTL_MS = 45_000;
const discordUserCache = new Map();
const discordUserInflight = new Map();
const discordGuildsCache = new Map();
const discordGuildsInflight = new Map();

function pruneTokenCache(map, maxSize) {
  if (map.size <= maxSize) return;
  const oldest = map.keys().next().value;
  if (oldest) map.delete(oldest);
}

async function fetchDiscordUser(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante: effettua il login." };
  }

  const now = Date.now();
  const hit = discordUserCache.get(token);
  if (hit && now - hit.at < DISCORD_USER_CACHE_TTL_MS) return hit.payload;
  const pending = discordUserInflight.get(token);
  if (pending) return pending;

  const run = (async () => {
    let meJson;
    try {
      const meRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) {
        return {
          ok: false,
          status: 401,
          error: "invalid_token",
          message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
        };
      }
      meJson = await meRes.json();
    } catch {
      return { ok: false, status: 503, error: "discord_unreachable", message: "Impossibile contattare Discord in questo momento." };
    }
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return {
      ok: true,
      userId,
      username: String(meJson?.global_name || meJson?.username || "").trim() || "Utente",
      avatar: meJson?.avatar || null,
    };
  })();

  discordUserInflight.set(token, run);
  try {
    const payload = await run;
    if (payload?.ok === true) {
      discordUserCache.set(token, { at: Date.now(), payload });
      pruneTokenCache(discordUserCache, 300);
    } else if (payload?.error === "invalid_token") {
      discordUserCache.delete(token);
      discordGuildsCache.delete(token);
    }
    return payload;
  } finally {
    discordUserInflight.delete(token);
  }
}

async function fetchUserGuilds(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Sessione Discord mancante: effettua il login.",
    };
  }

  const now = Date.now();
  const hit = discordGuildsCache.get(token);
  if (hit && now - hit.at < DISCORD_GUILDS_CACHE_TTL_MS) return hit.payload;
  const pending = discordGuildsInflight.get(token);
  if (pending) return pending;

  const run = (async () => {
    let guildsJson;
    try {
      const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        return {
          ok: false,
          status: 401,
          error: "invalid_token",
          message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
        };
      }
      if (res.status === 403) {
        return {
          ok: false,
          status: 403,
          error: "missing_guilds_scope",
          message: "Permesso guilds mancante: effettua di nuovo il login dalla dashboard.",
        };
      }
      if (res.status === 429) {
        // Rate limit: riusa cache stantia se c’è, altrimenti errore soft.
        const stale = discordGuildsCache.get(token);
        if (stale?.payload?.ok) return stale.payload;
        return {
          ok: false,
          status: 503,
          error: "discord_guilds_failed",
          message: "Impossibile recuperare i tuoi server da Discord.",
        };
      }
      if (!res.ok) {
        const stale = discordGuildsCache.get(token);
        if (stale?.payload?.ok) return stale.payload;
        return {
          ok: false,
          status: 503,
          error: "discord_guilds_failed",
          message: "Impossibile recuperare i tuoi server da Discord.",
        };
      }
      guildsJson = await res.json();
    } catch {
      const stale = discordGuildsCache.get(token);
      if (stale?.payload?.ok) return stale.payload;
      return { ok: false, status: 503, error: "discord_unreachable", message: "Impossibile contattare Discord in questo momento." };
    }
    const list = Array.isArray(guildsJson) ? guildsJson : [];
    return { ok: true, guilds: list };
  })();

  discordGuildsInflight.set(token, run);
  try {
    const payload = await run;
    if (payload?.ok === true) {
      discordGuildsCache.set(token, { at: Date.now(), payload });
      pruneTokenCache(discordGuildsCache, 300);
    } else if (payload?.error === "invalid_token") {
      discordGuildsCache.delete(token);
      discordUserCache.delete(token);
    }
    return payload;
  } finally {
    discordGuildsInflight.delete(token);
  }
}

async function fetchUserManageableGuilds(accessToken) {
  const all = await fetchUserGuilds(accessToken);
  if (!all.ok) return all;
  const manageable = all.guilds.filter((row) => oauthRowHasManageAccess(row));
  return { ok: true, guilds: manageable };
}

async function fetchGuildCounts(client, guildId) {
  const rest = client?._rest || client?.rest;
  if (!rest) return { memberCount: null, onlineCount: null };
  try {
    const raw = await rest.get(Routes.guild(String(guildId)), {
      query: new URLSearchParams({ with_counts: "true" }),
    });
    const members = Number(raw?.approximate_member_count ?? raw?.member_count);
    const online = Number(raw?.approximate_presence_count);
    return {
      memberCount: Number.isFinite(members) && members >= 0 ? members : null,
      onlineCount: Number.isFinite(online) && online >= 0 ? online : null,
    };
  } catch {
    return { memberCount: null, onlineCount: null };
  }
}

function buildKnownBotGuildIdSet(client) {
  const ids = new Set();
  try {
    for (const id of client?.guilds?.cache?.keys?.() || []) {
      const gid = String(id || "").trim();
      if (gid) ids.add(gid);
    }
  } catch (_) {}
  try {
    for (const id of listRegisteredGuildIds() || []) {
      const gid = String(id || "").trim();
      if (gid) ids.add(gid);
    }
  } catch (_) {}
  try {
    for (const id of listConfiguredPartnershipGuildIds() || []) {
      const gid = String(id || "").trim();
      if (gid) ids.add(gid);
    }
  } catch (_) {}
  return ids;
}

/** site-api non ha il gateway: senza sync REST la cache guild resta spesso solo sulla main. */
let lastBotGuildSyncAt = 0;
const BOT_GUILD_SYNC_TTL_MS = 45_000;

async function syncKnownBotGuildIdsFromRest(client, opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  if (!force && now - lastBotGuildSyncAt < BOT_GUILD_SYNC_TTL_MS) return;
  const rest = client?._rest;
  const cache = client?.guilds?.cache;
  if (!rest || !cache?.set || !cache?.has) return;

  try {
    let after = "";
    for (let page = 0; page < 25; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (after) query.set("after", after);
      const base =
        typeof Routes.userGuilds === "function" ? Routes.userGuilds() : "/users/@me/guilds";
      const batch = await rest.get(`${base}?${query.toString()}`);
      if (!Array.isArray(batch) || !batch.length) break;
      for (const row of batch) {
        const gid = String(row?.id || "").trim();
        if (!/^\d{17,22}$/.test(gid)) continue;
        if (cache.has(gid)) continue;
        // Stub leggero: basta a botPresent; hydrate completa avviene al bisogno via guilds.fetch.
        cache.set(gid, {
          id: gid,
          name: String(row?.name || "").trim() || gid,
          icon: row?.icon || null,
          partial: true,
          client,
        });
      }
      after = String(batch[batch.length - 1]?.id || "").trim();
      if (!after || batch.length < 200) break;
    }
    lastBotGuildSyncAt = now;
  } catch (err) {
    global.logger?.warn?.("[dashboard] sync bot guild ids failed", err?.message || err);
  }
}

/**
 * @param {{ allowFetch?: boolean }} [opts]
 * allowFetch=false: solo cache/registry/config (lista dashboard, veloce).
 * allowFetch=true: può fare un REST fetch (overview/accesso singolo guild).
 */
async function isBotInGuild(client, guildId, opts = {}) {
  const gid = String(guildId || "").trim();
  if (!gid || !/^\d{17,22}$/.test(gid)) return false;
  if (client?.guilds?.cache?.has?.(gid)) return true;
  // Prima config/registry (il REST client di site-api spesso ha solo la main in cache).
  try {
    const cfg = getPartnershipConfigSync(gid);
    if (cfg?.partnershipsChannelId || cfg?.partnerManagerRoleId || cfg?.setupCompleted) return true;
  } catch (_) {}
  try {
    const access = resolveGuildAccess(gid);
    if (access?.managed) return true;
  } catch (_) {}
  if (opts.allowFetch === false) return false;

  // site-api non riceve guildCreate: il registry in-memory può restare indietro rispetto a `bots`.
  try {
    const { refreshDynamicGuildRowsCache } = require("../../MultiGuild/core/tenantRegistryStore");
    await refreshDynamicGuildRowsCache();
    const accessFresh = resolveGuildAccess(gid);
    if (accessFresh?.managed) return true;
  } catch (_) {}

  // Probe leggero: membership del bot (evita hydrate completo channels/roles).
  try {
    const meId = String(client?.user?.id || "").trim();
    if (client?._rest && /^\d{17,22}$/.test(meId)) {
      await client._rest.get(Routes.guildMember(gid, meId));
      return true;
    }
  } catch (_) {}

  try {
    const guild = await client.guilds.fetch(gid);
    if (guild) return true;
  } catch (_) {}
  return false;
}

async function verifyDashboardGuildAccess(client, accessToken, guildId) {
  const gid = String(guildId || "").trim();
  if (!/^\d{17,22}$/.test(gid)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }

  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;

  if (await isUserBotUsageBlacklisted(user.userId).catch(() => false)) {
    return botUsageBlacklistedDenied();
  }

  await refreshTenantGuildSettingsCache().catch(() => null);

  const botPresent = await isBotInGuild(client, gid);
  const guildsRes = await fetchUserGuilds(accessToken);
  if (!guildsRes.ok) return guildsRes;
  const match = guildsRes.guilds.find((row) => String(row?.id || "") === gid) || null;
  let manageServer = oauthRowHasManageAccess(match);
  if (!manageServer) {
    manageServer = await userHasGuildManageAccessViaBot(client, gid, user.userId);
  }
  // Solo High Staff del main (Founder/Manager/Admin/HighStaff). Niente Manage Server / Director / ruoli tenant.
  const staffFlag = await resolveDashboardHighStaffFlag(client, accessToken);
  if (!staffFlag.ok) return staffFlag;
  if (!staffFlag.highStaff) {
    return highStaffOnlyDenied();
  }

  return {
    ok: true,
    status: 200,
    guildId: gid,
    userId: user.userId,
    guildPartial: match || { id: gid, name: "" },
    botPresent,
    accessVia: "high_staff",
    manageServer,
  };
}

async function userHasAnyDashboardEntry(client, accessToken, _userId) {
  const staffFlag = await resolveDashboardHighStaffFlag(client, accessToken);
  if (!staffFlag.ok) return staffFlag;
  if (staffFlag.highStaff) {
    return { ok: true, status: 200, allowed: true, via: "high_staff" };
  }
  return { ok: true, status: 200, allowed: false, via: null };
}

async function getDashboardAccess(client, accessToken) {
  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;

  if (await isUserBotUsageBlacklisted(user.userId).catch(() => false)) {
    return {
      ok: true,
      status: 200,
      allowed: false,
      blacklisted: true,
    };
  }

  const entry = await userHasAnyDashboardEntry(client, accessToken, user.userId);
  if (!entry.ok) return entry;
  return {
    ok: true,
    status: 200,
    allowed: Boolean(entry.allowed),
    blacklisted: false,
  };
}

const LIST_GUILDS_CACHE_TTL_MS = 8_000;
const listDashboardGuildsCache = new Map();
const listDashboardGuildsInflight = new Map();

async function listDashboardGuilds(client, accessToken) {
  const token = String(accessToken || "").trim();
  const cacheKey = token ? `guilds:${token}` : "";
  const now = Date.now();
  if (cacheKey) {
    const hit = listDashboardGuildsCache.get(cacheKey);
    if (hit && now - hit.at < LIST_GUILDS_CACHE_TTL_MS) {
      return hit.payload;
    }
    const inflight = listDashboardGuildsInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const run = (async () => {
    try {
      return await listDashboardGuildsUncached(client, accessToken);
    } finally {
      if (cacheKey) listDashboardGuildsInflight.delete(cacheKey);
    }
  })();

  if (cacheKey) {
    listDashboardGuildsInflight.set(cacheKey, run);
    run
      .then((payload) => {
        if (payload && payload.ok === true) {
          listDashboardGuildsCache.set(cacheKey, { at: Date.now(), payload });
          if (listDashboardGuildsCache.size > 200) {
            const oldest = listDashboardGuildsCache.keys().next().value;
            if (oldest) listDashboardGuildsCache.delete(oldest);
          }
        }
      })
      .catch(() => null);
  }
  return run;
}

async function listDashboardGuildsUncached(client, accessToken) {
  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;

  if (await isUserBotUsageBlacklisted(user.userId).catch(() => false)) {
    return botUsageBlacklistedDenied();
  }

  const entry = await userHasAnyDashboardEntry(client, accessToken, user.userId);
  if (!entry.ok) return entry;
  if (!entry.allowed) return highStaffOnlyDenied();

  const staffFlag = await resolveDashboardHighStaffFlag(client, accessToken);
  if (!staffFlag.ok) return staffFlag;
  const isHighStaff = staffFlag.highStaff === true;

  const guildsRes = await fetchUserGuilds(accessToken);
  if (!guildsRes.ok) return guildsRes;

  await Promise.all([
    refreshPartnershipConfigCache().catch(() => null),
    refreshTenantGuildSettingsCache().catch(() => null),
    ensureTenantPremiumCacheFresh().catch(() => null),
    syncKnownBotGuildIdsFromRest(client).catch(() => null),
  ]);
  const knownBotGuilds = buildKnownBotGuildIdSet(client);
  const blacklistedGuildIds = new Set(
    (await listBotUsageBlacklist("guilds").catch(() => []))
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean),
  );

  const items = [];
  const seen = new Set();

  for (const row of guildsRes.guilds) {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) continue;
    if (!oauthRowHasManageAccess(row)) continue;
    if (blacklistedGuildIds.has(id)) continue;
    const isProtected = isViniliProtectedGuild(id) || isViniliFullFeatureGuild(id);
    // High Staff: tutti i server gestibili. Altri: solo guild Vinili (bootstrap ruoli) o già noti al bot.
    if (!isHighStaff && !isProtected && !knownBotGuilds.has(id)) continue;
    seen.add(id);
    const isMain = String(IDs.guilds?.main || "").trim() === id;
    items.push({
      id,
      name: String(row?.name || "Server").trim() || "Server",
      iconUrl: guildIconUrlFromPartial(row),
      owner: row?.owner === true,
      botPresent: knownBotGuilds.has(id),
      isMainGuild: isMain,
      isProtectedGuild: isProtected,
      premiumActive: isTenantPremiumActiveSync(id),
    });
  }

  // Ruolo dashboard: server dove l'utente non ha Manage Server ma ha il ruolo configurato.
  for (const row of guildsRes.guilds) {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id) || !knownBotGuilds.has(id)) continue;
    if (blacklistedGuildIds.has(id)) continue;
    const roleIds = getTenantDashboardRoleIdsSync(id);
    if (!roleIds.length) continue;
    const hasRole = await guildMemberHasAnyRole(client, id, user.userId, roleIds);
    if (!hasRole) continue;
    seen.add(id);
    const isProtected = isViniliProtectedGuild(id) || isViniliFullFeatureGuild(id);
    const isMain = String(IDs.guilds?.main || "").trim() === id;
    items.push({
      id,
      name: String(row?.name || "Server").trim() || "Server",
      iconUrl: guildIconUrlFromPartial(row),
      owner: row?.owner === true,
      botPresent: true,
      isMainGuild: isMain,
      isProtectedGuild: isProtected,
      premiumActive: isTenantPremiumActiveSync(id),
    });
  }

  // Principale / Vinili protetti assenti dalla lista OAuth (cap 200): includi se owner/admin via bot.
  const mainId = String(IDs.guilds?.main || "").trim();
  const fallbackIds = new Set();
  if (mainId) fallbackIds.add(mainId);
  for (const id of knownBotGuilds) {
    if (isViniliProtectedGuild(id) || isViniliFullFeatureGuild(id)) fallbackIds.add(id);
  }
  for (const id of fallbackIds) {
    if (seen.has(id)) continue;
    if (blacklistedGuildIds.has(id)) continue;
    if (!(await userHasGuildManageAccessViaBot(client, id, user.userId))) continue;
    seen.add(id);
    const isProtected = isViniliProtectedGuild(id) || isViniliFullFeatureGuild(id);
    const cached = client?.guilds?.cache?.get?.(id);
    const isMain = mainId === id;
    items.push({
      id,
      name: String(cached?.name || (isMain ? "Vinili & Caffè" : "Server")).trim() || "Server",
      iconUrl: guildIconUrlFromPartial(cached || { id }),
      owner: String(cached?.ownerId || "") === user.userId,
      botPresent: true,
      isMainGuild: isMain,
      isProtectedGuild: isProtected,
      premiumActive: isTenantPremiumActiveSync(id),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));

  return {
    ok: true,
    status: 200,
    user: {
      id: user.userId,
      username: user.username,
    },
    guilds: items,
  };
}

function resolveGuildDisplayName(partial, fallbackGuild) {
  const candidates = [
    fallbackGuild?.name,
    partial?.name,
  ];
  for (const raw of candidates) {
    const name = String(raw || "").trim();
    if (!name) continue;
    if (/^server$/i.test(name)) continue;
    return name;
  }
  return "";
}

async function getDashboardGuildOverview(client, accessToken, guildId) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const gid = access.guildId;
  const blacklisted = await isGuildBotUsageBlacklisted(gid).catch(() => false);
  const inviteUrl = blacklisted ? null : buildBotInviteUrl(client, gid);
  const accessInfo = resolveGuildAccess(gid);
  const isProtected = isViniliProtectedGuild(gid) || Boolean(accessInfo?.protected);
  const isMain = String(IDs.guilds?.main || "").trim() === gid;
  const partialName = resolveGuildDisplayName(access.guildPartial, null);

  if (blacklisted || !access.botPresent) {
    return {
      ok: true,
      status: 200,
      guild: {
        id: gid,
        name: partialName,
        iconUrl: guildIconUrlFromPartial(access.guildPartial),
        botPresent: false,
        botUsageBlacklisted: Boolean(blacklisted),
        isMainGuild: isMain,
        isProtectedGuild: isProtected,
        inviteUrl,
      },
      setup: null,
      stats: null,
    };
  }

  const [guild] = await Promise.all([
    Promise.resolve(client.guilds.cache.get(gid)).then(
      (cached) => cached || client.guilds.fetch(gid).catch(() => null),
    ),
    refreshPartnershipConfigCache().catch(() => null),
  ]);
  const partnership = getPartnershipConfigSync(gid);
  const resolvedPartnership = (() => {
    try {
      const { resolvePartnershipConfigSync } = require("../Partner/partnershipConfigResolver");
      return resolvePartnershipConfigSync(gid);
    } catch (_) {
      return null;
    }
  })();
  const setupComplete = isProtected
    ? Boolean(
        resolvedPartnership?.partnershipsChannelId && resolvedPartnership?.partnerManagerRoleId,
      )
    : isPartnershipSetupComplete(partnership);
  const effectivePartnership = resolvedPartnership || partnership;

  let memberCount = null;
  let onlineCount = null;
  if (guild) {
    memberCount = guild.memberCount ?? guild.approximateMemberCount ?? null;
    onlineCount = guild.approximatePresenceCount ?? null;
  }
  // Il client REST del site-api spesso non ha memberCount in cache: forza with_counts.
  if (memberCount == null || onlineCount == null) {
    const counts = await fetchGuildCounts(client, gid);
    if (memberCount == null) memberCount = counts.memberCount;
    if (onlineCount == null) onlineCount = counts.onlineCount;
  }

  return {
    ok: true,
    status: 200,
    guild: {
      id: gid,
      name: resolveGuildDisplayName(access.guildPartial, guild) || partialName,
      iconUrl:
        (typeof guild?.iconURL === "function" ? guild.iconURL({ size: 128 }) : null) ||
        guildIconUrlFromPartial(guild) ||
        guildIconUrlFromPartial(access.guildPartial),
      botPresent: true,
      isMainGuild: isMain,
      isProtectedGuild: isProtected,
      inviteUrl: null,
      memberCount,
      onlineCount,
    },
    access: {
      managed: Boolean(accessInfo?.managed) || isProtected,
      mode: String(accessInfo?.mode || "unknown"),
      protected: isProtected,
    },
    setup: {
      // "main" = server Vinili principale (stesso form partnership, overlay Mongo).
      kind: isMain ? "main" : "managed",
      complete: setupComplete,
      partnershipsChannelId: effectivePartnership?.partnershipsChannelId || null,
      partnerManagerRoleId: effectivePartnership?.partnerManagerRoleId || null,
      legacy: Boolean(effectivePartnership?.legacy),
    },
    stats: {
      memberCount,
      onlineCount,
    },
  };
}

module.exports = {
  listDashboardGuilds,
  getDashboardGuildOverview,
  verifyDashboardGuildAccess,
  assertDashboardHighStaffAccess,
  resolveDashboardHighStaffFlag,
  assertDashboardBotDevAccess,
  resolveDashboardBotDevFlag,
  isDashboardBotDevUser,
  getDashboardAccess,
  fetchDiscordUser,
  guildMemberHasRole,
  guildMemberHasAnyRole,
  hasManageServerPermission,
};
