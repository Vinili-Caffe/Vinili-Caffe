const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("./securityProfilesService") as typeof import("./securityProfilesService");

const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);

async function resolveJoinGateConfiguredExempt(guild?, userId?, member = null) {
  const uid = String(userId || "");
  if (!uid) return false;
  if (CORE_EXEMPT_USER_IDS.has(uid)) return true;
  if (String(guild?.ownerId || "") === uid) return true;
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), uid)) return true;
  const resolved = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
  return Boolean(resolved && hasAdminsProfileCapability(resolved, "fullImmunity"));
}

export = {
  CORE_EXEMPT_USER_IDS,
  resolveJoinGateConfiguredExempt,
};