const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");

const SERVER_BTN_MODAL = { gmulti: "gmulti", event: "multiplier", role_multi_set: "role_multi_set", role_multi_remove: "role_multi_remove" };
const SERVER_MODAL_TITLE = { multiplier: "Boost temporaneo", gmulti: "Moltiplicatore globale", lock: "Blocca canale", unlock: "Sblocca canale", ignore: "Ignora ruolo", unignore: "Non ignorare ruolo", role_multi_set: "Moltiplicatore per ruolo", role_multi_remove: "Rimuovi moltiplicatore ruolo" };
const PRIVATE_FLAG = 1 << 6;

function parseLevelPanelComponentId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "level_panel") return null;
  if (parts[1] === "server_nav") return { kind: "server_nav", ownerId: parts[2] || "" };
  if (parts[1] === "server_ch") return { kind: "server_ch", action: parts[2] || "", ownerId: parts[3] || "" };
  if (parts[1] === "server_role") return { kind: "server_role", action: parts[2] || "", ownerId: parts[3] || "" };
  if (parts[1] === "server_btn") return { kind: "server_btn", action: parts[2] || "", ownerId: parts[3] || "" };
  if (parts[1] === "user_btn") return { kind: "user_btn", action: parts[2] || "", ownerId: parts[3] || "", targetId: parts[4] || "" };
  return null;
}

function parseModalId(customId?) {
  const parts = String(customId || "").split(":");
  return { root: parts[0] || "", scope: parts[1] || "", action: parts[2] || "", ownerId: parts[3] || "", targetId: parts[4] || "" };
}

function asInt(value?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function fmtDate(dateValue?) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", { hour12: false });
}

function buildModal(scope?, action?, ownerId?, targetId = "") {
  const baseId = `level_panel_modal:${scope}:${action}:${ownerId}${targetId ? `:${targetId}` : ""}`;
  const titleAction = scope === "server" ? (SERVER_MODAL_TITLE[action] || action) : action;
  const modal = new ModalBuilder().setCustomId(baseId).setTitle(`Level ${scope} • ${titleAction}`);
  const rows = [];
  const pushInput = (customId?, label?, placeholder?, required = true) => {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(required)
        .setPlaceholder(placeholder || ""),
    ));
  };
  if (scope === "server") {
    if (action === "lock" || action === "unlock") pushInput("target", "Canale", "#canale oppure id");
    if (action === "ignore" || action === "unignore") pushInput("target", "Ruolo", "@ruolo oppure id");
    if (action === "multiplier") {
      pushInput("value", "Moltiplicatore", "es. 2");
      pushInput("minutes", "Durata minuti", "es. 60", false);
    }
    if (action === "gmulti") pushInput("value", "Moltiplicatore globale", "es. 2");
    if (action === "role_multi_set") {
      pushInput("target", "Ruolo", "@ruolo oppure id");
      pushInput("value", "Moltiplicatore", "es. 2 o 1.25");
    }
    if (action === "role_multi_remove") pushInput("target", "Ruolo", "@ruolo oppure id");
  } else {
    if (action === "set") {
      pushInput("mode", "Tipo", "exp oppure level");
      pushInput("value", "Valore", "es. 10000");
    }
    if (action === "add" || action === "remove") pushInput("value", "Livelli", "es. 2");
  }
  return modal.addComponents(...rows);
}

function buildSimpleEmbed(title?, description?) {
  return new EmbedBuilder().setColor("#6f4e37").setTitle(title).setDescription(description);
}

export = {
  SERVER_BTN_MODAL,
  PRIVATE_FLAG,
  parseLevelPanelComponentId,
  parseModalId,
  asInt,
  fmtDate,
  buildModal,
  buildSimpleEmbed,
};
