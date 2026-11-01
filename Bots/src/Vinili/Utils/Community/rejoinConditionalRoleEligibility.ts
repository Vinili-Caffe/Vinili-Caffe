const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { hasMatchingTag } = require("../../Services/Community/clanTagRoleService") as typeof import("../../Services/Community/clanTagRoleService");
const { getAnnouncedBoostSlots, ensureBoostSlotsSynced, setAnnouncedBoostSlots, persistAnnouncedBoostSlotsToDb } = require("./boostSlotAnnounceTracker") as typeof import("./boostSlotAnnounceTracker");
const { textHasSupporterStatusLink, normalizeSupporterStatusText } = require("./supporterStatusLink") as typeof import("./supporterStatusLink");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");

function collectGuildedRoleIds(_client?) {
  const ids = new Set();
  const main = String(IDs.roles?.Guilded || "").trim();
  if (main) ids.add(main);
  return ids;
}

function memberHasSupporterInviteInPresence(member?) {
  const presence = member?.presence;
  if (!presence || ["offline", "invisible"].includes(String(presence.status || ""))) return false;
  const activities = Array.isArray(presence.activities) ? presence.activities : [];
  const blob = activities
    .flatMap((a?) => [a?.name, a?.state, a?.details, a?.url].filter(Boolean))
    .map((s?) => normalizeSupporterStatusText(s))
    .join(" ");
  return textHasSupporterStatusLink(blob);
}

async function memberEligibleForDoubleBoosterRejoin(member?) {
  if (!member?.guild?.id || !member?.id) return false;
  if (String(member.guild.id) !== MAIN_GUILD_ID) return false;
  await ensureBoostSlotsSynced(member.guild.id, member.id).catch(() => null);
  const slots = getAnnouncedBoostSlots(member.guild.id, member.id);
  if (slots < 2) return false;
  return Boolean(member.premiumSinceTimestamp);
}

async function memberEligibleForFanRejoin(member?) {
  return memberHasSupporterInviteInPresence(member);
}

async function memberEligibleForGuildedRejoin(member?) {
  const match = await hasMatchingTag(member, member.client, null, { refreshFromApi: true }).catch(() => null);
  return Boolean(match && match.type === "native");
}

async function isRoleEligibleForRejoinRestore(member?, roleId?) {
  const rid = String(roleId || "").trim();
  if (!rid || !member) return true;
  const doubleId = String(IDs.roles?.DoubleBooster || "").trim();
  const fanId = String(IDs.roles?.Fan || "").trim();
  if (doubleId && rid === doubleId) return memberEligibleForDoubleBoosterRejoin(member);
  if (fanId && rid === fanId) return memberEligibleForFanRejoin(member);
  if (collectGuildedRoleIds(member.client).has(rid)) return memberEligibleForGuildedRejoin(member);
  return true;
}

async function filterRoleIdsEligibleForRejoinRestore(member?, roleIds?) {
  const unique = Array.from(new Set((Array.isArray(roleIds) ? roleIds : []).map((id?) => String(id || "").trim()).filter(Boolean)));
  if (!member || !unique.length) return [];
  const eligible = [];
  for (const roleId of unique) {
    if (await isRoleEligibleForRejoinRestore(member, roleId)) eligible.push(roleId);
  }
  return eligible;
}

async function resetBoostSlotsIfNotBoosting(member?) {
  if (!member?.guild?.id || !member?.id) return;
  if (String(member.guild.id) !== MAIN_GUILD_ID) return;
  if (member.premiumSinceTimestamp) return;
  setAnnouncedBoostSlots(member.guild.id, member.id, 0);
  await persistAnnouncedBoostSlotsToDb(member.guild.id, member.id).catch(() => null);
}

async function sanitizeConditionalRolesAfterRejoin(member?) {
  if (!member?.roles?.cache || member.user?.bot) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return;
  const roleIds = [
    String(IDs.roles?.DoubleBooster || "").trim(),
    String(IDs.roles?.Fan || "").trim(),
    ...collectGuildedRoleIds(member.client),
  ].filter(Boolean);
  for (const roleId of roleIds) {
    if (!member.roles.cache.has(roleId)) continue;
    if (await isRoleEligibleForRejoinRestore(member, roleId)) continue;
    const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId).catch(() => null));
    if (!role || role.managed || role.position >= me.roles.highest.position) continue;
    await member.roles.remove(roleId).catch(() => null);
  }
  await resetBoostSlotsIfNotBoosting(member);
}

export = { collectGuildedRoleIds, memberHasSupporterInviteInPresence, filterRoleIdsEligibleForRejoinRestore, sanitizeConditionalRolesAfterRejoin, resetBoostSlotsIfNotBoosting };