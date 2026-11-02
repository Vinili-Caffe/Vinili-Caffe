const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { PRIVATE_FLAG, parseLevelPanelComponentId, parseModalId, buildSimpleEmbed } = require("./levelPanelModalsHelpers") as typeof import("./levelPanelModalsHelpers");
const { runServerModalAction, handleServerButton, handleChannelSelect, handleRoleSelect, handleServerNav } = require("./levelPanelServerHelpers") as typeof import("./levelPanelServerHelpers");
const { runUserModal, handleUserButton } = require("./levelPanelUserHelpers") as typeof import("./levelPanelUserHelpers");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  const isComponent =
    interaction?.isButton?.() ||
    interaction?.isStringSelectMenu?.() ||
    interaction?.isChannelSelectMenu?.() ||
    interaction?.isRoleSelectMenu?.() ||
    interaction?.isModalSubmit?.();
  if (!isComponent) return false;
  return id.startsWith("level_panel:") || id.startsWith("level_panel_modal:");
}

async function execute(interaction?) {
  const modalParsed = interaction.isModalSubmit() ? parseModalId(interaction.customId) : null;
  const compParsed = interaction.isModalSubmit() ? null : parseLevelPanelComponentId(interaction.customId);
  const ownerId = String(interaction.isModalSubmit() ? modalParsed?.ownerId || "" : compParsed?.ownerId || "");
  if (ownerId && String(interaction.user?.id || "") !== ownerId) {
    const denied = { embeds: [new EmbedBuilder().setColor("#e74c3c").setDescription("<:vegax:1443934876440068179> Questo pannello non è tuo.")], flags: PRIVATE_FLAG };
    if (interaction.deferred || interaction.replied) await interaction.followUp(denied).catch(() => {});
    else await interaction.reply(denied).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit()) {
    const scope = String(modalParsed.scope || "");
    const action = String(modalParsed.action || "");
    let embed;
    if (scope === "server") {
      embed = await runServerModalAction(interaction, action);
    } else if (scope === "user") {
      embed = await runUserModal(interaction, action, modalParsed);
    } else {
      embed = buildSimpleEmbed("Level", "Scope modal non valido.");
    }
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (interaction.isButton()) {
    if (compParsed?.kind === "server_btn") {
      return handleServerButton(interaction, compParsed, ownerId);
    }
    if (compParsed?.kind === "user_btn") {
      return handleUserButton(interaction, compParsed, ownerId);
    }
    return false;
  }

  if (interaction.isChannelSelectMenu()) {
    return handleChannelSelect(interaction, compParsed, ownerId);
  }

  if (interaction.isRoleSelectMenu()) {
    return handleRoleSelect(interaction, compParsed, ownerId);
  }

  if (interaction.isStringSelectMenu()) {
    if (compParsed?.kind === "server_nav") {
      return handleServerNav(interaction, ownerId);
    }
  }

  return false;
}

export = { name: "levelPanel", order: 11, match, execute };
