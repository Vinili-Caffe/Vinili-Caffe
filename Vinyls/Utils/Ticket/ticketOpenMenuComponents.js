const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const {
  resetPanelSelectMenu,
  payloadWithDefaultEphemeral,
  beginPanelSelectDefer,
} = require("../../../shared/discord/panelSelectMenuRuntime");

const TICKET_OPEN_MENU_CUSTOM_ID = "ticket_open_menu";

function buildTicketOpenSelectRows() {
  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_OPEN_MENU_CUSTOM_ID)
    .setPlaceholder("🎫 Seleziona una categoria...")
    .addOptions(
      { label: "SUPPORTO", description: "Supporto generale • Segnalazioni • Problemi", value: "ticket_supporto", emoji: { id: "1443651872258003005", name: "discordstaff" } },
      { label: "PARTNERSHIP", description: "Partnership", value: "ticket_partnership", emoji: { id: "1443651871125409812", name: "partneredserverowner" } },
      { label: "HIGH STAFF", description: "Donazioni • Sponsor • Amministrazione", value: "ticket_highstaff", emoji: { id: "1443670575376765130", name: "reportmessage" } },
      { label: "PERKS", description: "Verifica Selfie • Supporter • Follower", value: "ticket_perks", emoji: { id: "1482534921472835895", name: "VC_Vip" } },
    );
  return [new ActionRowBuilder().addComponents(ticketMenu)];
}

function isTicketOpenMenuSelect(interaction) {
  return (
    Boolean(interaction?.isStringSelectMenu?.()) &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "") === TICKET_OPEN_MENU_CUSTOM_ID
  );
}

async function resetTicketOpenPanelAfterInteraction(interaction) {
  if (!isTicketOpenMenuSelect(interaction)) return false;
  return resetPanelSelectMenu(interaction, buildTicketOpenSelectRows);
}

async function replyTicketOpenPanel(interaction, payload, safeReply) {
  if (isTicketOpenMenuSelect(interaction) && !interaction.replied && !interaction.deferred) {
    await resetPanelSelectMenu(interaction, buildTicketOpenSelectRows);
    return interaction.followUp(payloadWithDefaultEphemeral(payload, true)).catch(() => null);
  }
  const sent = await safeReply(interaction, payload);
  await resetTicketOpenPanelAfterInteraction(interaction);
  return sent;
}

async function deferTicketOpenPanel(interaction) {
  if (!isTicketOpenMenuSelect(interaction)) return false;
  return beginPanelSelectDefer(interaction, buildTicketOpenSelectRows, { flags: 1 << 6 });
}

module.exports = {
  TICKET_OPEN_MENU_CUSTOM_ID,
  buildTicketOpenSelectRows,
  isTicketOpenMenuSelect,
  resetTicketOpenPanelAfterInteraction,
  replyTicketOpenPanel,
  deferTicketOpenPanel,
};
