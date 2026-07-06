const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, } = require("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime");
const {
  partnersChatPartnerCommandDeniedReplyContent,
} = require("../../Utils/Partner/partnersChatChannelUtils");
const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  expectsModal: true,
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Invia una partnership.")
    .addUserOption((option) =>
      option
        .setName("manager")
        .setDescription("L'utente con cui stai facendo la partnership.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel, { allowPartnership: true });
    if (denied) {
      await safeReply(interaction, {
        content: denied,
        flags: EPHEMERAL_FLAG,
      });
      return;
    }
    const manager = interaction.options.getUser("manager");
    if (!manager?.id) {
      await safeReply(interaction, {
        content: "<:vegax:1443934876440068179> Manager non valido.",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`partnershipModal_cmd_${interaction.user.id}_${manager.id}`)
      .setTitle("Invia Partnership");

    const descriptionInput = new TextInputBuilder()
      .setCustomId("serverDescription")
      .setLabel("Descrizione del server")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Inserisci qui la descrizione del server...")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput));

    try {
      await interaction.showModal(modal);
    } catch (error) {
      if (error?.code === 10062) return;
      await safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.",
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};