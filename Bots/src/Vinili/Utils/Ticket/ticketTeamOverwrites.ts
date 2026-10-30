const {
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  toTicketRoleCreateOverwrite,
  toTicketMemberCreateOverwrite,
} = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const {
  findGuildTeamsByIds,
  teamPermsToPermissionMap,
  normalizeTeamIdList,
} = require("../../MultiGuild/core/tenantTicketTeams") as typeof import("../../MultiGuild/core/tenantTicketTeams");

function mergePermissionMaps(maps?) {
  const out = {
    ViewChannel: true,
    ReadMessageHistory: true,
  };
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [key, value] of Object.entries(map)) {
      if (value === true) out[key] = true;
      else if (value === false && out[key] !== true) out[key] = false;
    }
  }
  return out;
}

function buildTeamPermissionOverwrites({
  guildId,
  guild,
  supportTeamIds,
  openerId,
  openerPerms,
}: any = {}) {
  const teamIds = normalizeTeamIdList(supportTeamIds, 10);
  if (!teamIds.length) return null;

  const teams = findGuildTeamsByIds(guildId, teamIds);
  if (!teams.length) return null;

  const byTarget = new Map();
  for (const team of teams) {
    const permMap = teamPermsToPermissionMap(team);
    for (const member of (team as any).members || []) {
      const type = member?.type === "user" ? "user" : "role";
      const id = String(member?.id || "").trim();
      if (!id) continue;
      const key = `${type}:${id}`;
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key).push(permMap);
    }
  }

  const everyoneId = guild?.roles?.everyone?.id || guild?.id || null;
  const overwrites = [];
  if (everyoneId) {
    overwrites.push(buildTicketEveryoneDenyViewCreateOverwrite(everyoneId));
  }
  if (openerId && openerPerms) {
    overwrites.push(buildTicketOpenerCreateOverwrite(openerId, openerPerms));
  }

  for (const [key, maps] of byTarget.entries()) {
    const [type, id] = key.split(":");
    const merged = mergePermissionMaps(maps);
    const row =
      type === "user"
        ? toTicketMemberCreateOverwrite(id, merged)
        : toTicketRoleCreateOverwrite(id, merged);
    if (row) overwrites.push(row);
  }

  return overwrites.filter(Boolean);
}

export = {
  buildTeamPermissionOverwrites,
  mergePermissionMaps,
};
