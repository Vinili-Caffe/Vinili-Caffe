const { SlashCommandBuilder, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  shouldApplyMainPartnershipFilters,
} = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../utils/Partner/tenantSetupRequiredReply") as typeof import("../../utils/Partner/tenantSetupRequiredReply");
const {
  memberCanManageTenantPartnershipSettings,
  TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
} = require("../../utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../utils/Partner/tenantPartnershipAdminAccess");
const { normalizePartnershipLogId } = require("../../../Utils/Partner/partnershipLogMessageUtils") as typeof import("../../../Utils/Partner/partnershipLogMessageUtils");
const { deletePartnershipByGlobalLogId } = require("../../services/Partner/tenantPartnershipDeleteService") as typeof import("../../services/Partner/tenantPartnershipDeleteService");

const EPHEMERAL = MessageFlags.Ephemeral;

export = {
  publicReply: true,
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Elimina risorse partnership.")
    .addSubcommand((sub?) =>
      sub
        .setName("partnership")
        .setDescription("Elimina una partnership tramite ID log.")
        .addIntegerOption((option?) =>
          option
            .setName("id")
            .setDescription("ID partnership (quello nel canale log)")
            .setRequired(true)
            .setMinValue(1),
        ),
    ),

  async execute(interaction?) {
    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand !== "partnership") return;

    const guild = interaction.guild;
    if (!guild?.id) {
      await safeReply(interaction, {
        content: "<a:VC_Cross:1482532424570376253> Comando disponibile solo in un server.",
        flags: EPHEMERAL,
      });
      return;
    }

    if (shouldApplyMainPartnershipFilters(guild.id)) {
      await safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Sul server principale usa il **sito staff** (punti PM / punti tolti) per rimuovere punti e partnership.",
        flags: EPHEMERAL,
      });
      return;
    }

    if (!isPartnershipOperational(guild.id)) {
      await replyInteractionSetupRequired(interaction);
      return;
    }

    if (!memberCanManageTenantPartnershipSettings(interaction.member, guild)) {
      await safeReply(interaction, {
        content: TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
        flags: EPHEMERAL,
      });
      return;
    }

    const partnershipId = normalizePartnershipLogId(interaction.options.getInteger("id"));
    if (!partnershipId) {
      await safeReply(interaction, {
        content: "<a:VC_Cross:1482532424570376253> Inserisci un **ID partnership** valido.",
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.deferReply().catch(() => null);

    try {
      const result = await deletePartnershipByGlobalLogId(
        guild,
        partnershipId,
        interaction.user.id,
        interaction.client,
      );

      if (!result?.ok) {
        await interaction.editReply({
          content:
            "<a:VC_Cross:1482532424570376253> Nessuna partnership trovata con quell'**ID** su questo server.",
        }).catch(() => null);
        return;
      }

      await interaction.editReply({
        content: "<a:VC_Events:1482706144953897223> **Partner** eliminata con **successo**!",
      }).catch(() => null);
    } catch (err) {
      global.logger?.error?.("[delete partnership] failed:", err?.stack || err?.message || err);
      await interaction.editReply({
        content:
          "<a:VC_Cross:1482532424570376253> Errore durante l'eliminazione. Riprova tra poco.",
      }).catch(() => null);
    }
  },
};
