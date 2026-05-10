const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474");
const ACCESS_GUILD_ID = "1462458562507964584";

const SOURCE_STAFF_ROLE_IDS = [
  IDs.roles?.Helper,
  IDs.roles?.Mod,
  IDs.roles?.SeniorModerator,
  IDs.roles?.Director,
].map((id) => String(id || "").trim()).filter(Boolean);

const SOURCE_HIGH_STAFF_ROLE_ID = String(IDs.roles?.HighStaff || "").trim();
const SOURCE_COMMUNITY_MANAGER_ROLE_ID = String(IDs.roles?.CommunityManager || "").trim();

const TARGET_STAFF_ROLE_ID = "1502305384814088428";
const TARGET_HIGH_STAFF_ROLE_ID = "1466489056627134587";
const TARGET_COMMUNITY_MANAGER_ROLE_ID = "1502305351083495496";

const TARGET_ROLE_IDS = [
  TARGET_STAFF_ROLE_ID,
  TARGET_HIGH_STAFF_ROLE_ID,
  TARGET_COMMUNITY_MANAGER_ROLE_ID,
].filter(Boolean);

const KICK_REASON = "Accesso riservato: staff non presente nel server principale.";

function hasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => member?.roles?.cache?.has?.(String(roleId)));
}

function buildDesiredTargetRoles(mainMember) {
  const roles = new Set();
  if (hasAnyRole(mainMember, SOURCE_STAFF_ROLE_IDS)) roles.add(TARGET_STAFF_ROLE_ID);
  if (SOURCE_HIGH_STAFF_ROLE_ID && mainMember?.roles?.cache?.has?.(SOURCE_HIGH_STAFF_ROLE_ID)) {
    roles.add(TARGET_HIGH_STAFF_ROLE_ID);
  }
  if (SOURCE_COMMUNITY_MANAGER_ROLE_ID && mainMember?.roles?.cache?.has?.(SOURCE_COMMUNITY_MANAGER_ROLE_ID)) {
    roles.add(TARGET_COMMUNITY_MANAGER_ROLE_ID);
  }
  return roles;
}

function qualifiesForAccess(mainMember) {
  return buildDesiredTargetRoles(mainMember).size > 0;
}

async function kickAccessMember(member, reason = KICK_REASON) {
  if (!member || member.user?.bot) return false;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => member);
  if (!fresh?.kickable) {
    global.logger?.warn?.("[STAFF ACCESS MIRROR] member not kickable", member.guild?.id, member.id);
    return false;
  }
  return fresh.kick(reason).then(() => true).catch((err) => {
    global.logger?.warn?.("[STAFF ACCESS MIRROR] kick failed", member.guild?.id, member.id, err?.message || err);
    return false;
  });
}

async function syncTargetMemberFromMainMember(targetMember, mainMember) {
  if (!targetMember || targetMember.user?.bot) return { ok: false, skipped: "invalid_target" };
  if (!mainMember || !qualifiesForAccess(mainMember)) {
    const kicked = await kickAccessMember(targetMember);
    return { ok: kicked, kicked };
  }

  const desired = buildDesiredTargetRoles(mainMember);
  const toAdd = TARGET_ROLE_IDS.filter((roleId) => desired.has(roleId) && !targetMember.roles.cache.has(roleId));
  const toRemove = TARGET_ROLE_IDS.filter((roleId) => !desired.has(roleId) && targetMember.roles.cache.has(roleId));

  if (toAdd.length) {
    await targetMember.roles.add(toAdd, "Sync ruoli staff dal server principale").catch((err) => {
      global.logger?.warn?.("[STAFF ACCESS MIRROR] add roles failed", targetMember.id, err?.message || err);
    });
  }
  if (toRemove.length) {
    await targetMember.roles.remove(toRemove, "Sync ruoli staff dal server principale").catch((err) => {
      global.logger?.warn?.("[STAFF ACCESS MIRROR] remove roles failed", targetMember.id, err?.message || err);
    });
  }
  return { ok: true, added: toAdd, removed: toRemove };
}

async function syncAccessMember(client, userId) {
  const uid = String(userId || "").trim();
  if (!client || !/^\d{16,20}$/.test(uid)) return { ok: false, skipped: "invalid_user" };

  const accessGuild = await getClientGuildCached(client, ACCESS_GUILD_ID).catch(() => null);
  if (!accessGuild) return { ok: false, skipped: "no_access_guild" };
  const targetMember = await getGuildMemberCached(accessGuild, uid, { preferFresh: true }).catch(() => null);
  if (!targetMember) return { ok: false, skipped: "not_in_access_guild" };

  const mainGuild = await getClientGuildCached(client, MAIN_GUILD_ID).catch(() => null);
  const mainMember = mainGuild
    ? await getGuildMemberCached(mainGuild, uid, { preferFresh: true }).catch(() => null)
    : null;
  return syncTargetMemberFromMainMember(targetMember, mainMember);
}

async function handleAccessGuildMemberAdd(member) {
  if (String(member?.guild?.id || "") !== ACCESS_GUILD_ID) return false;
  await syncAccessMember(member.client, member.id);
  return true;
}

async function handleMainGuildMemberUpdate(oldMember, newMember) {
  if (String(newMember?.guild?.id || "") !== MAIN_GUILD_ID) return;
  if (newMember?.user?.bot) return;
  await syncAccessMember(newMember.client, newMember.id);
}

async function handleMainGuildMemberRemove(member) {
  if (String(member?.guild?.id || "") !== MAIN_GUILD_ID) return;
  if (member?.user?.bot) return;
  await syncAccessMember(member.client, member.id);
}

async function sweepAccessGuild(client) {
  const accessGuild = await getClientGuildCached(client, ACCESS_GUILD_ID).catch(() => null);
  if (!accessGuild?.members?.fetch) return { scanned: 0 };
  const members = await accessGuild.members.fetch().catch(() => null);
  if (!members?.size) return { scanned: 0 };
  let scanned = 0;
  for (const member of members.values()) {
    if (!member || member.user?.bot) continue;
    scanned += 1;
    await syncAccessMember(client, member.id).catch((err) => {
      global.logger?.warn?.("[STAFF ACCESS MIRROR] sweep member failed", member.id, err?.message || err);
    });
  }
  return { scanned };
}

module.exports = {
  ACCESS_GUILD_ID,
  handleAccessGuildMemberAdd,
  handleMainGuildMemberUpdate,
  handleMainGuildMemberRemove,
  sweepAccessGuild,
  syncAccessMember,
};
