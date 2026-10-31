const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
} = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { isPartnershipOperational, shouldApplyMainPartnershipFilters } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");
const {
  memberCanManageTenantPartnershipSettings,
  TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { deletePartnershipFromContextMessage } = require("../../MultiGuild/services/Partner/tenantPartnershipDeleteService") as typeof import("../../MultiGuild/services/Partner/tenantPartnershipDeleteService");
const { isPartnershipDeleteContextChannel } = require("../../Utils/Partner/partnershipLogMessageUtils") as typeof import("../../Utils/Partner/partnershipLogMessageUtils");
const {
  resolveMainPartnershipRemoveTarget,
  buildMainPartnershipRemoveModal,
} = require("../../Utils/Partner/partnerPointContextUtils") as typeof import("../../Utils/Partner/partnerPointContextUtils");

const EPHEMERAL = MessageFlags.Ephemeral;

async function executeTenantPartnershipDelete(interaction?) {
  const guild = interaction.guild;
  const targetMessage = interaction.targetMessage;
  if (!targetMessage?.id) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Messaggio non valido.",
      flags: EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply().catch(() => null);

  try {
    const result = await deletePartnershipFromContextMessage(
      guild,
      targetMessage,
      interaction.user.id,
      interaction.client,
    );

    if (!result?.ok) {
      await interaction.editReply({
        content:
          "<a:VC_Cross:1482532424570376253> Non riesco a identificare la **partnership** da questo messaggio. Seleziona la **descrizione**, il messaggio **PARTNER EFFETTUATA** o un log con **ID**.",
      }).catch(() => null);
      return;
    }

    await interaction.editReply({
      content: "<a:VC_Events:1482706144953897223> **Partner** eliminata con **successo**!",
    }).catch(() => null);
  } catch (err) {
    global.logger?.error?.("[delete partnership context] failed:", err?.stack || err?.message || err);
    await interaction.editReply({
      content:
        "<a:VC_Cross:1482532424570376253> Errore durante l'eliminazione. Riprova tra poco.",
    }).catch(() => null);
  }
}

export = {
  expectsModal: true,
  publicReply: true,
  data: new ContextMenuCommandBuilder()
    .setName("Elimina partnership")
    .setType(ApplicationCommandType.Message),

  async execute(interaction?) {
    const guild = interaction.guild;
    if (!guild?.id) {
      await safeReply(interaction, {
        content: "<a:VC_Cross:1482532424570376253> Comando disponibile solo in un server.",
        flags: EPHEMERAL,
      });
      return;
    }

    if (!isPartnershipOperational(guild.id)) {
      await replyInteractionSetupRequired(interaction);
      return;
    }

    if (!isPartnershipDeleteContextChannel(interaction.channel, guild.id)) {
      await safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Usa **Elimina partnership** nel **canale partnership** configurato (o nel canale log).",
        flags: EPHEMERAL,
      });
      return;
    }

    if (shouldApplyMainPartnershipFilters(guild.id)) {
      const targetMessage = interaction.targetMessage;
      if (!targetMessage?.id) {
        await safeReply(interaction, {
          content: "<a:VC_Cross:1482532424570376253> Messaggio non valido.",
          flags: EPHEMERAL,
        });
        return;
      }

      const target = await resolveMainPartnershipRemoveTarget(guild, targetMessage);
      if (!target?.pmUserId) {
        await safeReply(interaction, {
          content:
            "<a:VC_Cross:1482532424570376253> Non riesco a identificare la **partnership** da questo messaggio. Seleziona la **descrizione**, il messaggio **PARTNER EFFETTUATA** o un log con **ID**.",
          flags: EPHEMERAL,
        });
        return;
      }

      await interaction.showModal(buildMainPartnershipRemoveModal(interaction, target));
      return;
    }

    if (
      !isViniliFullFeatureGuild(guild.id) &&
      !memberCanManageTenantPartnershipSettings(interaction.member, guild)
    ) {
      await safeReply(interaction, {
        content: TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
        flags: EPHEMERAL,
      });
      return;
    }

    await executeTenantPartnershipDelete(interaction);
  },
};
