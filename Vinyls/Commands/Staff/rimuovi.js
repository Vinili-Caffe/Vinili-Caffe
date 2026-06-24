const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require("discord.js");
const { isPartnershipDescriptionMessage, resolvePartnerManagerUserIdFromMessage } = require("../../Utils/Partner/partnerPointContextUtils");
const EPHEMERAL = MessageFlags.Ephemeral;
const IN_RULE = "regolaViolata";

module.exports = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Rimuovi")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
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
          "<a:VC_Cross:1482532424570376253> Usa **Rimuovi** solo sul **messaggio di descrizione** di una partner nel canale partnership (non sul messaggio di ringraziamento).",
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
        `partner_rimuovi_m:${interaction.user.id}:${pmUserId}:${targetMessage.id}:${targetMessage.channelId}`,
      )
      .setTitle("Rimuovi punto partner");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(IN_RULE)
          .setLabel("Regola violata")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Indica la regola violata dalla partner")
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    await interaction.showModal(modal);
  },
};