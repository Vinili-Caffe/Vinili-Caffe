const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { makeTicketErrorEmbed } = require("./ticketUxMessages") as typeof import("./ticketUxMessages");
const { TICKETS_CATEGORY_NAME } = require("./ticketCategoryUtils") as typeof import("./ticketCategoryUtils");
const { buildTicketChannelName } = require("./ticketNamingRuntime") as typeof import("./ticketNamingRuntime");
const { getTicketPanelConfig } = require("./ticketPanelConfig") as typeof import("./ticketPanelConfig");
const { memberCanAccessPerksTicket } = require("./ticketPerksStaffRoles") as typeof import("./ticketPerksStaffRoles");
const { memberCanAccessPartnershipTicket } = require("./ticketPartnershipStaffRoles") as typeof import("./ticketPartnershipStaffRoles");
const {
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  buildTicketRoleDenyViewCreateOverwrite,
  buildTicketRoleCreateOverwrite,
} = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const { resolveTicketPanel } = require("./ticketGuildOptions") as typeof import("./ticketGuildOptions");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  HIGHSTAFF_ROLE_ID,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  STAFF_ROLE_ID,
].filter(Boolean);
function hasAnyRole(member?, roleIds = []) {
  return roleIds.some((roleId?) => member?.roles?.cache?.has(roleId));
}

function canClaimTicket(member?, ticketType?, _guildId = null) {
  if (!member) return false;
  const roles = member.roles?.cache;
  if (!roles || typeof roles.has !== "function") return false;
  const isSupport = ticketType === "supporto" && hasAnyRole(member, STAFF_ROLE_IDS);
  const isPartnership = ticketType === "partnership" && memberCanAccessPartnershipTicket(member);
  const isHigh = ticketType === "high" && Boolean(HIGHSTAFF_ROLE_ID) && roles.has(HIGHSTAFF_ROLE_ID);
  const isPerks = ticketType === "perks" && memberCanAccessPerksTicket(member);
  return isSupport || isPartnership || isHigh || isPerks;
}

/* Runtime staff ticket (ex +ticket). Nessun comando Discord. */
export = {
  canClaimTicket,
};