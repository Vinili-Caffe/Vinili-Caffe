const { OverwriteType } = require("discord.js") as typeof import("discord.js");
const { GuildFeatureBucket } = require("../../schemas/guildFeatureBucketSchema") as typeof import("../../schemas/guildFeatureBucketSchema");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { memberCanAccessPerksTicket } = require("./ticketPerksStaffRoles") as typeof import("./ticketPerksStaffRoles");
const { memberCanAccessPartnershipTicket } = require("./ticketPartnershipStaffRoles") as typeof import("./ticketPartnershipStaffRoles");
const { userAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const SUPPORT_TICKET_STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

function hasStaffTicketRole(member?, ticketType?) {
  if (!member?.roles?.cache) return false;
  const type = String(ticketType || "")
    .trim()
    .toLowerCase();
    if (type === "perks") {
    return memberCanAccessPerksTicket(member);
  }
  if (type === "partnership") {
    return memberCanAccessPartnershipTicket(member);
  }
  if (type === "high" || type === "highstaff") {
    try {
      const { memberHasConfiguredRole, memberHasRoleId } = require("../../../Staff/utils/staffRoleHierarchy") as typeof import("../../../Staff/utils/staffRoleHierarchy");
      if (memberHasConfiguredRole(member, "HighStaff")) return true;
      return Boolean(HIGHSTAFF_ROLE_ID && memberHasRoleId(member, HIGHSTAFF_ROLE_ID));
    } catch {
      return Boolean(HIGHSTAFF_ROLE_ID && member.roles.cache.has(HIGHSTAFF_ROLE_ID));
    }
  }
  try {
    const { memberHasRoleId } = require("../../../Staff/utils/staffRoleHierarchy") as typeof import("../../../Staff/utils/staffRoleHierarchy");
    return SUPPORT_TICKET_STAFF_ROLE_IDS.some((id?) => memberHasRoleId(member, id));
  } catch {
    return SUPPORT_TICKET_STAFF_ROLE_IDS.some((id?) => member.roles.cache.has(id));
  }
}

function isTicketOpenedByMember(ticketDoc?, memberOrUserId?) {
  const openerId = String(ticketDoc?.userId || "").trim();
  const actorId = String(memberOrUserId?.id || memberOrUserId || "").trim();
  return Boolean(openerId && actorId && openerId === actorId);
}

function memberCanActAsTicketStaff(member?, ticketDoc?) {
  if (isTicketOpenedByMember(ticketDoc, member)) return false;
  return hasStaffTicketRole(member, ticketDoc?.ticketType);
}

export = {
  hasStaffTicketRole,
  isTicketOpenedByMember,
  memberCanActAsTicketStaff,
};