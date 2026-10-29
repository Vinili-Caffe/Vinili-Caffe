const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { resolveJoinGateConfiguredExempt } = require("../../Services/Moderation/joinGateExemptUtils") as typeof import("../../Services/Moderation/joinGateExemptUtils");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const MEMBER_ROLE_ID = String(IDs.roles?.Member || "");

const SEPARATOR_ROLE_IDS = new Set(
  Object.entries(IDs.roles || {})
    .filter(([key]) => /^separatore\d+$/i.test(String(key || "")))
    .map(([, id]) => String(id || "").trim())
    .filter(Boolean),
);

function memberHasMemberPlusSeparator(member?) {
  if (!member?.roles?.cache || !MEMBER_ROLE_ID) return false;
  if (!member.roles.cache.has(MEMBER_ROLE_ID)) return false;
  for (const id of SEPARATOR_ROLE_IDS) {
    if (member.roles.cache.has(id)) return true;
  }
  return false;
}

function normalVerificationCompletedBetween(oldMember?, newMember?) {
  return !memberHasMemberPlusSeparator(oldMember) && memberHasMemberPlusSeparator(newMember);
}

async function shouldSendPublicMemberAnnouncement(member?) {
    if (!member?.user || member.user.bot) return false;
  if (!MAIN_GUILD_ID || String(member.guild?.id || "") !== MAIN_GUILD_ID) return true;
  if (await resolveJoinGateConfiguredExempt(member.guild, member.id, member)) return true;
  return memberHasMemberPlusSeparator(member);
}

export = {
  MAIN_GUILD_ID,
  MEMBER_ROLE_ID,
  SEPARATOR_ROLE_IDS,
  memberHasMemberPlusSeparator,
  normalVerificationCompletedBetween,
  shouldSendPublicMemberAnnouncement,
};