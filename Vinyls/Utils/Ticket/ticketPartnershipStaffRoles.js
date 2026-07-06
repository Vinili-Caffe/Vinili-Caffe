const { PermissionFlagsBits } = require("discord.js");
const IDs = require("../Config/ids");
const { getResocontoReviewerUserIdsForSegment } = require("../Staff/resocontoAccess");

const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const RESOCONTO_PM_REVIEWER_USER_IDS = getResocontoReviewerUserIdsForSegment("pm");

const PARTNERSHIP_TICKET_STAFF_ROLE_IDS = [PARTNERMANAGER_ROLE_ID, HIGHSTAFF_ROLE_ID]
  .filter(Boolean)
  .map(String);

const PARTNERSHIP_TICKET_SPECTATE_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
];

const PARTNERSHIP_TICKET_SPECTATE_DENY = [PermissionFlagsBits.SendMessages];

const PARTNERSHIP_TICKET_REVIEWER_SPECTATE = Object.freeze({
  ViewChannel: true,
  SendMessages: false,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
});

function buildPartnershipTicketReviewerCreateOverwrites() {
  return RESOCONTO_PM_REVIEWER_USER_IDS.map((userId) => ({
    id: userId,
    allow: PARTNERSHIP_TICKET_SPECTATE_ALLOW,
    deny: PARTNERSHIP_TICKET_SPECTATE_DENY,
  }));
}

async function applyPartnershipTicketReviewerOverwrites(channel) {
  if (!channel?.permissionOverwrites?.edit) return;
  for (const userId of RESOCONTO_PM_REVIEWER_USER_IDS) {
    await channel.permissionOverwrites
      .edit(userId, PARTNERSHIP_TICKET_REVIEWER_SPECTATE)
      .catch(() => null);
  }
}

async function syncOpenPartnershipTicketReviewerAccess(client) {
  const Ticket = require("../../Schemas/Ticket/ticketSchema");
  const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
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
    await applyPartnershipTicketReviewerOverwrites(channel);
    synced += 1;
  }
  if (synced > 0) {
    global.logger?.info?.(`[TICKET PARTNERSHIP] Reviewer access sync: ${synced} ticket`);
  }
  return { ok: true, synced };
}

function memberCanAccessPartnershipTicket(member) {
  const uid = String(member?.id || "").trim();
  if (uid && RESOCONTO_PM_REVIEWER_USER_IDS.includes(uid)) return true;
  if (!member?.roles?.cache) return false;
  return PARTNERSHIP_TICKET_STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

module.exports = {
  PARTNERMANAGER_ROLE_ID,
  HIGHSTAFF_ROLE_ID,
  RESOCONTO_PM_REVIEWER_USER_IDS,
  PARTNERSHIP_TICKET_STAFF_ROLE_IDS,
  PARTNERSHIP_TICKET_REVIEWER_SPECTATE,
  buildPartnershipTicketReviewerCreateOverwrites,
  applyPartnershipTicketReviewerOverwrites,
  syncOpenPartnershipTicketReviewerAccess,
  memberCanAccessPartnershipTicket,
};
