const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { getResocontoReviewerUserIdsForSegment } = require("../../../Utils/Staff/resocontoAccess") as typeof import("../../../Utils/Staff/resocontoAccess");
const {
  DEFAULT_TEAM_SEED,
  newTeamId,
  normalizeTeam,
  mutateGuildTeams,
  ensureGuildDefaultTeam,
  getGuildTeams,
  refreshTicketTeamsCache,
} = require("../tenant/tenantTicketTeams") as typeof import("../tenant/tenantTicketTeams");
const { mutateGuildPanels, normalizeSingle, getGuildPanels } = require("../tenant/tenantTicketPanels") as typeof import("../tenant/tenantTicketPanels");

function isMainGuild(guildId?) {
  const main = String(IDs.guilds?.main || "").trim();
  return main && String(guildId || "").trim() === main;
}

const MAIN_TEAM_DEFS = [
  {
    seedKey: "main:supporto",
    name: "Supporto",
    roleIds: () => [IDs.roles.Staff, IDs.roles.HighStaff].filter(Boolean),
    panelSeedKey: "main:supporto",
  },
  {
    seedKey: "main:partnership",
    name: "Partnership",
    roleIds: () => [IDs.roles.PartnerManager, IDs.roles.HighStaff].filter(Boolean),
        userIds: () => getResocontoReviewerUserIdsForSegment("pm"),
    panelSeedKey: "main:partnership",
  },
  {
    seedKey: "main:high",
    name: "High Staff",
    roleIds: () => [IDs.roles.HighStaff].filter(Boolean),
    panelSeedKey: "main:high",
  },
  {
    seedKey: "main:perks",
    name: "Perks",
    roleIds: () =>
      [IDs.roles.SeniorModerator, IDs.roles.Director, IDs.roles.HighStaff].filter(Boolean),
    panelSeedKey: "main:perks",
  },
];

function membersFromDef(def?) {
  const out = [];
  const seen = new Set();
  const push = (type?, id?) => {
    const sid = String(id || "").trim();
    if (!/^\d{16,22}$/.test(sid)) return;
    const key = `${type}:${sid}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type, id: sid });
  };
  for (const id of def.roleIds?.() || []) push("role", id);
  for (const id of def.userIds?.() || []) push("user", id);
  return out;
}

function mergeMissingSeedMembers(existingMembers?, seedMembers?) {
  const current = Array.isArray(existingMembers) ? [...existingMembers] : [];
  const seen = new Set(
    current.map((m?) => `${m?.type === "user" ? "user" : "role"}:${String(m?.id || "")}`),
  );
  let changed = false;
  for (const m of seedMembers || []) {
    const type = m?.type === "user" ? "user" : "role";
    const id = String(m?.id || "").trim();
    if (!id) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    current.push({ type, id });
    seen.add(key);
    changed = true;
  }
  return { members: current, changed };
}

async function ensureMainTicketTeamsSeeded(options: Record<string, any> = {}) {
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!mainGuildId) return { ok: false, reason: "missing_main_guild" };

  const guild =
    options.client?.guilds?.cache?.get(mainGuildId) ||
    (await options.client?.guilds?.fetch?.(mainGuildId).catch(() => null));

  await ensureGuildDefaultTeam(mainGuildId, guild).catch(() => null);

  const now = new Date().toISOString();
  const teamsResult = await mutateGuildTeams(mainGuildId, (prev?) => {
    const teams = [...(prev.teams || [])];
    const bySeed = new Map(teams.filter((t?) => t.seedKey).map((t?) => [String(t.seedKey), t]));
    let touched = false;

    for (const def of MAIN_TEAM_DEFS) {
      const seedMembers = membersFromDef(def);
      const existing = bySeed.get(def.seedKey);
      if (existing) {
                const merged = mergeMissingSeedMembers(existing.members, seedMembers);
        if (!merged.changed) continue;
        const idx = teams.findIndex((t?) => String(t.id) === String(existing.id));
        if (idx < 0) continue;
        const updated = normalizeTeam(
          {
            ...existing,
            members: merged.members,
            updatedAt: now,
          },
          existing,
        );
        teams[idx] = updated;
        bySeed.set(def.seedKey, updated);
        touched = true;
        continue;
      }
      const created = normalizeTeam({
        id: newTeamId(),
        name: def.name,
        seedKey: def.seedKey,
        isDefault: false,
        members: seedMembers,
        createdAt: now,
        updatedAt: now,
      });
      teams.push(created);
      bySeed.set(def.seedKey, created);
      touched = true;
    }

    if (!touched && prev.syncedAt) return prev;
    return { ...prev, teams, syncedAt: now };
  });

  if (!teamsResult.ok) return teamsResult;

  const teamBySeed = new Map(
    (teamsResult.bucket.teams || [])
      .filter((t?) => t.seedKey)
      .map((t?) => [String(t.seedKey), t]),
  );

  const panelsResult = await mutateGuildPanels(mainGuildId, (prev?) => {
    const singles = [...(prev.singles || [])];
    let changed = false;
    for (const def of MAIN_TEAM_DEFS) {
      const team: any = teamBySeed.get(def.seedKey);
      if (!team) continue;
      const idx = singles.findIndex((s?) => String(s.seedKey || "") === String(def.panelSeedKey));
      if (idx < 0) continue;
      const current = singles[idx];
      const currentIds = Array.isArray(current.supportTeamIds) ? current.supportTeamIds.map(String) : [];
      if (currentIds.includes(String(team.id))) continue;
      singles[idx] = normalizeSingle({
        ...current,
        supportTeamIds: [team.id],
        updatedAt: now,
      });
      changed = true;
    }
    if (!changed) return prev;
    return { ...prev, singles, syncedAt: now };
  });

  await refreshTicketTeamsCache().catch(() => null);

  return {
    ok: true,
    guildId: mainGuildId,
    teams: teamsResult.bucket,
    panels: panelsResult.ok ? panelsResult.bucket : await getGuildPanels(mainGuildId),
  };
}

async function syncGuildTicketTeamsFromLegacy(client?, guildId?, options: Record<string, any> = {}) {
  if (isMainGuild(guildId)) {
    return ensureMainTicketTeamsSeeded({ client, ...options });
  }
  const guild =
    client?.guilds?.cache?.get(String(guildId)) ||
    (await client?.guilds?.fetch?.(String(guildId)).catch(() => null));
  await ensureGuildDefaultTeam(guildId, guild).catch(() => null);
  const bucket = await getGuildTeams(guildId);
  return { ok: true, guildId: String(guildId), teams: bucket };
}

export = {
  MAIN_TEAM_DEFS,
  DEFAULT_TEAM_SEED,
  ensureMainTicketTeamsSeeded,
  syncGuildTicketTeamsFromLegacy,
};
