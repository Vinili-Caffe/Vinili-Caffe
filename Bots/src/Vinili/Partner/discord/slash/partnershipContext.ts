const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js") as typeof import("discord.js");
const {
  partnersChatPartnerCommandDeniedReplyContent,
} = require("../../../Partner/runtime/partnersChatChannelUtils") as typeof import("../../../Partner/runtime/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  memberCanExecutePartnership,
  resolvePartnershipConfigSync,
  shouldApplyMainPartnershipFilters,
} = require("../../../Partner/core/partnershipConfigResolver") as typeof import("../../../Partner/core/partnershipConfigResolver");
const {
  executeTenantPartnership,
  normalizePartnershipDescription,
} = require("../../services/tenantPartnershipExecuteService") as typeof import("../../services/tenantPartnershipExecuteService");
const { hasRequiredDiscordInviteLink } = require("../../../Partner/runtime/partnershipMessageUtils") as typeof import("../../../Partner/runtime/partnershipMessageUtils");
const { replyInteractionSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");

const EPHEMERAL = MessageFlags.Ephemeral;

export = {
  publicReply: true,
  data: new ContextMenuCommandBuilder()
    .setName("Partner messaggio")
    .setType(ApplicationCommandType.Message),

  async execute(interaction?) {
    const guildId = interaction.guild?.id;
    if (shouldApplyMainPartnershipFilters(guildId)) {
      await interaction.reply({
        content:
          "<:vegax:1443934876440068179> Sul server principale usa il flusso partnership del canale dedicato (non questo menu).",
        flags: EPHEMERAL,
      });
      return;
    }

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

    if (!memberCanExecutePartnership(interaction.member, guildId)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Ti serve il **ruolo Partner Manager** (o **Gestisci server**) per usare **Partnership**.",
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
