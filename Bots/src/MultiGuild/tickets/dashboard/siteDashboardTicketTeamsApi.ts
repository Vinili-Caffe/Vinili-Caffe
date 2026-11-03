const { verifyDashboardGuildAccess } = require("../../site/dashboard/siteDashboardApi") as typeof import("../../site/dashboard/siteDashboardApi");
const { listGuildPickerData } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const {
  MAX_TEAMS,
  MAX_MEMBERS,
  TEAM_PERM_KEYS,
  newTeamId,
  normalizeTeam,
  normalizeTeamId,
  normalizeMembers,
  normalizeTeamPerms,
  defaultTeamPerms,
  getGuildTeams,
  mutateGuildTeams,
  ensureGuildDefaultTeam,
  refreshTicketTeamsCache,
} = require("../tenant/tenantTicketTeams") as typeof import("../tenant/tenantTicketTeams");
const { isMainGuild } = require("../../../Vinili/Moderation/utils/permTenantBypass") as typeof import("../../../Vinili/Moderation/utils/permTenantBypass");

const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  not_found: "Team non trovato.",
  cannot_delete_default: "Il team Default non può essere eliminato.",
  quota_teams: `Quota team raggiunta (max ${MAX_TEAMS}).`,
  invalid_name: "Nome team non valido.",
  invalid_members: "Membri non validi.",
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function resolveMemberLabel(member?, pickers?, guild?, userLabels: Record<string, any> = {}) {
  const id = String(member?.id || "").trim();
  const type = member?.type === "user" ? "user" : "role";
  if (type === "user") {
    const resolved = String(userLabels[id] || "").trim();
    const isOwner = Boolean(guild?.ownerId && id === String(guild.ownerId));
    if (resolved) {
      return { id, type, label: resolved, kind: isOwner ? "owner" : "user" };
    }
    if (isOwner) {
      return { id, type, label: `Owner (${id.slice(-4)})`, kind: "owner" };
    }
    return { id, type, label: `User ${id.slice(-4)}`, kind: "user" };
  }
  const roles = Array.isArray(pickers?.roles) ? pickers.roles : [];
  const hit = roles.find((r?) => String(r.id) === id);
  const name = hit?.name ? String(hit.name) : id;
  return { id, type, label: name.startsWith("@") ? name : `@${name}`, kind: "role" };
}

async function resolveUserMemberLabels(client?, guild?, members?) {
  const ids = [
    ...new Set(
      (members || [])
        .filter((m?) => m && m.type === "user")
        .map((m?) => String(m.id || "").trim())
        .filter(Boolean),
    ),
  ];
  const out: Record<string, any> = {};
  if (!ids.length) return out;

  await Promise.all(
    ids.map(async (id?) => {
      try {
        let member =
          guild?.members?.cache?.get(id) ||
          (await guild?.members?.fetch?.(id).catch(() => null));
        const user =
          member?.user ||
          client?.users?.cache?.get(id) ||
          (await client?.users?.fetch?.(id).catch(() => null));
        const label = String(user?.username || "").trim();
        if (label) out[(id as any)] = label;
      } catch (_) {}
    }),
  );
  return out;
}

function serializeTeam(team?, pickers?, guild?, userLabels: Record<string, any> = {}) {
  const members = (team.members || []).map((m?) => resolveMemberLabel(m, pickers, guild, userLabels));
  return {
    id: team.id,
    name: team.name,
    seedKey: team.seedKey || null,
    isDefault: team.isDefault === true,
    members,
    memberIds: (team.members || []).map((m?) => ({ type: m.type, id: m.id })),
    perms: team.isDefault ? null : team.perms || defaultTeamPerms(),
    createdAt: team.createdAt || null,
    updatedAt: team.updatedAt || null,
  };
}

async function serializeTeamsWithUserLabels(client?, guild?, teams?, pickers?) {
  const allMembers = (teams || []).flatMap((t?) => t.members || []);
  const userLabels = await resolveUserMemberLabels(client, guild, allMembers);
  return (teams || []).map((t?) => serializeTeam(t, pickers, guild, userLabels));
}

async function resolveGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  return (
    client.guilds.cache?.get(gid) ||
    (await client.guilds.fetch(gid).catch(() => null))
  );
}

function serializeMemberSearchHit(member?) {
  const user = member?.user || member;
  const id = String(member?.id || user?.id || "").trim();
  if (!/^\d{16,22}$/.test(id)) return null;
  const username = String(user?.username || "").trim();
  if (!username) return null;
  return { id, username, label: username };
}

async function searchDashboardTicketTeamMembers(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const q = String(query.q || query.query || query.username || "").trim();
  if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
    return { ok: true, status: 200, guildId: gid, members: [] };
  }

  const guild = await resolveGuild(client, gid);
  if (!guild?.members) {
    return fail(404, "not_found", "Server non trovato.");
  }

  const byId = new Map();
  const push = (member?) => {
    const hit = serializeMemberSearchHit(member);
    if (!hit) return;
    byId.set(hit.id, hit);
  };

  if (/^\d{16,22}$/.test(q)) {
    const member =
      guild.members.cache?.get(q) ||
      (await guild.members.fetch(q).catch(() => null));
    if (member) push(member);
  }

  try {
    const found = await guild.members.fetch({ query: q.slice(0, 32), limit: 25 }).catch(() => null);
    const source = found && typeof found.values === "function" ? found.values() : [];
    for (const member of source) push(member);
  } catch (_) {}

  const needle = q.toLowerCase();
  const members = [...byId.values()]
    .filter((m?) => {
      if (/^\d{16,22}$/.test(q) && m.id === q) return true;
      return String(m.username || "").toLowerCase().includes(needle);
    })
    .sort((a?, b?) => String(a.username).localeCompare(String(b.username), "it"))
    .slice(0, 25);

  return { ok: true, status: 200, guildId: gid, members, query: q };
}

async function listDashboardTicketTeams(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const guild = await resolveGuild(client, gid);
  if (!isMainGuild(gid)) {
    await ensureGuildDefaultTeam(gid, guild).catch(() => null);
  }
  await refreshTicketTeamsCache().catch(() => null);

  const [bucket, pickers] = await Promise.all([
    getGuildTeams(gid),
    listGuildPickerData(client, gid).catch(() => ({ roles: [], textChannels: [], categories: [], emojis: [] })),
  ]);

  const teams = await serializeTeamsWithUserLabels(client, guild, bucket.teams || [], pickers);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    teams,
    permKeys: TEAM_PERM_KEYS.slice(),
    defaultPerms: defaultTeamPerms(),
    quotas: { teams: teams.length, maxTeams: MAX_TEAMS, maxMembers: MAX_MEMBERS },
    pickers: {
      roles: Array.isArray(pickers?.roles) ? pickers.roles : [],
    },
  };
}

async function createDashboardTicketTeam(client?, accessToken?, guildId?, body: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const guild = await resolveGuild(client, gid);
  await ensureGuildDefaultTeam(gid, guild).catch(() => null);

  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return fail(400, "invalid_name", reasonToMessage("invalid_name"));

  const now = new Date().toISOString();
  const team = normalizeTeam({
    id: newTeamId(),
    name,
    isDefault: false,
    members: normalizeMembers(body.members),
    perms: normalizeTeamPerms(body.perms || defaultTeamPerms(), { isDefault: false }),
    createdAt: now,
    updatedAt: now,
  });

  const saved = await mutateGuildTeams(gid, (prev?) => {
    const teams = [...(prev.teams || [])];
    if (teams.length >= MAX_TEAMS) return prev;
    teams.push(team);
    return { ...prev, teams };
  });
  if (!saved.ok) {
    if ((saved.bucket?.teams || []).length >= MAX_TEAMS) {
      return fail(400, "quota_teams", reasonToMessage("quota_teams"));
    }
    return fail(500, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  }
  if (!(saved.bucket.teams || []).some((t?) => String(t.id) === String(team.id))) {
    return fail(400, "quota_teams", reasonToMessage("quota_teams"));
  }

  const pickers = await listGuildPickerData(client, gid).catch(() => ({ roles: [] }));
  const teams = await serializeTeamsWithUserLabels(client, guild, saved.bucket.teams || [], pickers);
  const created = teams.find((t?) => String(t.id) === String(team.id));
  return {
    ok: true,
    status: 200,
    guildId: gid,
    team: created || teams[0] || null,
    teams,
  };
}

async function updateDashboardTicketTeam(client?, accessToken?, guildId?, teamId?, body: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const tid = normalizeTeamId(teamId);
  if (!tid) return fail(404, "not_found", reasonToMessage("not_found"));
  const guild = await resolveGuild(client, gid);

  let updated = null;
  const saved = await mutateGuildTeams(gid, (prev?) => {
    const teams = [...(prev.teams || [])];
    const idx = teams.findIndex((t?) => String(t.id) === tid);
    if (idx < 0) return prev;
    const current = teams[idx];
    const nextName =
      body.name != null ? String(body.name || "").trim().slice(0, 80) : current.name;
    if (!nextName) return prev;
    const nextMembers =
      body.members != null || body.memberIds != null
        ? normalizeMembers(body.members != null ? body.members : body.memberIds)
        : current.members;
    const nextPerms = current.isDefault
      ? null
      : body.perms != null
        ? normalizeTeamPerms(body.perms, { isDefault: false })
        : current.perms;
    updated = normalizeTeam(
      {
        ...current,
        name: nextName,
        members: nextMembers,
        perms: nextPerms,
        updatedAt: new Date().toISOString(),
      },
      current,
    );
    teams[idx] = updated;
    return { ...prev, teams };
  });

  if (!saved.ok) return fail(500, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  if (!updated) return fail(404, "not_found", reasonToMessage("not_found"));

  const pickers = await listGuildPickerData(client, gid).catch(() => ({ roles: [] }));
  const teams = await serializeTeamsWithUserLabels(client, guild, saved.bucket.teams || [], pickers);
  const teamOut = teams.find((t?) => String(t.id) === tid) || null;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    team: teamOut,
    teams,
  };
}

async function deleteDashboardTicketTeam(client?, accessToken?, guildId?, teamId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const tid = normalizeTeamId(teamId);
  if (!tid) return fail(404, "not_found", reasonToMessage("not_found"));
  const guild = await resolveGuild(client, gid);

  let blockedDefault = false;
  let removed = false;
  const saved = await mutateGuildTeams(gid, (prev?) => {
    const teams = [...(prev.teams || [])];
    const idx = teams.findIndex((t?) => String(t.id) === tid);
    if (idx < 0) return prev;
    if (teams[idx].isDefault) {
      blockedDefault = true;
      return prev;
    }
    teams.splice(idx, 1);
    removed = true;
    return { ...prev, teams };
  });

  if (blockedDefault) {
    return fail(400, "cannot_delete_default", reasonToMessage("cannot_delete_default"));
  }
  if (!saved.ok) return fail(500, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  if (!removed) return fail(404, "not_found", reasonToMessage("not_found"));

  const pickers = await listGuildPickerData(client, gid).catch(() => ({ roles: [] }));
  const teams = await serializeTeamsWithUserLabels(client, guild, saved.bucket.teams || [], pickers);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    deletedId: tid,
    teams,
  };
}

export = {
  listDashboardTicketTeams,
  searchDashboardTicketTeamMembers,
  createDashboardTicketTeam,
  updateDashboardTicketTeam,
  deleteDashboardTicketTeam,
  TEAM_PERM_KEYS,
};
