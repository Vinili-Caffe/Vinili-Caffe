const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const PANEL_PREFIX = "backup_panel";
const SECTION_HOME = "home";

function formatBackupPanelSelectCustomId(ownerId) {
  return `${PANEL_PREFIX}:select:${ownerId}`;
}

function parseBackupPanelSelectCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3 || parts[0] !== PANEL_PREFIX || parts[1] !== "select") return null;
  const ownerId = String(parts[2] || "");
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { ownerId };
}

function buildBackupPanelNavRow(ownerId, currentSection) {
  const o = String(ownerId);
  const sec = String(currentSection || SECTION_HOME).toLowerCase();
  const opts = [
    { label: "Home", value: SECTION_HOME, default: sec === SECTION_HOME },
    { label: "Crea backup", value: "create", default: sec === "create" },
    { label: "Lista backup", value: "list", default: sec === "list" },
    { label: "Info backup", value: "info", default: sec === "info" },
    { label: "Carica backup", value: "load", default: sec === "load" },
    { label: "Elimina backup", value: "delete", default: sec === "delete" },
    { label: "Stato caricamento", value: "status", default: sec === "status" },
    { label: "Annulla caricamento", value: "cancel", default: sec === "cancel" },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatBackupPanelSelectCustomId(o))
      .setPlaceholder("Centro backup")
      .addOptions(opts),
  );
}

module.exports = {
  PANEL_PREFIX,
  SECTION_HOME,
  formatBackupPanelSelectCustomId,
  parseBackupPanelSelectCustomId,
  buildBackupPanelNavRow,
};