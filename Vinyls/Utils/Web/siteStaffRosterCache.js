const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity");
const {
  STAFF_LIST_SECTION_ROLE_IDS,
  memberHasStaffRole,
  getStaffListPausedUserIds,
} = require("../Community/staffListUtils");
const {
  resolveStaffProfileDisplayRoleId,
  buildFullProfileRoleLabelForEmbed,
  resolveStaffProfileKind,
} = require("../Staff/staffProfilePanelRuntime");

const ROSTER_TTL_MS = 75_000;
const PAUSED_TTL_MS = 45_000;
const TICKETS_TTL_MS = 20_000;

let rosterCache = null;
let rosterInflight = null;
let pausedCache = null;
let pausedInflight = null;
let ticketsCache = null;
let ticketsInflight = null;

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function memberIsPm(member) {
  const pm = String(IDs.roles.PartnerManager || "").trim();
  return Boolean(pm && member?.roles?.cache?.has?.(pm));
}

function identityFromMember(member) {
  const user = member?.user || member;
  const userId = String(member?.id || user?.id || "");
  const resolved =
    userAvatarUrlDynamic(member, { size: 128 }) ||
    userAvatarUrlDynamic(user, { size: 128 }) ||
    discordDefaultAvatarUrl(user || { id: userId }, { size: 128 });
  return {
    userId,
    displayName: String(member?.displayName || user?.globalName || user?.username || "Staff").trim() || "Staff",
    username: accountUsername(user) || "",
    avatarUrl: resolved,
  };
}

function roleKeyForId(roleId) {
  const id = String(roleId || "");
  for (const [key, value] of Object.entries(IDs.roles || {})) {
    if (String(value) === id) return key;
  }
  return "";
}

/**
 * site-api REST: `guild.members.fetch({limit,after})` ignores pagination and re-downloads
 * the whole guild. Never use fetchMembersForStaffList here — one plain fetch() is enough.
 */
async function ensureGuildMembersLoaded(guild) {
  if (!guild?.members?.fetch) return guild?.members?.cache || new Map();
  const size = Number(guild.members.cache?.size || 0);
  // After a full REST list, cache has hundreds/thousands of members. Avoid refetch.
  if (size >= 25) return guild.members.cache;
  await guild.members.fetch().catch(() => null);
  return guild.members.cache;
}

function buildRosterFromGuild(guild, pausedSet) {
  const memberList =
    typeof guild.members?.cache?.values === "function"
      ? [...guild.members.cache.values()]
      : [];
  const sections = [];
  const seen = new Set();
  let total = 0;
  let onPause = 0;
  let pmCount = 0;
  const membersById = new Map();

  const sectionIds = STAFF_LIST_SECTION_ROLE_IDS.slice().reverse();
  for (const roleId of sectionIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    const members = [];
    for (const member of memberList) {
      if (!member?.roles?.cache?.has?.(roleId)) continue;
      if (member.user?.bot) continue;
      if (!memberHasStaffRole(member) && !memberIsPm(member)) continue;
      const uid = String(member.id);
      if (seen.has(uid)) continue;
      seen.add(uid);
      const pausedNow = pausedSet.has(uid);
      if (pausedNow) onPause += 1;
      total += 1;
      if (memberIsPm(member)) pmCount += 1;
      const displayRoleId = resolveStaffProfileDisplayRoleId(member);
      let label = buildFullProfileRoleLabelForEmbed(guild, member);
      label = stripDiscordDecorations(label) || role.name || "Staff";
      const row = {
        ...identityFromMember(member),
        displayRoleId: displayRoleId || roleId,
        displayRoleLabel: label,
        profileKind: resolveStaffProfileKind(member),
        isPm: memberIsPm(member),
        onPause: pausedNow,
      };
      members.push(row);
      membersById.set(uid, row);
    }
    members.sort((a, b) => a.displayName.localeCompare(b.displayName, "it", { sensitivity: "base" }));
    if (members.length) {
      sections.push({
        roleId: String(roleId),
        roleKey: roleKeyForId(roleId),
        roleLabel: stripDiscordDecorations(role.name) || role.name,
        color: role.hexColor && role.hexColor !== "#000000" ? role.hexColor : "#d4a888",
        members,
      });
    }
  }

  const byRole = sections.map((sec) => ({
    roleId: sec.roleId,
    roleLabel: sec.roleLabel,
    color: sec.color,
    count: sec.members.length,
  }));

  return {
    guildId: String(guild.id),
    sections,
    byRole,
    membersById,
    counts: { total, onPause, pmCount },
  };
}

async function getPausedUserIdsCached(guildId) {
  const now = Date.now();
  if (pausedCache && pausedCache.guildId === String(guildId) && pausedCache.exp > now) {
    return pausedCache.set;
  }
  if (pausedInflight) return pausedInflight;
  pausedInflight = getStaffListPausedUserIds(guildId)
    .then((set) => {
      pausedCache = { guildId: String(guildId), set, exp: Date.now() + PAUSED_TTL_MS };
      return set;
    })
    .finally(() => {
      pausedInflight = null;
    });
  return pausedInflight;
}

async function getOpenTicketStatsCached(guildId) {
  const now = Date.now();
  if (ticketsCache && ticketsCache.guildId === String(guildId) && ticketsCache.exp > now) {
    return ticketsCache.stats;
  }
  if (ticketsInflight) return ticketsInflight;
  ticketsInflight = (async () => {
    const rows = await Ticket.find({ guildId, open: true }, { claimedBy: 1 })
      .then((r) => (Array.isArray(r) ? r : []))
      .catch(() => []);
    let unclaimed = 0;
    for (const t of rows) {
      const c = t?.claimedBy;
      if (c == null || c === "") unclaimed += 1;
    }
    const stats = { openTickets: rows.length, unclaimedTickets: unclaimed };
    ticketsCache = { guildId: String(guildId), stats, exp: Date.now() + TICKETS_TTL_MS };
    return stats;
  })().finally(() => {
    ticketsInflight = null;
  });
  return ticketsInflight;
}

async function countPendingPausesCached(guildId) {
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "pending" },
    { "staff.pauses.status": 1 },
  )
    .lean()
    .catch(() => []);
  let count = 0;
  for (const doc of docs || []) {
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    for (const p of pauses) {
      if (String(p?.status || "") === "pending") count += 1;
    }
  }
  return count;
}

/**
 * Shared staff roster for website APIs (dashboard / directory / manage).
 * Singleflight + TTL so pages don't re-list the whole guild.
 */
async function getCachedStaffRoster(client) {
  const guildId = String(IDs.guilds.main || "");
  const now = Date.now();
  if (rosterCache && rosterCache.guildId === guildId && rosterCache.exp > now) {
    return rosterCache.payload;
  }
  if (rosterInflight) return rosterInflight;

  rosterInflight = (async () => {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
    }
    if (guild.roles?.fetch && !(guild.roles.cache?.size > 1)) {
      await guild.roles.fetch().catch(() => null);
    }
    await ensureGuildMembersLoaded(guild);
    const paused = await getPausedUserIdsCached(guildId);
    const built = buildRosterFromGuild(guild, paused);
    const payload = { ok: true, status: 200, guild, paused, ...built };
    rosterCache = { guildId, payload, exp: Date.now() + ROSTER_TTL_MS };
    return payload;
  })().finally(() => {
    rosterInflight = null;
  });

  return rosterInflight;
}

function invalidateStaffRosterCache() {
  rosterCache = null;
  pausedCache = null;
  ticketsCache = null;
}

module.exports = {
  getCachedStaffRoster,
  getPausedUserIdsCached,
  getOpenTicketStatsCached,
  countPendingPausesCached,
  ensureGuildMembersLoaded,
  identityFromMember,
  memberIsPm,
  stripDiscordDecorations,
  invalidateStaffRosterCache,
};
