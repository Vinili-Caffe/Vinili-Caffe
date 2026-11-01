/** EXP: ruoli di livello e perk (aggiunta, rimozione, correzione). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isLevelExpGuild } = require("./expLevels") as typeof import("./expLevels");
const { LEVEL_ROLE_MAP } = require("./expLevelUp") as typeof import("./expLevelUp");

const PERK_ROLE_ID = IDs.roles.PicPerms;

async function fetchGuildMember(guild?, userId?) {
  if (!guild || !userId) return null;
  return getGuildMemberCached(guild, userId);
}

function sleepMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function memberHasRoleId(member?, roleId?) {
  const rid = String(roleId || "");
  if (!member || !rid) return false;
  try {
    if (member.roles?.cache?.has(rid)) return true;
  } catch (_) {}
  try {
    const ids = member.roles?.cache?.map?.((r?) => String(r.id)) || [];
    return ids.includes(rid);
  } catch (_) {
    return false;
  }
}

async function addLevelRoleIfPossible(member?, roleId?) {
  if (!member || !roleId) return false;
  const rid = String(roleId);
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return false;
  const role = member.guild.roles.cache.get(rid) || (await getGuildRoleCached(member.guild, rid));
  if (!role || role.managed) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (memberHasRoleId(member, rid)) return true;

  let afterAdd = null;
  try {
    afterAdd = await member.roles.add(role, "EXP: level milestone");
  } catch (err) {
    if (isMemberGoneError(err)) return false;
    return false;
  }
  if (memberHasRoleId(afterAdd || member, rid)) return true;

  /* levelRoleAssign2: Discord a volte conferma l'add prima che fetch/cache vedano il ruolo */
  await sleepMs(450);
  let fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(fresh, rid)) return true;
  if (!fresh) return true;

  try {
    afterAdd = await fresh.roles.add(role, "EXP: level milestone retry");
  } catch (err) {
    if (isMemberGoneError(err)) return false;
    /* prima add senza throw → non trattare come fail permanente */
    return true;
  }
  if (memberHasRoleId(afterAdd || fresh, rid)) return true;
  await sleepMs(600);
  const again = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(again, rid)) return true;
  /* API ha accettato almeno un add: evita falso "not present after add+retry" */
  return true;
}

/** levelRoleHeal1: se livello già raggiunto ma ruolo mancante (reboot/API miss), riassegna */
async function healMissingLevelRoles(member?, level?) {
  if (!member?.guild || !Number.isFinite(Number(level))) return 0;
  const safeLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (safeLevel < 10) return 0;
  const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel <= safeLevel)
    .sort((a?, b?) => a - b);
  let mem = member;
  let healed = 0;
  for (const perkLevel of reachedPerkLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (!roleId) continue;
    if (mem.roles?.cache?.has(roleId)) continue;
    const ok = await addLevelRoleIfPossible(mem, roleId);
    if (ok) healed += 1;
    mem = (await getGuildMemberCached(mem.guild, mem.id, { preferFresh: true })) || mem;
    /* pace Discord tra milestone consecutive (L10→L20…) */
    await sleepMs(350);
  }
  return healed;
}

/** levelRoleBootHeal1: sample utenti livello≥10 al boot (non solo chi fa EXP) */
async function healLevelRolesForGuildOnStartup(guild?, { limit = 120 } = {}) {
  if (!guild?.id || !isLevelExpGuild(guild.id)) return { scanned: 0, healed: 0 };
  const safeLimit = Math.max(20, Math.min(400, Math.floor(Number(limit) || 120)));
  const rows = await ActivityUserProfile.find({
    guildId: String(guild.id),
    "profile.totals.exp.level": { $gte: 10 },
  })
    .select("userId profile.totals.exp.level")
    .sort({ "profile.totals.exp.level": -1, updatedAt: -1 })
    .limit(safeLimit)
    .lean()
    .catch(() => []);
  let scanned = 0;
  let healed = 0;
  for (const row of rows || []) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    scanned += 1;
    const level = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.level || 0)));
    const member = await getGuildMemberCached(guild, userId).catch(() => null);
    if (!member) continue;
    healed += await healMissingLevelRoles(member, level).catch(() => 0);
    if (level >= 10) await addPerkRoleIfPossible(member).catch(() => null);
  }
  return { scanned, healed };
}

function isMemberGoneError(err?) {
  const code = err?.code ?? err?.rawError?.code;
  const msg = String(err?.message ?? err?.rawError?.message ?? "").toLowerCase();
  return code === 10007 || code === 10013 || msg.includes("unknown member") || msg.includes("unknown user") || msg.includes("not found");
}

async function addPerkRoleIfPossible(member?) {
  if (!member?.guild || !PERK_ROLE_ID) return;
  const rid = String(PERK_ROLE_ID);
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return;
  const role = member.guild.roles.cache.get(rid) || (await getGuildRoleCached(member.guild, rid));
  if (!role || role.managed) return;
  if (role.position >= me.roles.highest.position) return;
  if (memberHasRoleId(member, rid)) return;
  try {
    const after = await member.roles.add(role, "EXP: perk role");
    if (memberHasRoleId(after || member, rid)) return;
  } catch (err) {
    if (isMemberGoneError(err)) return;
    return;
  }
  await sleepMs(450);
  let fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(fresh, rid) || !fresh) return;
  try {
    await fresh.roles.add(role, "EXP: perk role retry");
  } catch (_) {}
}

async function removeLevelRoleIfPossible(member?, roleId?) {
  if (!member || !roleId) return false;
  const me = member.guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return false;
  const role = member.guild.roles.cache.get(roleId) || (await getGuildRoleCached(member.guild, roleId));
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (!member.roles.cache.has(roleId)) return true;
  let err = null;
  await member.roles.remove(role).catch((e?) => { err = e; });
  if (err && isMemberGoneError(err)) return false;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  return !fresh?.roles?.cache?.has(roleId);
}

async function syncLevelRolesForMember(guild?, userId?, level?) {
  if (!guild || !userId) return [];
  const safeLevel = Math.max(0, Math.floor(Number(level || 0)));
  const member = await getGuildMemberCached(guild, userId);
  if (!member) return [];
  const awarded = [];
  const aboveLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel > safeLevel)
    .sort((a?, b?) => b - a);
  for (const perkLevel of aboveLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (roleId) await removeLevelRoleIfPossible(member, roleId);
  }
  const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel <= safeLevel)
    .sort((a?, b?) => a - b);
  let mem = await getGuildMemberCached(guild, userId, { preferFresh: true }) || member;
  for (const perkLevel of reachedPerkLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (!roleId) continue;
    const alreadyHad = Boolean(mem?.roles?.cache?.has(roleId));
    const ok = await addLevelRoleIfPossible(mem, roleId);
            if (ok && !alreadyHad) awarded.push(roleId);
    mem = (await getGuildMemberCached(guild, userId, { preferFresh: true })) || mem;
  }
  const freshMember = await getGuildMemberCached(guild, userId, { preferFresh: true });
  if (!freshMember) return awarded;
  if (safeLevel >= 10) await addPerkRoleIfPossible(freshMember);
  else {
    const { tryRevokePicPermsIfIneligible } = require("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms") as typeof import("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
    await tryRevokePicPermsIfIneligible(freshMember);
  }
  return awarded;
}

export = { fetchGuildMember, addLevelRoleIfPossible, healMissingLevelRoles, healLevelRolesForGuildOnStartup, addPerkRoleIfPossible, syncLevelRolesForMember };
