const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const {
  partnersChatPartnerCommandDeniedReplyContent,
} = require("../../Utils/Partner/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  resolvePartnershipConfigSync,
  shouldApplyMainPartnershipFilters,
} = require("../../Utils/Partner/partnershipConfigResolver");
const {
  executeTenantPartnership,
  normalizePartnershipDescription,
} = require("../../Services/Partner/tenantPartnershipExecuteService");
const { hasRequiredDiscordInviteLink } = require("../../Utils/Partner/partnershipMessageUtils");
const { replyInteractionSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");

const EPHEMERAL = MessageFlags.Ephemeral;

module.exports = {
  publicReply: true,
  data: new ContextMenuCommandBuilder()
    .setName("Partnership")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!isPartnershipOperational(guildId)) {
      await replyInteractionSetupRequired(interaction);
      return;
    }

    const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel, {
      allowPartnership: true,
    });
    if (denied) {
      await interaction.reply({
        content: denied,
        flags: EPHEMERAL,
      });
      return;
    }

    if (!memberHasPartnerManagerRole(interaction.member, guildId)) {
      const isMain = shouldApplyMainPartnershipFilters(guildId);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              isMain
                ? "<a:VC_Alert:1482706673176150077> Non hai i permessi per fare partnership."
                : "<:vegax:1443934876440068179> Ti serve il **ruolo Partner Manager** (o **Gestisci server**) per usare **Partnership**.",
            ),
        ],
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

    const rawContent = String(targetMessage.content || "").trim();
    if (!rawContent) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<a:VC_Alert:1482706673176150077> Il messaggio selezionato non contiene una **descrizione** testuale.",
            ),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    const author = targetMessage.author;
    if (!author?.id || author.bot) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<a:VC_Alert:1482706673176150077> Il **manager** deve essere l'autore del messaggio (utente reale, non un bot).",
            ),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    const description = normalizePartnershipDescription(
      rawContent,
      resolvePartnershipConfigSync(guildId),
    );

    if (!hasRequiredDiscordInviteLink(description)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<a:VC_Alert:1482706673176150077> Il messaggio deve contenere un **link d'invito Discord** valido (`discord.gg/...` o `discord.com/invite/...`).",
            ),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.deferReply().catch(() => {});
    await executeTenantPartnership(interaction, {
      description,
      managerId: author.id,
      skipped: false,
    });
  },
};
