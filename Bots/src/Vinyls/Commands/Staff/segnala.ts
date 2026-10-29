const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { isPartnershipDescriptionMessage, resolvePartnerManagerUserIdFromMessage, buildPartnerPointModalCustomId } = require("../../Utils/Partner/partnerPointContextUtils") as typeof import("../../Utils/Partner/partnerPointContextUtils");
const { shouldApplyMainPartnershipFilters } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const EPHEMERAL = MessageFlags.Ephemeral;
const IN_RULE = "regolaViolata";
const SEGNALA_MODAL_PREFIX = "psig_m:";

export = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Segnala")
    .setType(ApplicationCommandType.Message),

  async execute(interaction?) {
    if (!shouldApplyMainPartnershipFilters(interaction.guild?.id)) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> **Segnala** è disponibile solo sul server principale.",
        flags: EPHEMERAL,
      });
      return;
    }
    const targetMessage = interaction.targetMessage;
    if (!targetMessage?.id || !interaction.guild) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> Messaggio non valido.",
        flags: EPHEMERAL,
      });
      return;
    }
    if (!isPartnershipDescriptionMessage(targetMessage)) {
      await interaction.reply({
        content:
          "<a:VC_Cross:1482532424570376253> Usa **Segnala** solo sul **messaggio di descrizione** di una partner nel canale partnership (non sul messaggio di ringraziamento).",
        flags: EPHEMERAL,
      });
      return;
    }
    const pmUserId = await resolvePartnerManagerUserIdFromMessage(interaction.guild.id, targetMessage.id);
    if (!pmUserId) {
      await interaction.reply({
        content:
          "<a:VC_Cross:1482532424570376253> Non trovo il Partner Manager collegato a questa partner.",
        flags: EPHEMERAL,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(
        buildPartnerPointModalCustomId(
          SEGNALA_MODAL_PREFIX,
          interaction.user.id,
          pmUserId,
          targetMessage.id,
          targetMessage.channelId,
        ),
      )
      .setTitle("Segnala partner");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(IN_RULE)
          .setLabel("Regola violata")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Es. Non fare partnership con lo stesso server più di una volta al giorno")
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    await interaction.showModal(modal);
  },
};