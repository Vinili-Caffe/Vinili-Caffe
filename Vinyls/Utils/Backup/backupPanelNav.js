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
    { label: "Home", value: SECTION_HOME, emoji: "<a:VC_Rule:1482706839928967280>", default: sec === SECTION_HOME },
    { label: "Crea backup", value: "create", emoji: "<:success:1461731530333229226>", default: sec === "create" },
    { label: "Lista backup", value: "list", emoji: "<:VC_InactiveStatus:1482526984234860574>", default: sec === "list" },
    { label: "Info backup", value: "info", emoji: "<:VC_Info:1482526956703580372>", default: sec === "info" },
    { label: "Carica backup", value: "load", emoji: "<a:VC_Loading:1482526818278969578>", default: sec === "load" },
    { label: "Elimina backup", value: "delete", emoji: "<:VC_purge:1478861828271636561>", default: sec === "delete" },
    { label: "Stato caricamento", value: "status", emoji: "<:VC_Stats:1482527532682055780>", default: sec === "status" },
    { label: "Annulla caricamento", value: "cancel", emoji: "<:cancel:1461730653677551691>", default: sec === "cancel" },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatBackupPanelSelectCustomId(o))
      .setPlaceholder("<:VC_InactiveStatus:1482526984234860574> Centro backup")
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