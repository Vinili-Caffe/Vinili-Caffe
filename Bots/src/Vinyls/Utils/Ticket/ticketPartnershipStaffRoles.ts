const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getResocontoReviewerUserIdsForSegment } = require("../Staff/resocontoAccess") as typeof import("../Staff/resocontoAccess");

const { getPartnerManagerRoleId } = require("../Partner/partnershipConfigResolver") as typeof import("../Partner/partnershipConfigResolver");
const { memberHasRoleId, memberHasConfiguredRole } = require("../Staff/staffRoleHierarchy") as typeof import("../Staff/staffRoleHierarchy");
const {
  applyTicketStaffRoleOverwrites,
  buildTicketMemberCreateOverwrite,
  editTicketMemberOverwrite,
  editTicketRoleOverwrite,
} = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const RESOCONTO_PM_REVIEWER_USER_IDS = getResocontoReviewerUserIdsForSegment("pm");

const PARTNERSHIP_TICKET_STAFF_ROLE_IDS = [PARTNERMANAGER_ROLE_ID, HIGHSTAFF_ROLE_ID]
  .filter(Boolean)
  .map(String);

const PARTNERSHIP_TICKET_REVIEWER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands,
];

const PARTNERSHIP_TICKET_REVIEWER_OVERWRITES = Object.freeze({
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
  UseApplicationCommands: true,
});

function buildPartnershipTicketReviewerCreateOverwrites() {
  return RESOCONTO_PM_REVIEWER_USER_IDS
    .map((userId?) =>
      buildTicketMemberCreateOverwrite(userId, { allow: PARTNERSHIP_TICKET_REVIEWER_ALLOW }),
    )
    .filter(Boolean);
}

async function clearPartnershipTicketPermissionOverwrites(channel?) {
  if (!channel?.permissionOverwrites?.edit) return;
  const roleHideFromTicket = { ViewChannel: false };
  for (const roleId of PARTNERSHIP_TICKET_STAFF_ROLE_IDS) {
    if (roleId === HIGHSTAFF_ROLE_ID) continue;
    await editTicketRoleOverwrite(channel, roleId, roleHideFromTicket);
  }
  for (const userId of RESOCONTO_PM_REVIEWER_USER_IDS) {
    await channel.permissionOverwrites.delete(userId).catch(() => null);
  }
}

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

async function syncOpenPartnershipTicketReviewerAccess(client?) {
  const Ticket = require("../../Schemas/Ticket/ticketSchema");
  const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild" };
  if (!RESOCONTO_PM_REVIEWER_USER_IDS.length) return { ok: true, synced: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const openTickets = await Ticket.find(
    {
      guildId,
      open: true,
      ticketType: "partnership",
    },
    { channelId: 1 },
  )
    .lean()
    .catch(() => []);
  let synced = 0;
  for (const row of openTickets || []) {
    const channelId = String(row?.channelId || "").trim();
    if (!channelId) continue;
    const channel =
      guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (!channel?.permissionOverwrites?.edit) continue;
    await applyPartnershipTicketRoleOverwrites(channel);
    synced += 1;
  }
  if (synced > 0) {
    global.logger?.info?.(`[TICKET PARTNERSHIP] Reviewer access sync: ${synced} ticket`);
  }
  return { ok: true, synced };
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
    const { memberIsHighStaffEligible } = require("../Staff/staffRoleHierarchy") as typeof import("../Staff/staffRoleHierarchy");
    if (memberIsHighStaffEligible(member)) return true;
  } catch {
      }
  return memberIsResocontoPmReviewer(member);
}

function memberHasTicketElevatedClosePrivileges(member?, ticketDoc = null) {
    if (
    ticketDoc &&
    String(ticketDoc?.userId || "").trim() &&
    String(ticketDoc.userId) === String(member?.id || "")
  ) {
    return false;
  }
  if (memberHasConfiguredRole(member, "HighStaff") || memberHasRoleId(member, HIGHSTAFF_ROLE_ID)) return true;
  if (!memberIsResocontoPmReviewer(member)) return false;
  if (!ticketDoc) return true;
  return String(ticketDoc?.ticketType || "").trim() === "partnership";
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
  RESOCONTO_PM_REVIEWER_USER_IDS,
  PARTNERSHIP_TICKET_STAFF_ROLE_IDS,
  PARTNERSHIP_TICKET_REVIEWER_OVERWRITES,
  buildPartnershipTicketReviewerCreateOverwrites,
  applyPartnershipTicketReviewerOverwrites,
  applyPartnershipTicketRoleOverwrites,
  clearPartnershipTicketPermissionOverwrites,
  syncOpenPartnershipTicketReviewerAccess,
  getPartnershipTicketStaffRoleIds,
  memberIsResocontoPmReviewer,
  memberCanManagePartnerManagers,
  memberHasTicketElevatedClosePrivileges,
  memberCanAccessPartnershipTicket,
};
