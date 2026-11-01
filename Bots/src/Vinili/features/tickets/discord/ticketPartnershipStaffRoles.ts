const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { getResocontoReviewerUserIdsForSegment } = require("../../../Utils/Staff/resocontoAccess") as typeof import("../../../Utils/Staff/resocontoAccess");

const { getPartnerManagerRoleId } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
const { memberHasRoleId } = require("../../../Utils/Staff/staffRoleHierarchy") as typeof import("../../../Utils/Staff/staffRoleHierarchy");
const {
  applyTicketStaffRoleOverwrites,
  editTicketMemberOverwrite,
} = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const RESOCONTO_PM_REVIEWER_USER_IDS = getResocontoReviewerUserIdsForSegment("pm");

const PARTNERSHIP_TICKET_STAFF_ROLE_IDS = [PARTNERMANAGER_ROLE_ID, HIGHSTAFF_ROLE_ID]
  .filter(Boolean)
  .map(String);

const PARTNERSHIP_TICKET_REVIEWER_OVERWRITES = Object.freeze({
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
  UseApplicationCommands: true,
});

async function applyPartnershipTicketReviewerOverwrites(channel?) {
  if (!channel?.permissionOverwrites?.edit) return;
  for (const userId of RESOCONTO_PM_REVIEWER_USER_IDS) {
    await editTicketMemberOverwrite(channel, userId, PARTNERSHIP_TICKET_REVIEWER_OVERWRITES);
  }
}

async function applyPartnershipTicketRoleOverwrites(channel?) {
  if (!channel?.permissionOverwrites?.edit) return;
  const guildId = channel.guild?.id;
  await applyTicketStaffRoleOverwrites(channel, getPartnershipTicketStaffRoleIds(guildId));
  await applyPartnershipTicketReviewerOverwrites(channel);
}

function getPartnershipTicketStaffRoleIds(guildId?) {
  const pmRoleId = getPartnerManagerRoleId(guildId) || PARTNERMANAGER_ROLE_ID;
  return [pmRoleId, HIGHSTAFF_ROLE_ID].filter(Boolean).map(String);
}

function memberIsResocontoPmReviewer(member?) {
  const uid = String(member?.id || "").trim();
  return Boolean(uid && RESOCONTO_PM_REVIEWER_USER_IDS.includes(uid));
}

function memberCanManagePartnerManagers(member?) {
  if (!member) return false;
  try {
    const { memberIsHighStaffEligible } = require("../../../Utils/Staff/staffRoleHierarchy") as typeof import("../../../Utils/Staff/staffRoleHierarchy");
    if (memberIsHighStaffEligible(member)) return true;
  } catch {
      }
  return memberIsResocontoPmReviewer(member);
}

function memberCanAccessPartnershipTicket(member?) {
  const uid = String(member?.id || "").trim();
  if (uid && RESOCONTO_PM_REVIEWER_USER_IDS.includes(uid)) return true;
  if (!member?.roles?.cache) return false;
  const roleIds = getPartnershipTicketStaffRoleIds(member?.guild?.id);
  return roleIds.some((roleId?) => memberHasRoleId(member, roleId));
}

export = {
  PARTNERMANAGER_ROLE_ID,
  HIGHSTAFF_ROLE_ID,
  applyPartnershipTicketRoleOverwrites,
  memberIsResocontoPmReviewer,
  memberCanManagePartnerManagers,
  memberCanAccessPartnershipTicket,
};
