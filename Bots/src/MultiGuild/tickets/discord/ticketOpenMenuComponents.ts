const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");
const {
  resetPanelSelectMenu,
} = require("../../../shared/discord/panelSelectMenuRuntime") as typeof import("../../../shared/discord/panelSelectMenuRuntime");
const {
  getTicketSettingsSync,
} = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
const {
  getGuildPanelsSync,
  ticketTypeToCustomId,
  ticketTypeLabel,
} = require("../tenant/tenantTicketPanels") as typeof import("../tenant/tenantTicketPanels");

const TICKET_OPEN_MENU_CUSTOM_ID = "ticket_open_menu";
const DEFAULT_DROPDOWN_PLACEHOLDER = "Seleziona un argomento...";

export = {
  TICKET_OPEN_MENU_CUSTOM_ID,
  DEFAULT_DROPDOWN_PLACEHOLDER,
};
