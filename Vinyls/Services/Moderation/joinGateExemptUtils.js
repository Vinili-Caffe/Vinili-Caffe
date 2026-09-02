const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("./securityProfilesService");

const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);

function isSponsorJoinGateGuildId(guildId) {
  const g = String(guildId || "").trim();
  if (!g) return false;
  const list = Array.isArray(IDs.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : [];
  return list.some((id) => String(id || "").trim() === g);
}

async function resolveJoinGateConfiguredExempt(guild, userId, member = null) {
  const uid = String(userId || "");
  if (!uid) return false;
  if (CORE_EXEMPT_USER_IDS.has(uid)) return true;
  if (String(guild?.ownerId || "") === uid) return true;
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), uid)) return true;
  const resolved = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
  return Boolean(resolved && hasAdminsProfileCapability(resolved, "fullImmunity"));
}

module.exports = {
  CORE_EXEMPT_USER_IDS,
  isSponsorJoinGateGuildId,
  resolveJoinGateConfiguredExempt,
};