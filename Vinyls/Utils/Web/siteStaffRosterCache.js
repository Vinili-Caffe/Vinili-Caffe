const IDs = require("../Config/ids");
const { ActivityUserProfile, GlobalSettings } = require("../../Schemas/Community/communitySchemas");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  accountUsername,
  userAvatarUrlDynamic,
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

const ROSTER_TTL_MS = 5 * 60_000;
const PAUSED_TTL_MS = 45_000;
const TICKETS_TTL_MS = 20_000;
const SNAPSHOT_MAX_AGE_MS = 30 * 60_000;
const SNAPSHOT_REFRESH_AGE_MS = 90_000;
const FULL_GUILD_FETCH_TIMEOUT_MS = 14_000;
const STAFF_MEMBER_HYDRATE_BATCH = 25;
const STAFF_DEL_MESE_ROLE_ID = String(IDs.roles?.StafferDelMese || "").trim();

function memberIsStaffDelMese(member) {
  if (!STAFF_DEL_MESE_ROLE_ID || !member?.roles?.cache) return false;
  return member.roles.cache.has(STAFF_DEL_MESE_ROLE_ID);
}

let rosterCache = null;
let rosterInflight = null;
let pausedCache = null;
let pausedInflight = null;
let ticketsCache = null;
let ticketsInflight = null;
let snapshotRefreshInflight = null;

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
    userAvatarUrlDynamic(member, { size: 128, allowDefault: false }) ||
    userAvatarUrlDynamic(user, { size: 128, allowDefault: false }) ||
    "";
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

function isSnowflake(id) {
  return /^\d{16,22}$/.test(String(id || "").trim());
}

function countCachedStaffMembers(guild) {
  let n = 0;
  const list =
    typeof guild?.members?.cache?.values === "function" ? [...guild.members.cache.values()] : [];
  for (const member of list) {
    if (!member || member.user?.bot) continue;
    if (memberHasStaffRole(member) || memberIsPm(member)) n += 1;
  }
  return n;
}

function userIdsFromBuiltRoster(built) {
  const ids = new Set();
  for (const sec of built?.sections || []) {
    for (const m of sec.members || []) {
      const uid = String(m?.userId || "").trim();
      if (isSnowflake(uid)) ids.add(uid);
    }
  }
  if (built?.membersById && typeof built.membersById.keys === "function") {
    for (const uid of built.membersById.keys()) {
      if (isSnowflake(uid)) ids.add(String(uid));
    }
  }
  return [...ids];
}

async function loadRosterSnapshot(guildId) {
  const doc = await GlobalSettings.findOne({ guildId: String(guildId) }, { staffRosterSnapshot: 1 })
    .lean()
    .catch(() => null);
  const snap = doc?.staffRosterSnapshot;
  if (!snap || typeof snap !== "object") return null;
  const updatedAt = snap.updatedAt ? new Date(snap.updatedAt).getTime() : 0;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  const userIds = Array.isArray(snap.userIds)
    ? snap.userIds.map((x) => String(x || "").trim()).filter(isSnowflake)
    : [];
  return {
    updatedAt,
    userIds,
    sections: Array.isArray(snap.sections) ? snap.sections : [],
    byRole: Array.isArray(snap.byRole) ? snap.byRole : [],
    counts: snap.counts && typeof snap.counts === "object" ? snap.counts : { total: 0, onPause: 0 },
    staffDelMese: snap.staffDelMese && typeof snap.staffDelMese === "object" ? snap.staffDelMese : null,
  };
}

async function saveRosterSnapshot(guildId, built, extras = {}) {
  const userIds = userIdsFromBuiltRoster(built);
  if (!userIds.length) return;
  const sections = (built.sections || []).map((sec) => ({
    roleId: sec.roleId,
    roleKey: sec.roleKey || "",
    roleLabel: sec.roleLabel,
    color: sec.color,
    members: (sec.members || []).map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      username: m.username || "",
      avatarUrl: m.avatarUrl || null,
      displayRoleId: m.displayRoleId || null,
      displayRoleLabel: m.displayRoleLabel || "",
      profileKind: m.profileKind || "",
      isPm: Boolean(m.isPm),
      onPause: Boolean(m.onPause),
    })),
  }));
  const payload = {
    updatedAt: new Date().toISOString(),
    userIds,
    sections,
    byRole: built.byRole || [],
    counts: built.counts || { total: userIds.length, onPause: 0 },
    staffDelMese: extras.staffDelMese || null,
  };
  await GlobalSettings.findOneAndUpdate(
    { guildId: String(guildId) },
    { $set: { staffRosterSnapshot: payload }, $setOnInsert: { guildId: String(guildId) } },
    { upsert: true },
  ).catch(() => null);
}

async function collectKnownStaffUserIds(guildId) {
  const gid = String(guildId || "");
  const userIds = new Set();

  const snap = await loadRosterSnapshot(gid).catch(() => null);
  for (const uid of snap?.userIds || []) userIds.add(uid);

  const profileDocs = await ActivityUserProfile.find(
    { guildId: gid, staff: { $exists: true } },
    { userId: 1 },
  )
    .lean()
    .catch(() => []);
  for (const doc of profileDocs || []) {
    const uid = String(doc?.userId || "").trim();
    if (isSnowflake(uid)) userIds.add(uid);
  }

  try {
    const mongoose = require("mongoose");
    const legacy = await mongoose.connection.db
      .collection("staffs")
      .find({ guildId: gid }, { projection: { userId: 1 } })
      .toArray();
    for (const doc of legacy || []) {
      const uid = String(doc?.userId || "").trim();
      if (isSnowflake(uid)) userIds.add(uid);
    }
  } catch (_) {
      }

  for (const extra of [
    String(IDs.roles?.StafferDelMese || "").trim(),
  ]) {
    void extra;
  }

  return [...userIds];
}

async function hydrateStaffMembersByIds(guild, userIds) {
  const pending = (userIds || []).filter((uid) => uid && !guild.members.cache?.has?.(uid));
  for (let i = 0; i < pending.length; i += STAFF_MEMBER_HYDRATE_BATCH) {
    const chunk = pending.slice(i, i + STAFF_MEMBER_HYDRATE_BATCH);
    await Promise.all(chunk.map((uid) => guild.members.fetch(uid).catch(() => null)));
  }
  return Number(guild.members.cache?.size || 0);
}

async function ensureGuildMembersLoaded(guild, preferredIds = []) {
  if (!guild?.members?.fetch) return guild?.members?.cache || new Map();
  if (countCachedStaffMembers(guild) >= 8) return guild.members.cache;

  const known = [
    ...new Set(
      [...(preferredIds || []), ...(await collectKnownStaffUserIds(guild.id).catch(() => []))].filter(
        isSnowflake,
      ),
    ),
  ];
  if (known.length) {
    await hydrateStaffMembersByIds(guild, known);
    if (countCachedStaffMembers(guild) >= 5) return guild.members.cache;
  }

    await Promise.race([
    guild.members.fetch().catch(() => null),
    new Promise((resolve) => setTimeout(resolve, FULL_GUILD_FETCH_TIMEOUT_MS)),
  ]);
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
        isStaffDelMese: memberIsStaffDelMese(member),
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

function builtFromSnapshotSections(snap, pausedSet) {
  const membersById = new Map();
  const sections = [];
  let total = 0;
  let onPause = 0;
  let pmCount = 0;
  const sdmIds = new Set(
    (snap.staffDelMese?.holders || [])
      .map((h) => String(h?.userId || "").trim())
      .filter(Boolean),
  );
  for (const sec of snap.sections || []) {
    const members = [];
    for (const m of sec.members || []) {
      const uid = String(m?.userId || "").trim();
      if (!isSnowflake(uid)) continue;
      const pausedNow = Boolean(pausedSet?.has?.(uid) || m.onPause);
      const row = {
        userId: uid,
        displayName: String(m.displayName || uid).trim() || uid,
        username: String(m.username || ""),
        avatarUrl: m.avatarUrl || null,
        displayRoleId: m.displayRoleId || sec.roleId || null,
        displayRoleLabel: m.displayRoleLabel || sec.roleLabel || "Staff",
        profileKind: m.profileKind || "",
        isPm: Boolean(m.isPm),
        onPause: pausedNow,
        isStaffDelMese: Boolean(m.isStaffDelMese) || sdmIds.has(uid),
      };
      members.push(row);
      membersById.set(uid, row);
      total += 1;
      if (pausedNow) onPause += 1;
      if (row.isPm) pmCount += 1;
    }
    if (members.length) {
      sections.push({
        roleId: String(sec.roleId || ""),
        roleKey: sec.roleKey || roleKeyForId(sec.roleId),
        roleLabel: sec.roleLabel || "Staff",
        color: sec.color || "#d4a888",
        members,
      });
    }
  }
  return {
    guildId: String(IDs.guilds.main || ""),
    sections,
    byRole:
      snap.byRole ||
      sections.map((sec) => ({
        roleId: sec.roleId,
        roleLabel: sec.roleLabel,
        color: sec.color,
        count: sec.members.length,
      })),
    membersById,
    counts: snap.counts?.total ? { ...snap.counts, onPause, pmCount } : { total, onPause, pmCount },
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

async function buildLiveRosterPayload(client, guild) {
  await ensureGuildMembersLoaded(guild);
  const paused = await getPausedUserIdsCached(guild.id);
  const built = buildRosterFromGuild(guild, paused);
  const staffDelMese = buildStaffDelMeseFromGuild(guild);
  if ((built.counts?.total || 0) >= 3) {
    await saveRosterSnapshot(guild.id, built, { staffDelMese }).catch(() => null);
  }
  return { ok: true, status: 200, guild, paused, staffDelMese, ...built };
}

function buildStaffDelMeseFromGuild(guild) {
  const roleId = String(IDs.roles?.StafferDelMese || "").trim();
  const role = roleId && guild?.roles?.cache?.get(roleId) ? guild.roles.cache.get(roleId) : null;
  const holders = [];
  if (roleId && guild?.members?.cache) {
    guild.members.cache.forEach((member) => {
      if (!member?.roles?.cache?.has?.(roleId)) return;
      if (member.user?.bot) return;
      holders.push(identityFromMember(member));
    });
  }
  holders.sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"));
  return {
    roleId: roleId || null,
    roleLabel: role ? stripDiscordDecorations(role.name) || role.name : "Staffer del Mese",
    holders,
  };
}

function scheduleRosterBackgroundRefresh(client, guildId) {
  if (snapshotRefreshInflight) return;
  snapshotRefreshInflight = (async () => {
    try {
      const guild =
        client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) return;
            const known = await collectKnownStaffUserIds(guildId).catch(() => []);
      if (known.length) await hydrateStaffMembersByIds(guild, known);
      const paused = await getPausedUserIdsCached(guildId);
      let built = buildRosterFromGuild(guild, paused);
      if ((built.counts?.total || 0) < 3) {
        const snap = await loadRosterSnapshot(guildId).catch(() => null);
        if (snap?.sections?.length) built = builtFromSnapshotSections(snap, paused);
      }
      const liveSdm = buildStaffDelMeseFromGuild(guild);
      const snapSdm = (await loadRosterSnapshot(guildId).catch(() => null))?.staffDelMese || null;
      const staffDelMese = liveSdm.holders?.length ? liveSdm : snapSdm || liveSdm;
      if ((built.counts?.total || 0) >= 3) {
        await saveRosterSnapshot(guildId, built, { staffDelMese }).catch(() => null);
        rosterCache = {
          guildId,
          payload: { ok: true, status: 200, guild, paused, staffDelMese, ...built },
          exp: Date.now() + ROSTER_TTL_MS,
        };
      }
    } catch (_) {
          } finally {
      snapshotRefreshInflight = null;
    }
  })();
}

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

    const snap = await loadRosterSnapshot(guildId).catch(() => null);
    const snapAge = snap ? now - snap.updatedAt : Infinity;

    if (snap && snapAge < SNAPSHOT_MAX_AGE_MS && (snap.userIds?.length || snap.sections?.length)) {
      const paused = await getPausedUserIdsCached(guildId);
                  let built =
        snap.sections?.length >= 1
          ? builtFromSnapshotSections(snap, paused)
          : null;
      if (!built || (built.counts?.total || 0) < 1) {
        if (snap.userIds?.length) await hydrateStaffMembersByIds(guild, snap.userIds);
        built = buildRosterFromGuild(guild, paused);
      } else if (snap.userIds?.length && countCachedStaffMembers(guild) < 3) {
                hydrateStaffMembersByIds(guild, snap.userIds).catch(() => null);
      }
      const payload = { ok: true, status: 200, guild, paused, staffDelMese: snap.staffDelMese || null, ...built };
      rosterCache = { guildId, payload, exp: Date.now() + ROSTER_TTL_MS };
      if (snapAge > SNAPSHOT_REFRESH_AGE_MS) {
        scheduleRosterBackgroundRefresh(client, guildId);
      }
      return payload;
    }

    const payload = await buildLiveRosterPayload(client, guild);
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
  saveRosterSnapshot,
  loadRosterSnapshot,
  buildStaffDelMeseFromGuild,
};
