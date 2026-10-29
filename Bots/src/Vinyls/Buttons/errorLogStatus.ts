const { EmbedBuilder, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");

const ERROR_STATUS_IDS = new Set(["error_pending", "error_solved", "error_unsolved"]);
const PRIVATE = 1 << 6;

function match(interaction?) {
  return interaction?.isButton?.() && ERROR_STATUS_IDS.has(String(interaction.customId || ""));
}

async function execute(interaction?) {
  if (!match(interaction)) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.",
        flags: PRIVATE,
      })
      .catch(() => null);
    return true;
  }

  const msg = interaction.message;
  const baseEmbed = msg?.embeds?.[0];
  if (!baseEmbed) {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }

  const updatedEmbed = EmbedBuilder.from(baseEmbed);
  let statusText = "";
  if (interaction.customId === "error_pending") {
    updatedEmbed.setColor(0xf1c40f);
    statusText = "In risoluzione";
  } else if (interaction.customId === "error_solved") {
    updatedEmbed.setColor(0x2ecc71);
    statusText = "Risolto";
  } else if (interaction.customId === "error_unsolved") {
    updatedEmbed.setColor(0xe74c3c);
    statusText = "Irrisolto";
  }
  if (statusText) updatedEmbed.setFooter({ text: `Stato: ${statusText}` });

  await interaction
    .update({
      embeds: [updatedEmbed],
      components: msg.components,
    })
    .catch(() => null);
  return true;
}

export = { name: "errorLogStatus", order: 30, match, execute, ERROR_STATUS_IDS };
