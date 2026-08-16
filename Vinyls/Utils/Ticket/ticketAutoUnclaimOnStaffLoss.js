const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids");
const { PERKS_STAFF_ROLE_IDS } = require("./ticketPerksStaffRoles");
const { applyPartnershipTicketRoleOverwrites } = require("./ticketPartnershipStaffRoles");
const {
  HIGHSTAFF_ROLE_ID,
  TICKET_STAFF_SPECTATE_OVERWRITES,
  applyHighStaffTicketWriteOverwrite,
  applyTicketStaffRoleOverwrites,
  editTicketRoleOverwrite,
} = require("./ticketHighStaffOverwrites");
const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { buildTicketControlButtons, resolveTicketPanel } = require("./ticketGuildOptions");
const TICKET_ROLE_UNCLAIMED_SPECTATE = TICKET_STAFF_SPECTATE_OVERWRITES;

function buildTicketPanelUnclaimedButtonRow(guildId, ticketDoc) {
  const panel = resolveTicketPanel(guildId, ticketDoc);
  return (
    buildTicketControlButtons(guildId, panel) ||
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setEmoji(`<:VC_Lock:1482526739044368476>`).setLabel("Chiudi").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji(`<:VC_reason:1478517122929004544>`).setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("claim_ticket").setEmoji("🙋‍♂️").setLabel("Claim").setStyle(ButtonStyle.Success),
    )
  );
}


async function applyChannelPermissionOverwritesAfterUnclaim(channel, ticketType) {
  const ROLE_STAFF = IDs.roles.Staff;
  const ROLE_HIGHSTAFF = IDs.roles.HighStaff;
  const ROLE_PARTNERMANAGER = IDs.roles.PartnerManager;
  if (!channel?.permissionOverwrites) return;
  if (ticketType === "supporto") {
    if (ROLE_STAFF) {
      await editTicketRoleOverwrite(channel, ROLE_STAFF, TICKET_ROLE_UNCLAIMED_SPECTATE);
    }
    await applyHighStaffTicketWriteOverwrite(channel, ROLE_HIGHSTAFF);
    if (ROLE_PARTNERMANAGER) {
      await editTicketRoleOverwrite(channel, ROLE_PARTNERMANAGER, { ViewChannel: false });
    }
  } else if (ticketType === "partnership") {
    await applyPartnershipTicketRoleOverwrites(channel);
    if (ROLE_STAFF) {
      await editTicketRoleOverwrite(channel, ROLE_STAFF, { ViewChannel: false });
    }
  } else if (ticketType === "high") {
    if (ROLE_HIGHSTAFF) {
      await editTicketRoleOverwrite(channel, ROLE_HIGHSTAFF, TICKET_ROLE_UNCLAIMED_SPECTATE);
    }
    if (ROLE_STAFF) {
      await editTicketRoleOverwrite(channel, ROLE_STAFF, { ViewChannel: false });
    }
    if (ROLE_PARTNERMANAGER) {
      await editTicketRoleOverwrite(channel, ROLE_PARTNERMANAGER, { ViewChannel: false });
    }
  } else if (ticketType === "perks") {
    await applyTicketStaffRoleOverwrites(channel, PERKS_STAFF_ROLE_IDS);
    if (ROLE_STAFF) {
      await editTicketRoleOverwrite(channel, ROLE_STAFF, { ViewChannel: false });
    }
    if (ROLE_PARTNERMANAGER) {
      await editTicketRoleOverwrite(channel, ROLE_PARTNERMANAGER, { ViewChannel: false });
    }
  }
}

async function refreshTicketPanelMessageUnclaimed(channel, ticketDoc) {
  const panelMid = ticketDoc?.messageId != null ? String(ticketDoc.messageId).trim() : "";
  const guildId = String(ticketDoc?.guildId || channel?.guild?.id || "").trim();
  const ticketButtonsOriginal = buildTicketPanelUnclaimedButtonRow(guildId, ticketDoc);
  const fallbackEmbed = new EmbedBuilder()
    .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET APERTO__**")
    .setDescription("<:VC_claim:1478517202016669887> Ticket non claimato")
    .setColor("#6f4e37");
  if (!channel?.messages?.fetch) return;
  let msg = null;
  if (panelMid) {
    msg = await channel.messages.fetch(panelMid).catch(() => null);
  }
  if (!msg) {
    const sent = await channel
      .send({
        embeds: [fallbackEmbed],
        components: [ticketButtonsOriginal],
      })
      .catch(() => null);
    if (sent?.id && ticketDoc?._id) {
      await Ticket.updateOne({ _id: ticketDoc._id }, { $set: { messageId: sent.id } }).catch(() => {});
    }
    return;
  }
  const embedUsato = msg.embeds && msg.embeds[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder();
  embedUsato
    .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET APERTO__**")
    .setDescription("<:VC_claim:1478517202016669887> Ticket non claimato")
    .setColor("#6f4e37");
  await msg
    .edit({
      embeds: [embedUsato],
      components: [ticketButtonsOriginal],
    })
    .catch(() => {});
}

/**
 * Dopo depex / uscita staff: rimuove claim DB, overwrite sul canale e ripristina il pannello ticket (come unclaim manuale).
 * @param {{ reason?: string }} [options]
 */
async function autoUnclaimOpenTicketsClaimedByUser(guild, formerClaimantUserId, options = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(formerClaimantUserId || "").trim();
  if (!gid || !uid) return;
  const bucket = await GuildFeatureBucket.findOne({ guildId: gid }).catch(() => null);
  if (!bucket?.tickets?.length) return;
  const claimed = bucket.tickets.filter((t) => {
    if (!t || !t.open) return false;
    const c = t.claimedBy != null ? String(t.claimedBy).trim() : "";
    return c === uid;
  });
  if (!claimed.length) return;
  const reasonText =
    String(options?.reason || "").trim() || "perché non ha più i ruoli staff sul server";
  for (const tSub of claimed) {
    const ticketId = tSub?._id;
    if (!ticketId) continue;
    const unclaimedTicket = await Ticket.findOneAndUpdate(
      { _id: ticketId, open: true, claimedBy: uid },
      { $set: { claimedBy: null } },
      { new: true },
    ).catch(() => null);
    if (!unclaimedTicket) continue;
    const channelId = String(unclaimedTicket.channelId || "").trim();
    if (!channelId) continue;
    const channel = (await getGuildChannelCached(guild, channelId)) || guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.()) continue;
    await channel.permissionOverwrites.delete(uid).catch(() => {});
    await applyChannelPermissionOverwritesAfterUnclaim(channel, unclaimedTicket.ticketType);
    await refreshTicketPanelMessageUnclaimed(channel, unclaimedTicket);
    const notice = new EmbedBuilder()
      .setTitle("<:VC_Ticket:1482535175283019888> • **__CLAIM RIMOSSO__**")
      .setDescription(
        `<:VC_claim:1478517202016669887> Il ticket non è più in carico a <@${uid}> ${reasonText}.\n\n` +
          "È di nuovo disponibile il pulsante **Claim**.",
      )
      .setColor("#6f4e37");
    await channel.send({ embeds: [notice] }).catch(() => {});
  }
}

module.exports = {
  buildTicketPanelUnclaimedButtonRow,
  autoUnclaimOpenTicketsClaimedByUser,
  applyChannelPermissionOverwritesAfterUnclaim,
  refreshTicketPanelMessageUnclaimed,
};