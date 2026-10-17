const IDs = require("../Config/ids");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { discordRoleIconUrl } = require("../Discord/discordRoleIconUrl");
const { isHogwartsSystemRoleId } = require("./hogwartsSortingConfig");
const { collectBlockedSystemRoleIds, isListableUserCustomRole } = require("../Community/userCustomRoleFilter");
const { sendJsonWithEtag, weakEtagFromParts } = require("./siteHttpEtag");

const CACHE_TTL_MS = 90_000;
const STALE_KEEP_MS = 10 * 60 * 1000;
const IDENTITY_FETCH_TIMEOUT_MS = 4_500;
const IDENTITY_BATCH_CONCURRENCY = 8;
/* rolesMemberCountFix1: roster completo per conteggi reali (role.members cache era parziale) */
const MEMBERS_HYDRATE_TTL_MS = 5 * 60 * 1000;
const MEMBERS_FETCH_BUDGET_MS = 55_000;
/* siteUsersSwr1/rolesFastPath1: sul GET non aspettare il roster Discord intero */
const MEMBERS_FETCH_REQUEST_BUDGET_MS = 1_200;
let cache = { at: 0, payload: null, refreshing: false };
let mentionsCache = { at: 0, payload: null, refreshing: false };
let membersHydratedAt = 0;
let membersHydrating = null;
const BLOCKED_ROLE_IDS = collectBlockedSystemRoleIds();
const MENTIONS_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function inviteFallbackUrl() {
  const u = String(IDs.links?.invite || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return "https://discord.gg/viniliecaffe";
}

function normalizeHexColor(role) {
  const hex = String(role?.hexColor || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(hex) && hex.toLowerCase() !== "#000000") return hex;
  const n = Number(role?.color || 0);
  if (Number.isFinite(n) && n > 0) return `#${n.toString(16).padStart(6, "0")}`;
  return "#f8fafc";
}

function snowflakeDateIso(id) {
  const raw = String(id || "").trim();
  if (!/^\d{17,22}$/.test(raw)) return null;
  try {
    const ts = Number((BigInt(raw) >> 22n) + 1420070400000n);
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function defaultEmbedAvatarUrl(userId) {
  const id = String(userId || "").trim();
  let idx = 0;
  if (/^\d{5,24}$/.test(id)) {
    try {
      idx = Number((BigInt(id) >> 22n) % 6n);
    } catch {
      idx = 0;
    }
  }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function emptyIdentity(userId) {
  const id = String(userId || "").trim();
  return {
    ownerId: id,
    ownerUsername: "",
    ownerDisplayName: "Utente",
    ownerAvatar: "",
    ownerAvatarUrl: defaultEmbedAvatarUrl(id),
    inGuild: false,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

async function fetchDiscordUser(client, guild, userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  let user = await withTimeout(client.users.fetch(id, { force: false }).catch(() => null), IDENTITY_FETCH_TIMEOUT_MS);
  if (!user && guild?.members?.fetch) {
    const member = await withTimeout(
      guild.members.fetch({ user: id, force: false }).catch(() => null),
      IDENTITY_FETCH_TIMEOUT_MS,
    );
    user = member?.user || null;
  }
  return user;
}

async function fetchUserIdentity(client, guild, userId) {
  const id = String(userId || "").trim();
  const out = emptyIdentity(id);
  if (!id) return out;
  /* rolesOwnerHydrate1: cache first, then Discord fetch (prima tornava "Utente" se non in cache) */
  let member = guild?.members?.cache?.get(id) || null;
  let user = member?.user || client?.users?.cache?.get?.(id) || null;
  if (!member && !user) {
    user = await fetchDiscordUser(client, guild, id);
    member = guild?.members?.cache?.get(id) || null;
    if (!user && member?.user) user = member.user;
  }
  out.inGuild = Boolean(member);
  if (!user) return out;
  out.ownerUsername = String(user.username || "").trim();
  out.ownerDisplayName =
    String(member?.displayName || user.globalName || user.username || "").trim() ||
    out.ownerUsername ||
    "Utente";
  out.ownerAvatar = user.avatar ? String(user.avatar) : "";
  out.ownerAvatarUrl =
    userAvatarUrlDynamic(member || user, { size: 256 }) || defaultEmbedAvatarUrl(id);
  return out;
}

async function fetchUserIdentitiesBatch(client, guild, userIds) {
  const uniq = [...new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += IDENTITY_BATCH_CONCURRENCY) {
    const chunk = uniq.slice(i, i + IDENTITY_BATCH_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (id) => {
        const identity = await fetchUserIdentity(client, guild, id);
        return [id, identity];
      }),
    );
    for (const [id, identity] of rows) out.set(id, identity);
  }
  return out;
}

function staffBadgeRoleOrder(ids) {
  const R = ids.roles;
  return [
    R.Founder,
    R.Manager,
    R.Admin,
    R.Director,
    R.HighStaff,
    R.SeniorModerator,
    R.Mod,
    R.Helper,
    R.PartnerManager,
    R.Staff,
    R.StafferDelMese,
    R.StafferDellaSettimana,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function staffBadgeLabelForRole(guild, roleId) {
  const r = guild?.roles?.cache?.get(roleId);
  const raw = String(r?.name || "").trim();
  if (raw.length > 0 && raw.length <= 16) return raw;
  if (raw.length > 16) return `${raw.slice(0, 14)}…`;
  return "Staff";
}

function collectMemberStaffBadges(member, guild) {
  if (!member?.roles?.cache || !guild?.roles?.cache) return [];
  const order = staffBadgeRoleOrder(IDs);
  const index = new Map(order.map((id, i) => [id, i]));
  const out = [];
  for (const roleId of member.roles.cache.keys()) {
    const rid = String(roleId);
    if (!index.has(rid)) continue;
    out.push({
      roleId: rid,
      label: staffBadgeLabelForRole(guild, rid),
      _i: index.get(rid),
    });
  }
  out.sort((a, b) => a._i - b._i);
  return out.map(({ roleId: id, label }) => ({ roleId: id, label }));
}

function memberIdentityFromGuildMember(member, ownerId, guild) {
  const user = member?.user || null;
  const userId = String(user?.id || member?.id || "").trim();
  const username = String(user?.username || "").trim();
  const displayName = String(
    member?.displayName || user?.globalName || username || "Utente"
  ).trim();
  const avatarGuild = member?.avatar != null ? String(member.avatar) : "";
  const avatarUser = user?.avatar ? String(user.avatar) : "";
  const avatar = avatarGuild || avatarUser;
  const avatarUrl = userAvatarUrlDynamic(member, { size: 128 }) || "";
  return {
    userId,
    username,
    displayName,
    avatar,
    avatarUrl: String(avatarUrl || "").trim(),
    isOwner: String(ownerId || "") === userId,
    staffBadges: guild ? collectMemberStaffBadges(member, guild) : [],
  };
}

function isExpired(doc) {
  if (!doc?.expiresAt) return false;
  const t = new Date(doc.expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

async function hydrateRoleOwners(client, guild, ownerIds) {
  const ids = [...new Set((Array.isArray(ownerIds) ? ownerIds : []).map((id) => String(id || "").trim()).filter((id) => /^\d{17,22}$/.test(id)))];
  if (!guild?.members?.fetch || !ids.length) return;
  const missing = ids.filter((id) => !guild.members.cache.has(id) && !client?.users?.cache?.has?.(id));
  if (!missing.length) return;
  /* rolesOwnerHydrate1: soft budget 900ms + background rebuild cache */
  const concurrency = 8;
  const run = async () => {
    for (let i = 0; i < missing.length; i += concurrency) {
      const chunk = missing.slice(i, i + concurrency);
      await Promise.all(
        chunk.map((userId) =>
          withTimeout(
            guild.members.fetch({ user: userId, force: false }).catch(() => null),
            IDENTITY_FETCH_TIMEOUT_MS,
          ).then((member) => {
            if (member?.user) return member;
            return withTimeout(client.users.fetch(userId, { force: false }).catch(() => null), IDENTITY_FETCH_TIMEOUT_MS);
          }),
        ),
      );
    }
  };
  await Promise.race([run(), new Promise((r) => setTimeout(r, 900))]);
  if (missing.some((id) => !guild.members.cache.has(id) && !client?.users?.cache?.has?.(id))) {
    setImmediate(() => {
      run()
        .then(() => refreshSiteRolesCache(client).catch(() => {}))
        .catch(() => {});
    });
  }
}

function membersRosterLooksComplete(guild) {
  const reported = Math.max(0, Number(guild?.memberCount || guild?.approximateMemberCount || 0));
  const cached = Math.max(0, Number(guild?.members?.cache?.size || 0));
  if (cached < 50) return false;
  if (reported > 0) return cached >= Math.floor(reported * 0.8);
  return cached >= 200;
}

async function ensureCustomRoleMemberRoster(guild, opts) {
  if (!guild?.members?.fetch) return;
  const fresh = Date.now() - membersHydratedAt < MEMBERS_HYDRATE_TTL_MS;
  if (fresh && membersRosterLooksComplete(guild)) return;
  const budget = Math.max(
    200,
    Number(opts?.budgetMs) > 0 ? Number(opts.budgetMs) : MEMBERS_FETCH_BUDGET_MS,
  );
  if (membersHydrating) {
    /* rolesFastPath1: su request path non restare appeso al fetch lungo in corso */
    if (budget <= MEMBERS_FETCH_REQUEST_BUDGET_MS) {
      await Promise.race([
        membersHydrating.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, budget)),
      ]);
      return;
    }
    await membersHydrating.catch(() => {});
    return;
  }
  membersHydrating = (async () => {
    try {
      /* rolesMemberCountFix1: un fetch roster controllato (TTL 5m) — role.members da soli
         contano solo chi è già in cache REST e sotto-stimano (es. 4/5 invece di 24). */
      await Promise.race([
        guild.members.fetch().catch((err) => {
          global.logger?.warn?.("[WEBHOOK] site-roles members roster:", err?.message || err);
          return null;
        }),
        new Promise((resolve) => setTimeout(resolve, Math.max(budget, MEMBERS_FETCH_BUDGET_MS))),
      ]);
      if (Number(guild?.members?.cache?.size || 0) > 0) {
        membersHydratedAt = Date.now();
      }
    } finally {
      membersHydrating = null;
    }
  })();
  if (budget <= MEMBERS_FETCH_REQUEST_BUDGET_MS) {
    await Promise.race([
      membersHydrating.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, budget)),
    ]);
    return;
  }
  await membersHydrating;
}

function collectHumanMembersForRole(guild, role) {
  const rid = String(role?.id || "").trim();
  if (!rid) return [];
  const out = [];
  const seen = new Set();
  const push = (m) => {
    if (!m || m.user?.bot) return;
    const id = String(m.id || m.user?.id || "").trim();
    if (!id || seen.has(id)) return;
    if (m.roles?.cache && typeof m.roles.cache.has === "function" && !m.roles.cache.has(rid)) return;
    seen.add(id);
    out.push(m);
    try {
      role.members?.set?.(id, m);
    } catch (_) {}
  };
  /* Preferisci scan della cache guild (completa dopo ensureCustomRoleMemberRoster). */
  if (guild?.members?.cache?.size) {
    for (const m of guild.members.cache.values()) {
      if (!m?.roles?.cache?.has?.(rid)) continue;
      push(m);
    }
  }
  if (out.length) return out;
  if (role?.members) {
    for (const m of role.members.values()) push(m);
  }
  return out;
}

async function buildSiteRolesPayload(client) {
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return {
      ok: true,
      inviteUrl: inviteFallbackUrl(),
      summary: { totalRoles: 0, permanentRoles: 0, temporaryRoles: 0, totalAssignments: 0 },
      rows: [],
    };
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return {
      ok: true,
      inviteUrl: inviteFallbackUrl(),
      summary: { totalRoles: 0, permanentRoles: 0, temporaryRoles: 0, totalAssignments: 0 },
      rows: [],
    };
  }

  await guild.roles.fetch().catch(() => null);

  const docs = await CustomRole.find({ guildId }).lean().catch(() => []);
  const filtered = (Array.isArray(docs) ? docs : []).filter((doc) => (doc?.roleId || doc?.secondaryRoleId) && !isExpired(doc));
  const ownerIds = filtered.map((doc) => doc.userId);
  // rolesPrefetchNoise1: never guild.members.fetch() full roster on every page hit.
  // rolesFastPath1: request = budget corto; completa in background se serve.
  await ensureCustomRoleMemberRoster(guild, { budgetMs: MEMBERS_FETCH_REQUEST_BUDGET_MS });
  if (!membersRosterLooksComplete(guild) || Date.now() - membersHydratedAt >= MEMBERS_HYDRATE_TTL_MS) {
    setImmediate(() => {
      ensureCustomRoleMemberRoster(guild, { budgetMs: MEMBERS_FETCH_BUDGET_MS }).catch(() => {});
    });
  }
  await hydrateRoleOwners(client, guild, ownerIds);
  const identityByOwner = await fetchUserIdentitiesBatch(client, guild, ownerIds);
  const rows = [];

  for (const doc of filtered) {
    const ownerId = String(doc.userId || "").trim();
    if (!ownerId) continue;
    let ownerMember = guild.members.cache.get(ownerId) || null;
    const cachedUser = client?.users?.cache?.get?.(ownerId) || null;
    if (ownerMember?.user?.bot || cachedUser?.bot) continue;

    const roleEntries = [
      { roleId: String(doc.roleId || "").trim(), slot: "primary" },
      { roleId: String(doc.secondaryRoleId || "").trim(), slot: "secondary" },
    ].filter((entry) => entry.roleId);
    for (const entry of roleEntries) {
      if (isHogwartsSystemRoleId(entry.roleId, client) || BLOCKED_ROLE_IDS.has(entry.roleId)) continue;
      const role = guild.roles.cache.get(entry.roleId) || (await guild.roles.fetch(entry.roleId).catch(() => null));
      if (!role) continue;
      if (!isListableUserCustomRole(role, { blockedRoleIds: BLOCKED_ROLE_IDS })) continue;

      const identity = {
        ...(identityByOwner.get(String(doc.userId || "").trim()) || emptyIdentity(doc.userId)),
        inGuild: Boolean(ownerMember),
      };
      if (!String(identity.ownerDisplayName || "").trim()) identity.ownerDisplayName = "Utente";
      if (!String(identity.ownerAvatarUrl || "").trim()) {
        identity.ownerAvatarUrl = defaultEmbedAvatarUrl(ownerId);
      }
      const createdAt =
        (role.createdAt instanceof Date && Number.isFinite(role.createdAt.getTime()) ? role.createdAt.toISOString() : null) ||
        snowflakeDateIso(role.id) ||
        null;
      const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null;
      const humanMembers = collectHumanMembersForRole(guild, role);
      const memberCount = humanMembers.length;
      const roleIcon = discordRoleIconUrl(role, { size: 256 });
      const members = humanMembers
        .map((m) => memberIdentityFromGuildMember(m, doc.userId, guild))
        .sort((a, b) => {
          if (a.isOwner && !b.isOwner) return -1;
          if (!a.isOwner && b.isOwner) return 1;
          return String(a.displayName || a.username || "").localeCompare(String(b.displayName || b.username || ""), "it", {
            sensitivity: "base",
          });
        });

      rows.push({
        roleId: role.id,
        roleSlot: entry.slot,
        roleName: String(role.name || "Ruolo custom").trim(),
        roleColor: normalizeHexColor(role),
        roleEmoji: String(role.unicodeEmoji || "").trim(),
        roleIconUrl: String(roleIcon.iconUrl || "").trim(),
        roleIconAnimated: Boolean(roleIcon.iconAnimated),
        createdAt,
        expiresAt,
        isPermanent: !expiresAt,
        memberCount,
        members,
        customVocChannelId: String(doc.customVocChannelId || "").trim(),
        ...identity,
      });
    }
  }

  rows.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime() || 0;
    const tb = new Date(b.createdAt || 0).getTime() || 0;
    if (ta !== tb) return tb - ta;
    return String(a.roleName || "").localeCompare(String(b.roleName || ""), "it", { sensitivity: "base" });
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalRoles += 1;
      acc.totalAssignments += Math.max(0, Number(row.memberCount) || 0);
      if (row.isPermanent) acc.permanentRoles += 1;
      else acc.temporaryRoles += 1;
      return acc;
    },
    { totalRoles: 0, permanentRoles: 0, temporaryRoles: 0, totalAssignments: 0 },
  );

  return {
    ok: true,
    inviteUrl: inviteFallbackUrl(),
    summary,
    rows,
  };
}

function sendRolesPayload(req, res, payload, opts) {
  /* siteApiW6: ETag/304 on roles poll */
  const stale = Boolean(opts?.stale);
  const cacheControl = stale ? "public, max-age=5, stale-while-revalidate=120" : "public, max-age=20";
  const etag = weakEtagFromParts([
    "roles",
    cache.at || 0,
    payload?.summary?.totalRoles || 0,
    payload?.summary?.totalAssignments || 0,
    stale ? "s" : "f",
  ]);
  return sendJsonWithEtag(req, res, payload, {
    cacheControl,
    etag,
    extraHeaders: stale ? { "X-VC-Roles-Stale": "1" } : undefined,
  });
}

async function refreshSiteRolesCache(client) {
  if (cache.refreshing) return cache.payload;
  cache.refreshing = true;
  try {
    const payload = await buildSiteRolesPayload(client);
    cache = { at: Date.now(), payload, refreshing: false };
    return payload;
  } catch (err) {
    cache.refreshing = false;
    throw err;
  }
}

function warmSiteRolesCache(client) {
  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.payload);
  return refreshSiteRolesCache(client).catch((err) => {
    global.logger?.warn?.("[WEBHOOK] site-roles warm:", err?.message || err);
    return null;
  });
}

async function buildRoleMentionsCatalog(client) {
  const guildId = resolveGuildId(client);
  if (!guildId) return { ok: false, error: "missing_guild", roles: [] };
  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, error: "guild_unavailable", roles: [] };
  try {
    if (guild.roles?.fetch) await guild.roles.fetch().catch(() => null);
  } catch (_) {}
  const everyoneId = String(guild.id || "");
  const roles = [];
  for (const role of guild.roles.cache.values()) {
    const id = String(role?.id || "").trim();
    if (!id || id === everyoneId) continue;
    const name = String(role?.name || "").trim();
    if (!name || name === "@everyone") continue;
    const icon = discordRoleIconUrl(role, { size: 64 });
    roles.push({
      id,
      name,
      color: normalizeHexColor(role),
      iconUrl: String(icon.iconUrl || "").trim(),
      iconAnimated: Boolean(icon.iconAnimated),
      emoji: String(role?.unicodeEmoji || "").trim(),
    });
  }
  roles.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" }));
  return { ok: true, roles };
}

async function refreshMentionsCatalog(client) {
  if (mentionsCache.refreshing && mentionsCache.payload) return mentionsCache.payload;
  mentionsCache.refreshing = true;
  try {
    const payload = await buildRoleMentionsCatalog(client);
    mentionsCache = { at: Date.now(), payload, refreshing: false };
    return payload;
  } catch (err) {
    mentionsCache.refreshing = false;
    throw err;
  }
}

async function handleSiteRolesGet(client, req, res) {
  try {
    const q = req?.query || {};
    const wantMentions =
      String(q.catalog || "").trim().toLowerCase() === "mentions" ||
      String(q.mentions || "").trim() === "1";
    if (wantMentions) {
      const nowM = Date.now();
      if (mentionsCache.payload && nowM - mentionsCache.at < MENTIONS_CACHE_TTL_MS) {
        return sendJsonWithEtag(req, res, mentionsCache.payload, {
          cacheControl: "public, max-age=60, stale-while-revalidate=300",
          etag: weakEtagFromParts(["role-mentions", mentionsCache.at || 0, mentionsCache.payload?.roles?.length || 0]),
        });
      }
      const payload = await refreshMentionsCatalog(client);
      return sendJsonWithEtag(req, res, payload, {
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
        etag: weakEtagFromParts(["role-mentions", mentionsCache.at || 0, payload?.roles?.length || 0]),
      });
    }

    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      return sendRolesPayload(req, res, cache.payload);
    }

    const stalePayload = cache.payload && now - cache.at < STALE_KEEP_MS ? cache.payload : null;
    if (stalePayload) {
      if (!cache.refreshing) {
        refreshSiteRolesCache(client).catch((err) => {
          global.logger?.warn?.("[WEBHOOK] site-roles refresh:", err?.message || err);
        });
      }
      return sendRolesPayload(req, res, stalePayload, { stale: true });
    }

    if (cache.refreshing && stalePayload) {
      return sendRolesPayload(req, res, stalePayload, { stale: true });
    }

    const payload = await refreshSiteRolesCache(client);
    return sendRolesPayload(req, res, payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-roles:", err);
    if (cache.payload) {
      return sendRolesPayload(req, res, cache.payload, { stale: true });
    }
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

function invalidateSiteRolesCache() {
  cache = { at: 0, payload: null, refreshing: false };
  mentionsCache = { at: 0, payload: null, refreshing: false };
  membersHydratedAt = 0;
}

module.exports = { handleSiteRolesGet, invalidateSiteRolesCache, warmSiteRolesCache };
