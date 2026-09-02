const IDs = require("../Config/ids");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { isHogwartsSystemRoleId } = require("./hogwartsSortingConfig");
const { collectBlockedSystemRoleIds, isListableUserCustomRole } = require("../Community/userCustomRoleFilter");

const CACHE_TTL_MS = 90_000;
const STALE_KEEP_MS = 10 * 60 * 1000;
const MEMBERS_FETCH_TIMEOUT_MS = 7_000;
const IDENTITY_FETCH_TIMEOUT_MS = 2_500;
const IDENTITY_BATCH_CONCURRENCY = 8;
let cache = { at: 0, payload: null, refreshing: false };
const BLOCKED_ROLE_IDS = collectBlockedSystemRoleIds();

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

function emptyIdentity(userId) {
  const id = String(userId || "").trim();
  return {
    ownerId: id,
    ownerUsername: "",
    ownerDisplayName: "",
    ownerAvatar: "",
    ownerAvatarUrl: "",
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
  let member = guild?.members?.cache?.get(id) || null;
  if (!member && guild?.members?.fetch) {
    member = await withTimeout(
      guild.members.fetch({ user: id, force: false }).catch(() => null),
      IDENTITY_FETCH_TIMEOUT_MS,
    );
  }
  const user = member?.user || (await fetchDiscordUser(client, guild, userId));
  if (!user) return out;
  out.ownerUsername = String(user.username || "").trim();
  out.ownerDisplayName = String(
    member?.displayName || user.globalName || user.username || ""
  ).trim() || out.ownerUsername;
  out.ownerAvatar = user.avatar ? String(user.avatar) : "";
  out.ownerAvatarUrl = userAvatarUrlDynamic(member || user, { size: 256 }) || "";
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

async function ensureMembersCache(guild) {
  if (guild.members?.cache?.size > 50) return;
  await withTimeout(
    guild.members.fetch().catch((err) => {
      global.logger?.warn?.("[WEBHOOK] site-roles members.fetch failed:", err?.message || err);
      return null;
    }),
    MEMBERS_FETCH_TIMEOUT_MS,
  );
  if (!(guild.members?.cache?.size > 1)) {
    global.logger?.warn?.(
      `[WEBHOOK] site-roles members cache thin: size=${guild.members?.cache?.size || 0}`,
    );
  }
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
  await ensureMembersCache(guild);

  const docs = await CustomRole.find({ guildId }).lean().catch(() => []);
  const filtered = (Array.isArray(docs) ? docs : []).filter((doc) => (doc?.roleId || doc?.secondaryRoleId) && !isExpired(doc));
  const ownerIds = filtered.map((doc) => doc.userId);
  const identityByOwner = await fetchUserIdentitiesBatch(client, guild, ownerIds);
  const rows = [];

  for (const doc of filtered) {
    const roleEntries = [
      { roleId: String(doc.roleId || "").trim(), slot: "primary" },
      { roleId: String(doc.secondaryRoleId || "").trim(), slot: "secondary" },
    ].filter((entry) => entry.roleId);
    for (const entry of roleEntries) {
      if (isHogwartsSystemRoleId(entry.roleId, client) || BLOCKED_ROLE_IDS.has(entry.roleId)) continue;
      const role = guild.roles.cache.get(entry.roleId) || (await guild.roles.fetch(entry.roleId).catch(() => null));
      if (!role) continue;
      if (!isListableUserCustomRole(role, { blockedRoleIds: BLOCKED_ROLE_IDS })) continue;

      const identity = identityByOwner.get(String(doc.userId || "").trim()) || emptyIdentity(doc.userId);
      const createdAt =
        (role.createdAt instanceof Date && Number.isFinite(role.createdAt.getTime()) ? role.createdAt.toISOString() : null) ||
        snowflakeDateIso(role.id) ||
        null;
      const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null;
      let humanMembers = role.members
        ? Array.from(role.members.values()).filter((m) => !m.user?.bot)
        : [];
      if (humanMembers.length === 0 && guild.members?.cache?.size) {
        humanMembers = Array.from(guild.members.cache.values()).filter(
          (m) => !m.user?.bot && m.roles?.cache?.has?.(role.id),
        );
        for (const m of humanMembers) {
          role.members?.set?.(m.id, m);
        }
      }
      const memberCount = humanMembers.length;
      const iconUrl = typeof role.iconURL === "function" ? role.iconURL({ size: 256 }) : "";
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
        roleIconUrl: String(iconUrl || "").trim(),
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

function sendRolesPayload(res, payload, opts) {
  const stale = Boolean(opts?.stale);
  res.setHeader("Cache-Control", stale ? "public, max-age=5, stale-while-revalidate=120" : "public, max-age=20");
  if (stale) res.setHeader("X-VC-Roles-Stale", "1");
  return res.json(payload);
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

async function handleSiteRolesGet(client, req, res) {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      return sendRolesPayload(res, cache.payload);
    }

    const stalePayload = cache.payload && now - cache.at < STALE_KEEP_MS ? cache.payload : null;
    if (stalePayload) {
      if (!cache.refreshing) {
        refreshSiteRolesCache(client).catch((err) => {
          global.logger?.warn?.("[WEBHOOK] site-roles refresh:", err?.message || err);
        });
      }
      return sendRolesPayload(res, stalePayload, { stale: true });
    }

    if (cache.refreshing && stalePayload) {
      return sendRolesPayload(res, stalePayload, { stale: true });
    }

    const payload = await refreshSiteRolesCache(client);
    return sendRolesPayload(res, payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-roles:", err);
    if (cache.payload) {
      return sendRolesPayload(res, cache.payload, { stale: true });
    }
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

function invalidateSiteRolesCache() {
  cache = { at: 0, payload: null, refreshing: false };
}

module.exports = { handleSiteRolesGet, invalidateSiteRolesCache, warmSiteRolesCache };
