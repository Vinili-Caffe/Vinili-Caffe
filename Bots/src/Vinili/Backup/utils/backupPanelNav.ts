const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const PANEL_PREFIX = "backup_panel";
const SECTION_HOME = "home";

function formatBackupPanelSelectCustomId(ownerId?) {
  return `${PANEL_PREFIX}:select:${ownerId}`;
}

function parseBackupPanelSelectCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3 || parts[0] !== PANEL_PREFIX || parts[1] !== "select") return null;
  const ownerId = String(parts[2] || "");
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { ownerId };
}

function buildBackupPanelNavRow(ownerId?, currentSection?) {
  const o = String(ownerId);
  const sec = String(currentSection || SECTION_HOME).toLowerCase();
  const opts = [
    { label: "Home", value: SECTION_HOME, emoji: E.VC_Rule, default: sec === SECTION_HOME },
    { label: "Crea backup", value: "create", emoji: E.success, default: sec === "create" },
    { label: "Lista backup", value: "list", emoji: E.VC_InactiveStatus, default: sec === "list" },
    { label: "Info backup", value: "info", emoji: E.VC_Info, default: sec === "info" },
    { label: "Carica backup", value: "load", emoji: E.VC_Loading__969578, default: sec === "load" },
    { label: "Elimina backup", value: "delete", emoji: E.VC_purge, default: sec === "delete" },
    { label: "Stato caricamento", value: "status", emoji: E.VC_Stats, default: sec === "status" },
    { label: "Annulla caricamento", value: "cancel", emoji: E.cancel, default: sec === "cancel" },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatBackupPanelSelectCustomId(o))
      .setPlaceholder(`${E.VC_InactiveStatus} Centro backup`)
      .addOptions(opts),
  );
}

export = {
  PANEL_PREFIX,
  SECTION_HOME,
  parseBackupPanelSelectCustomId,
  buildBackupPanelNavRow,
};