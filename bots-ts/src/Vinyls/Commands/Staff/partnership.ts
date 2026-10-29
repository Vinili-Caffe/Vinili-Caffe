const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  partnersChatPartnerCommandDeniedReplyContent,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  resolvePartnershipConfigSync,
  isPartnershipSkipManagerAllowed,
  buildSkipDeniedEmbed,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply") as typeof import("../../Utils/Partner/tenantSetupRequiredReply");
const EPHEMERAL_FLAG = 1 << 6;

function buildPartnershipModalCustomId(openerId?, managerId?, skipped?) {
  if (skipped) return `partnershipModal_cmd_${openerId}_skip`;
  return `partnershipModal_cmd_${openerId}_${managerId}`;
}

export = {
  expectsModal: true,
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Invia una partnership.")
    .addUserOption((option?) =>
      option
        .setName("manager")
        .setDescription("L'utente con cui stai facendo la partnership.")
        .setRequired(false),
    ),

  async execute(interaction?) {
    if (!isPartnershipOperational(interaction.guild?.id)) {
      await replyInteractionSetupRequired(interaction);
      return;
    }
    const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel, {
      allowPartnership: true,
    });
    if (denied) {
      await safeReply(interaction, {
        content: denied,
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const partnershipCfg = resolvePartnershipConfigSync(interaction.guild?.id);
    const isMainServer = Boolean(partnershipCfg?.legacy);
    const skipAllowed = isPartnershipSkipManagerAllowed(interaction.guild?.id);
    const manager = interaction.options.getUser("manager");
    const skipped = Boolean(!isMainServer && skipAllowed && !manager?.id);

    if (!skipped && !manager?.id) {
      if (isMainServer) {
        await safeReply(interaction, {
          content: "<:vegax:1443934876440068179> Devi indicare un **manager** valido.",
          flags: EPHEMERAL_FLAG,
        });
        return;
      }
      await safeReply(interaction, {
        embeds: [buildSkipDeniedEmbed()],
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(
        buildPartnershipModalCustomId(
          interaction.user.id,
          manager?.id || null,
          skipped,
        ),
      )
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
