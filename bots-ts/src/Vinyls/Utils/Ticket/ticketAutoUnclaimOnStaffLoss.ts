const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { buildTicketFlowRich } = require("./ticketUxMessages") as typeof import("./ticketUxMessages");
const { isComponentsV2Message } = require("../Embeds/vcPageEmbedV2") as typeof import("../Embeds/vcPageEmbedV2");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { PERKS_STAFF_ROLE_IDS } = require("./ticketPerksStaffRoles") as typeof import("./ticketPerksStaffRoles");
const { applyPartnershipTicketRoleOverwrites } = require("./ticketPartnershipStaffRoles") as typeof import("./ticketPartnershipStaffRoles");
const {
  HIGHSTAFF_ROLE_ID,
  TICKET_STAFF_SPECTATE_OVERWRITES,
  applyHighStaffTicketWriteOverwrite,
  applyTicketStaffRoleOverwrites,
  editTicketRoleOverwrite,
} = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { buildTicketControlButtons, resolveTicketPanel } = require("./ticketGuildOptions") as typeof import("./ticketGuildOptions");
const TICKET_ROLE_UNCLAIMED_SPECTATE = TICKET_STAFF_SPECTATE_OVERWRITES;

function buildTicketPanelUnclaimedButtonRow(guildId?, ticketDoc?) {
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

async function applyChannelPermissionOverwritesAfterUnclaim(channel?, ticketType?) {
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

async function refreshTicketPanelMessageUnclaimed(channel?, ticketDoc?) {
  const panelMid = ticketDoc?.messageId != null ? String(ticketDoc.messageId).trim() : "";
  const guildId = String(ticketDoc?.guildId || channel?.guild?.id || "").trim();
  const ticketButtonsOriginal = buildTicketPanelUnclaimedButtonRow(guildId, ticketDoc);
  const fallbackPayload = buildTicketFlowRich({
    title: "<:VC_Ticket:1482535175283019888> • **__TICKET APERTO__**",
    description: "<:VC_claim:1478517202016669887> Ticket non claimato",
    rows: [ticketButtonsOriginal],
  });
  if (!channel?.messages?.fetch) return;
  let msg = null;
  if (panelMid) {
    msg = await channel.messages.fetch(panelMid).catch(() => null);
  }
  if (!msg) {
    const sent = await channel
      .send(fallbackPayload)
      .catch(() => null);
    if (sent?.id && ticketDoc?._id) {
      await Ticket.updateOne({ _id: ticketDoc._id }, { $set: { messageId: sent.id } }).catch(() => {});
    }
    return;
  }
  const editPayload = buildTicketFlowRich({
    title: "<:VC_Ticket:1482535175283019888> • **__TICKET APERTO__**",
    description: "<:VC_claim:1478517202016669887> Ticket non claimato",
    rows: [ticketButtonsOriginal],
  });
  if (isComponentsV2Message(msg)) {
    await msg.edit(editPayload).catch(() => {});
    return;
  }
  await msg
    .edit({
      embeds: [],
      components: [ticketButtonsOriginal],
    })
    .catch(() => {});
}

async function autoUnclaimOpenTicketsClaimedByUser(guild?, formerClaimantUserId?, options: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(formerClaimantUserId || "").trim();
  if (!gid || !uid) return;
  const bucket = await GuildFeatureBucket.findOne({ guildId: gid }).catch(() => null);
  if (!bucket?.tickets?.length) return;
  const claimed = bucket.tickets.filter((t?) => {
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
    await channel
      .send(
        buildTicketFlowRich({
          title: "<:VC_Ticket:1482535175283019888> • **__CLAIM RIMOSSO__**",
          description:
            `<:VC_claim:1478517202016669887> Il ticket non è più in carico a <@${uid}> ${reasonText}.\n\n` +
            "È di nuovo disponibile il pulsante **Claim**.",
        }),
      )
      .catch(() => {});
  }
}

export = {
  buildTicketPanelUnclaimedButtonRow,
  autoUnclaimOpenTicketsClaimedByUser,
  applyChannelPermissionOverwritesAfterUnclaim,
  refreshTicketPanelMessageUnclaimed,
};