const { fetchGuildMembersRespectingGatewayRateLimit } = require("./gatewayMemberFetch");

const guildHydratePromises = new Map();
const guildMemberIdSnapshots = new Map();
const HYDRATE_TTL_MS = 10 * 60 * 1000;
const MIN_MEMBERS_WITHOUT_COUNT = 25;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

function memberListLooksComplete(idsLength, memberCount) {
  const reported = Math.max(0, Number(memberCount || 0));
  const n = Math.max(0, Number(idsLength || 0));
  if (n <= 0) return false;
    if (reported > 0) return n >= Math.max(1, Math.floor(reported * 0.9));
  return n >= MIN_MEMBERS_WITHOUT_COUNT;
}

function getFreshMemberIdSnapshot(guildId) {
  const snap = guildMemberIdSnapshots.get(String(guildId || ""));
  if (!snap?.ids?.length) return null;
  if (Date.now() - Number(snap.at || 0) >= HYDRATE_TTL_MS) return null;
  return snap;
}

/** Keep byRole index in sync after Discord role add/remove so site lists don't resurrect stale members. */
function dropMemberFromRoleSnapshot(guildId, roleId, memberId) {
  const gid = String(guildId || "");
  const rid = String(roleId || "");
  const mid = String(memberId || "");
  if (!gid || !rid || !mid) return false;
  const snap = guildMemberIdSnapshots.get(gid);
  if (!snap?.byRole?.get) return false;
  const ids = snap.byRole.get(rid);
  if (!Array.isArray(ids) || !ids.length) return false;
  const next = ids.filter((id) => String(id) !== mid);
  if (next.length === ids.length) return false;
  snap.byRole.set(rid, next);
  snap.at = Date.now();
  return true;
}

function addMemberToRoleSnapshot(guildId, roleId, memberId) {
  const gid = String(guildId || "");
  const rid = String(roleId || "");
  const mid = String(memberId || "");
  if (!gid || !rid || !/^\d{16,22}$/.test(mid)) return false;
  let snap = guildMemberIdSnapshots.get(gid);
  if (!snap) {
    snap = { ids: [], byRole: new Map(), at: Date.now() };
    guildMemberIdSnapshots.set(gid, snap);
  }
  if (!(snap.byRole instanceof Map)) snap.byRole = new Map();
  const ids = snap.byRole.get(rid) || [];
  if (ids.some((id) => String(id) === mid)) return false;
  snap.byRole.set(rid, [...ids, mid]);
  if (!snap.ids.includes(mid)) snap.ids = [...snap.ids, mid];
  snap.at = Date.now();
  return true;
}

function storeMemberFetchSnapshot(guildId, fetched) {
  const gid = String(guildId || "");
  if (!gid || !fetched) return null;

  const ids = [];
    const byRoleSets = new Map();

  const values =
    typeof fetched.values === "function"
      ? fetched.values()
      : typeof fetched[Symbol.iterator] === "function"
        ? fetched
        : null;
  if (!values) return null;

  for (const member of values) {
    const id = String(member?.id || "").trim();
    if (!/^\d{16,22}$/.test(id)) continue;
    ids.push(id);
    if (member?.user?.bot) continue;
    const roleCache = member?.roles?.cache;
    if (!roleCache || typeof roleCache.keys !== "function") continue;
    for (const roleId of roleCache.keys()) {
      const rid = String(roleId || "").trim();
      if (!rid) continue;
      let set = byRoleSets.get(rid);
      if (!set) {
        set = new Set();
        byRoleSets.set(rid, set);
      }
      set.add(id);
    }
  }

    const byRole = new Map();
  for (const [roleId, set] of byRoleSets) {
    byRole.set(roleId, [...set]);
  }

  const cleanedIds = [...new Set(ids)];
  const snap = { ids: cleanedIds, byRole, at: Date.now() };
  guildMemberIdSnapshots.set(gid, snap);
  return snap;
}

async function hydrateGuildMembersForRolePings(guild, logTag = "[threadRoleMembers]", opts = {}) {
  if (!guild?.members?.fetch) return null;
  const guildId = String(guild.id || "");
  if (!guildId) return null;

  const needRoles = opts.needRoleIndex === true;
  const existing = getFreshMemberIdSnapshot(guildId);
  if (
    existing &&
    memberListLooksComplete(existing.ids.length, guild.memberCount) &&
    (!needRoles || (existing.byRole && existing.byRole.size > 0))
  ) {
    return existing;
  }

  const inFlight = guildHydratePromises.get(guildId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const fetched = await fetchGuildMembersRespectingGatewayRateLimit(guild, {
        maxAttempts: 6,
        onTimeout: (timeMs, attempt, maxAttempts) => {
          global.logger?.info?.(
            `${logTag} guild members timeout, retry ${attempt}/${maxAttempts} with time=${Math.round(timeMs / 1000)}s`,
          );
        },
      });
      return storeMemberFetchSnapshot(guildId, fetched);
    } catch (err) {
      global.logger?.warn?.(`${logTag} guild members fetch failed:`, err?.message || err);
      return getFreshMemberIdSnapshot(guildId);
    } finally {
      guildHydratePromises.delete(guildId);
    }
  })();

  guildHydratePromises.set(guildId, promise);
  return promise;
}

async function collectHumanMemberIdsWithRole(guild, roleId, opts = {}) {
  const rid = String(roleId || "").trim();
  if (!guild || !rid) return [];
  const logTag = opts.logTag || "[collectHumanMemberIdsWithRole]";
  let snap = null;
  if (opts.hydrate !== false) {
    snap = await hydrateGuildMembersForRolePings(guild, logTag, { needRoleIndex: true });
  } else {
    snap = getFreshMemberIdSnapshot(guild.id);
    if (!snap?.byRole?.size) {
      snap = await hydrateGuildMembersForRolePings(guild, logTag, { needRoleIndex: true });
    }
  }

  const ids = new Set();
  const fromSnap = snap?.byRole?.get?.(rid);
  if (Array.isArray(fromSnap)) {
    for (const id of fromSnap) ids.add(String(id));
  }

    const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (role?.members) {
    for (const member of role.members.values()) {
      if (!member?.user?.bot) ids.add(String(member.id));
    }
  }
  if (guild.members?.cache) {
    for (const member of guild.members.cache.values()) {
      if (!member?.user?.bot && member.roles?.cache?.has(rid)) ids.add(String(member.id));
    }
  }
  return [...ids].filter((id) => /^\d{16,22}$/.test(id));
}

async function addAllRoleMembersToThread(thread, guild, roleId, opts = {}) {
  const rid = String(roleId || "").trim();
  if (!thread?.members?.add || !guild || !rid) return { added: 0, failed: 0, skipped: 0 };
  const logTag = opts.logTag || "[addAllRoleMembersToThread]";
  const memberIds = await collectHumanMemberIdsWithRole(guild, rid, {
    logTag,
    hydrate: opts.hydrate !== false,
  });
  if (!memberIds.length) return { added: 0, failed: 0, skipped: 0 };
  return addUserIdsToThread(thread, memberIds, opts);
}

async function addUserIdsToThread(thread, userIds, opts = {}) {
  if (!thread?.members?.add) return { added: 0, failed: 0, skipped: 0 };
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || "").trim()).filter((id) => /^\d{16,22}$/.test(id)))];
  if (!ids.length) return { added: 0, failed: 0, skipped: 0 };
  const threadMemberIds = new Set(
    thread.members?.cache ? [...thread.members.cache.keys()].map(String) : [],
  );
  const every = Math.max(0, Math.floor(Number(opts.throttleEvery ?? 8)));
  const throttleMs = Math.max(0, Math.floor(Number(opts.throttleMs ?? 45)));
  let added = 0;
  let failed = 0;
  let skipped = 0;
  let i = 0;
  for (const userId of ids) {
    if (threadMemberIds.has(userId)) {
      skipped += 1;
      continue;
    }
    const ok = await thread.members.add(userId).then(() => true).catch(() => false);
    if (ok) {
      added += 1;
      threadMemberIds.add(userId);
    } else failed += 1;
    i += 1;
    if (every > 0 && throttleMs > 0 && i % every === 0) await sleep(throttleMs);
  }
  return { added, failed, skipped };
}

async function resolveGuildMemberIds(guild, logTag = "[threadRoleMembers]") {
  if (!guild?.members?.fetch) return null;
  const guildId = String(guild.id || "");
  if (!guildId) return null;

  let snap = await hydrateGuildMembersForRolePings(guild, logTag);
  const reported = Math.max(0, Number(guild.memberCount || 0));

  if (!snap || !memberListLooksComplete(snap.ids.length, reported)) {
    try {
      const fetched = await fetchGuildMembersRespectingGatewayRateLimit(guild, {
        maxAttempts: 5,
        onRateLimit: (waitMs, attempt, maxAttempts) => {
          if (attempt <= 1) return;
          global.logger?.info?.(
            `${logTag} resolve rate limit, retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s`,
          );
        },
        onTimeout: (timeMs, attempt, maxAttempts) => {
          global.logger?.info?.(
            `${logTag} resolve members timeout, retry ${attempt}/${maxAttempts} with time=${Math.round(timeMs / 1000)}s`,
          );
        },
      });
      snap = storeMemberFetchSnapshot(guildId, fetched);
    } catch (err) {
      global.logger?.warn?.(`${logTag} resolve members fetch failed:`, err?.message || err);
      snap = getFreshMemberIdSnapshot(guildId);
    }
  }

  const ids = snap?.ids || [];
  if (!ids.length) return null;

  if (!memberListLooksComplete(ids.length, reported)) {
    global.logger?.warn?.(
      `${logTag} member list incompleta: snapshot=${ids.length} memberCount=${reported} cache=${guild.members.cache?.size || 0} → skip cleanup pericoloso.`,
      guildId,
    );
    return null;
  }
  return ids;
}

async function collectHumanMemberIdsWithRolesOnGuild(sourceGuild, targetGuild, roleIds, opts = {}) {
  const roles = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!sourceGuild || !targetGuild || !roles.length) return [];
  const logTag = opts.logTag || "[threadRoleMembers]";

  await hydrateGuildMembersForRolePings(sourceGuild, logTag, { needRoleIndex: true });
  const targetSnap = await hydrateGuildMembersForRolePings(targetGuild, logTag);

  const staffIds = new Set();
  for (const roleId of roles) {
    const ids = await collectHumanMemberIdsWithRole(sourceGuild, roleId, { logTag, hydrate: false });
    for (const id of ids) staffIds.add(id);
  }

  const targetIds = new Set(targetSnap?.ids || []);
    const present = [];
  for (const userId of staffIds) {
    if (targetIds.has(userId)) {
      present.push(userId);
      continue;
    }
    if (targetIds.size > 0 && memberListLooksComplete(targetIds.size, targetGuild.memberCount)) {
      continue;
    }
    const cached = targetGuild.members.cache.get(userId);
    if (cached && !cached.user?.bot) {
      present.push(userId);
      continue;
    }
    const fetched = await targetGuild.members.fetch(userId).catch(() => null);
    if (fetched && !fetched.user?.bot) present.push(userId);
  }
  return present.filter((id) => /^\d{16,22}$/.test(id));
}

module.exports = {
  hydrateGuildMembersForRolePings,
  collectHumanMemberIdsWithRole,
  collectHumanMemberIdsWithRolesOnGuild,
  addAllRoleMembersToThread,
  addUserIdsToThread,
  resolveGuildMemberIds,
  memberListLooksComplete,
  getFreshMemberIdSnapshot,
  dropMemberFromRoleSnapshot,
  addMemberToRoleSnapshot,
};
