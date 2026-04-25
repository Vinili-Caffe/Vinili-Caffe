const IDs = require("../Config/ids");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");

const CACHE_TTL_MS = 30_000;
let cache = { at: 0, payload: null };

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

async function fetchDiscordUser(client, guild, userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  let user = await client.users.fetch(id, { force: true }).catch(() => null);
  if (!user && guild?.members?.fetch) {
    const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    user = member?.user || null;
  }
  return user;
}

async function fetchUserIdentity(client, guild, userId) {
  const user = await fetchDiscordUser(client, guild, userId);
  const out = {
    ownerId: String(userId || ""),
    ownerUsername: "",
    ownerDisplayName: "",
    ownerAvatar: "",
    ownerAvatarUrl: "",
  };
  if (!user) return out;
  out.ownerUsername = String(user.username || "").trim();
  out.ownerDisplayName = String(user.username || "").trim();
  out.ownerAvatar = user.avatar ? String(user.avatar) : "";
  if (typeof user.displayAvatarURL === "function") {
    out.ownerAvatarUrl = user.displayAvatarURL({ size: 256, dynamic: true });
  }
  return out;
}

function memberIdentityFromGuildMember(member, ownerId) {
  const user = member?.user || null;
  const userId = String(user?.id || member?.id || "").trim();
  const username = String(user?.username || "").trim();
  const displayName = String(username || "Utente").trim();
  const avatar = user?.avatar ? String(user.avatar) : "";
  const avatarUrl =
    user && typeof user.displayAvatarURL === "function"
      ? user.displayAvatarURL({ size: 128, dynamic: true })
      : "";
  return {
    userId,
    username,
    displayName,
    avatar,
    avatarUrl: String(avatarUrl || "").trim(),
    isOwner: String(ownerId || "") === userId,
  };
}

function isExpired(doc) {
  if (!doc?.expiresAt) return false;
  const t = new Date(doc.expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

async function handleSiteRolesGet(client, req, res) {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=20");
      return res.json(cache.payload);
    }

    const guildId = resolveGuildId(client);
    if (!guildId) {
      const empty = { ok: true, inviteUrl: inviteFallbackUrl(), summary: { totalRoles: 0, permanentRoles: 0, temporaryRoles: 0, totalAssignments: 0 }, rows: [] };
      cache = { at: now, payload: empty };
      res.setHeader("Cache-Control", "public, max-age=20");
      return res.json(empty);
    }

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      const empty = { ok: true, inviteUrl: inviteFallbackUrl(), summary: { totalRoles: 0, permanentRoles: 0, temporaryRoles: 0, totalAssignments: 0 }, rows: [] };
      cache = { at: now, payload: empty };
      res.setHeader("Cache-Control", "public, max-age=20");
      return res.json(empty);
    }

    await guild.roles.fetch().catch(() => null);
    await guild.members.fetch().catch(() => null);

    const docs = await CustomRole.find({ guildId, roleId: { $ne: null } }).lean().catch(() => []);
    const filtered = (Array.isArray(docs) ? docs : []).filter((doc) => doc?.roleId && !isExpired(doc));
    const rows = [];

    for (const doc of filtered) {
      const roleId = String(doc.roleId || "").trim();
      if (!roleId) continue;
      const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;

      const identity = await fetchUserIdentity(client, guild, doc.userId);
      const createdAt =
        (role.createdAt instanceof Date && Number.isFinite(role.createdAt.getTime()) ? role.createdAt.toISOString() : null) ||
        snowflakeDateIso(role.id) ||
        null;
      const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null;
      const memberCount = role.members ? role.members.filter((m) => !m.user?.bot).size : 0;
      const iconUrl = typeof role.iconURL === "function" ? role.iconURL({ size: 256 }) : "";
      const members = role.members
        ? Array.from(role.members.values())
          .filter((m) => !m.user?.bot)
          .map((m) => memberIdentityFromGuildMember(m, doc.userId))
          .sort((a, b) => {
            if (a.isOwner && !b.isOwner) return -1;
            if (!a.isOwner && b.isOwner) return 1;
            return String(a.username || "").localeCompare(
              String(b.username || ""),
              "it",
              { sensitivity: "base" },
            );
          })
        : [];

      rows.push({
        roleId: role.id,
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

    rows.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.createdAt || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
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

    const payload = {
      ok: true,
      inviteUrl: inviteFallbackUrl(),
      summary,
      rows,
    };
    cache = { at: now, payload };
    res.setHeader("Cache-Control", "public, max-age=20");
    return res.json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-roles:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

module.exports = { handleSiteRolesGet };