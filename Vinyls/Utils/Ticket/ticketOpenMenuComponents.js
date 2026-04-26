const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const TICKET_OPEN_MENU_CUSTOM_ID = "ticket_open_menu";

function buildTicketOpenSelectRows() {
  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_OPEN_MENU_CUSTOM_ID)
    .setPlaceholder("🎫 Seleziona una categoria...")
    .addOptions(
      { label: "SUPPORTO", description: "Supporto generale • Segnalazioni • Problemi", value: "ticket_supporto", emoji: { id: "1443651872258003005", name: "discordstaff" } },
      { label: "PARTNERSHIP", description: "Partnership", value: "ticket_partnership", emoji: { id: "1443651871125409812", name: "partneredserverowner" } },
      { label: "HIGH STAFF", description: "Verifica Selfie • Donazioni • Sponsor • High Staff", value: "ticket_highstaff", emoji: { id: "1443670575376765130", name: "reportmessage" } },
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

/**
 * Dopo una scelta dal menu ticket, Discord lascia spesso la voce “evidenziata”.
 * Sostituendo i componenti il select torna al placeholder (niente selezione fantasma).
 */
async function resetTicketOpenPanelAfterInteraction(interaction) {
  if (!isTicketOpenMenuSelect(interaction)) return;
  const msg = interaction.message;
  if (!msg || typeof msg.edit !== "function") return;
  try {
    const embeds = Array.isArray(msg.embeds) && msg.embeds.length ? [...msg.embeds] : [];
    await msg.edit({
      embeds,
      components: buildTicketOpenSelectRows(),
    });
  } catch (e) {
    global.logger?.warn?.("[ticketOpenMenu] reset panel:", e?.message || e);
  }
}

module.exports = {
  TICKET_OPEN_MENU_CUSTOM_ID,
  buildTicketOpenSelectRows,
  isTicketOpenMenuSelect,
  resetTicketOpenPanelAfterInteraction,
};