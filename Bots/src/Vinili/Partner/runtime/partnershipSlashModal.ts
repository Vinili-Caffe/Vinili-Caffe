const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");

const EPHEMERAL_FLAG = 1 << 6;

function buildPartnershipModalCustomId(openerId?, managerId?, skipped?) {
  if (skipped) return `partnershipModal_cmd_${openerId}_skip`;
  return `partnershipModal_cmd_${openerId}_${managerId}`;
}

async function showPartnershipSlashModal(interaction?, { managerId = null, skipped = false } = {}) {
  const modal = new ModalBuilder()
    .setCustomId(
      buildPartnershipModalCustomId(
        interaction.user.id,
        managerId || null,
        skipped,
      ),
    )
    .setTitle("Invia Partnership");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("serverDescription")
        .setLabel("Descrizione del server")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Inserisci qui la descrizione del server...")
        .setRequired(true),
    ),
  );

  try {
    await interaction.showModal(modal);
  } catch (error) {
    if (error?.code === 10062) return;
    await safeReply(interaction, {
      content: "<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.",
      flags: EPHEMERAL_FLAG,
    });
  }
}

export = {
  buildPartnershipModalCustomId,
  showPartnershipSlashModal,
  EPHEMERAL_FLAG,
};
