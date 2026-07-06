const IDs = require("../../Utils/Config/ids");

const guildContextCache = new Map();
const GUILD_CONTEXT_TTL_MS = 10 * 60 * 1000;

async function listMembersWithRole(guild, roleId) {
  if (!guild || !roleId) return [];
  let role = guild.roles.cache.get(String(roleId));
  if (!role) role = await guild.roles.fetch(String(roleId)).catch(() => null);
  if (!role) return [];
  return [...role.members.values()].filter((m) => !m.user?.bot);
}

function formatMemberLine(member, label) {
  const name = member?.displayName || member?.user?.globalName || member?.user?.username || member?.id;
  return `${label}: ${name} (<@${member.id}>)`;
}

async function buildGuildLiveContext(guild, client) {
  if (!guild) return "";
  const gid = String(guild.id || "");
  const cached = guildContextCache.get(gid);
  if (cached && Date.now() - cached.at < GUILD_CONTEXT_TTL_MS) {
    return cached.text;
  }

  const lines = [`Server Discord: ${guild.name || "Vinili & Caffè"} (ID ${guild.id})`];
  if (guild.memberCount) lines.push(`Membri nel server: ${guild.memberCount}`);

  const ownerId = String(guild.ownerId || "");
  if (ownerId) {
    const owner = guild.members.cache.get(ownerId) || (await guild.members.fetch(ownerId).catch(() => null));
    if (owner) lines.push(formatMemberLine(owner, "Proprietario Discord del server"));
    else lines.push(`Proprietario Discord: <@${ownerId}>`);
  }

  const roleLabels = [
    [IDs.roles.Founder, "Founder (creatori/fondatori del progetto)"],
    [IDs.roles.Manager, "Manager"],
    [IDs.roles.Admin, "Admin"],
    [IDs.roles.Director, "Director"],
    [IDs.roles.HighStaff, "High Staff"],
  ];

  for (const [roleId, label] of roleLabels) {
    const members = await listMembersWithRole(guild, roleId);
    if (!members.length) continue;
    const shown = members.slice(0, 8).map((m) => formatMemberLine(m, label));
    lines.push(...shown);
  }

  const developers = Array.isArray(client?.config?.developers)
    ? client.config.developers.map(String).filter(Boolean)
    : [];
  for (const devId of developers.slice(0, 6)) {
    const member =
      guild.members.cache.get(devId) || (await guild.members.fetch(devId).catch(() => null));
    if (member) lines.push(formatMemberLine(member, "Developer/fondatore bot (config)"));
    else lines.push(`Developer/fondatore bot (config): <@${devId}>`);
  }

  const text = lines.join("\n");
  if (gid) guildContextCache.set(gid, { at: Date.now(), text });
  return text;
}

module.exports = { buildGuildLiveContext, listMembersWithRole };