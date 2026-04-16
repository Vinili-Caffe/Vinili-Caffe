const IDs = require("../Config/ids");
const { resolveJoinGateConfiguredExempt } = require("../../Services/Moderation/joinGateExemptUtils");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const VERIFICATION_ROLE_IDS = new Set(
  [IDs.roles?.Verificato, IDs.roles?.Verificata].filter(Boolean).map(String),
);

function memberHasVerificationRole(member) {
  if (!member?.roles?.cache) return false;
  for (const id of VERIFICATION_ROLE_IDS) {
    if (member.roles.cache.has(id)) return true;
  }
  return false;
}

function verificationRoleAddedBetween(oldMember, newMember) {
  if (!oldMember?.roles?.cache || !newMember?.roles?.cache) return false;
  for (const id of VERIFICATION_ROLE_IDS) {
    if (!oldMember.roles.cache.has(id) && newMember.roles.cache.has(id)) return true;
  }
  return false;
}

async function shouldSendPublicMemberAnnouncement(member) {
  if (!member?.user || member.user.bot) return true;
  if (!MAIN_GUILD_ID || String(member.guild?.id || "") !== MAIN_GUILD_ID) return true;
  if (await resolveJoinGateConfiguredExempt(member.guild, member.id, member)) return true;
  return memberHasVerificationRole(member);
}

module.exports = {
  MAIN_GUILD_ID,
  VERIFICATION_ROLE_IDS,
  memberHasVerificationRole,
  verificationRoleAddedBetween,
  shouldSendPublicMemberAnnouncement,
};