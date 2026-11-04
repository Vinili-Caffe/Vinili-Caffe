const {
  addPartnerPoints,
  removePartnerPoints,
  formatPartnerPointsChange,
} = require("../../../Staff/utils/partnerPointsUtils") as typeof import("../../../Staff/utils/partnerPointsUtils");
const {
  POINTS_ADD_PREFIX,
  POINTS_REMOVE_PREFIX,
  POINTS_MODAL_PREFIX,
  POINTS_AMOUNT_INPUT_ID,
  MAX_POINTS_AMOUNT,
  parseTenantPointsControlId,
  canManageTenantPoints,
  buildTenantPointsModal,
  buildTenantPointsPayload,
  parsePointsAmount,
} = require("../../tenant/tenantPointsRuntime") as typeof import("../../tenant/tenantPointsRuntime");
const { safeMessageEdit } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  schedulePartnersDeniedDeleteReply,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const { resolvePointsCustomLogChannelId } = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { resolveTenantLanguageForInteraction } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");

const EPHEMERAL = 1 << 6;

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && (id.startsWith(POINTS_ADD_PREFIX) || id.startsWith(POINTS_REMOVE_PREFIX))) {
    return true;
  }
  return interaction?.isModalSubmit?.() && id.startsWith(POINTS_MODAL_PREFIX);
}

async function replyEphemeral(interaction?, content?) {
  const payload = { content, flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

async function validatePointsControl(interaction?, parsed?) {
  if (!parsed || !interaction.guild) return { ok: false, reason: "invalid" };

  const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel).catch(() => null);
  if (denied) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: denied, flags: EPHEMERAL }).catch(() => {});
    } else {
      await interaction.reply({ content: denied, flags: EPHEMERAL }).catch(() => {});
      schedulePartnersDeniedDeleteReply(interaction);
    }
    return { ok: false, reason: "denied" };
  }

  if (String(interaction.guild.id) !== parsed.guildId) {
    await replyEphemeral(interaction, `${E.VC_Cross} Pulsante non valido per questo server.`);
    return { ok: false, reason: "guild" };
  }

  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyEphemeral(interaction, `${E.vegax} Solo chi ha avviato la modifica punti può confermare.`);
    return { ok: false, reason: "owner" };
  }

  const actorMember =
    interaction.member ||
    (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  const targetMember = await interaction.guild.members.fetch(parsed.targetUserId).catch(() => null);

  if (!canManageTenantPoints(actorMember, targetMember, interaction.guild.id)) {
    await replyEphemeral(
      interaction,
      `${E.VC_Cross} Solo un **Amministratore** può modificare i punti di un **Partner Manager**.`,
    );
    return { ok: false, reason: "perms" };
  }

  return { ok: true, actorMember, targetMember };
}

async function refreshPointsPanel(interaction?, parsed?, actorMember?, lang?) {
  const payload = await buildTenantPointsPayload(interaction.client, interaction.guild, {
    userId: parsed.targetUserId,
    ownerId: parsed.ownerId,
    requesterMember: actorMember,
    lang,
  });
  await safeMessageEdit(interaction.message, payload, interaction).catch(() => null);
}

export = {
  name: "tenantPoints",
  order: 13,
  match,
  async execute(interaction?) {
    const parsed = parseTenantPointsControlId(interaction.customId);
    if (!parsed) return false;

    if (interaction.isButton?.()) {
      const check = await validatePointsControl(interaction, parsed);
      if (!check.ok) return true;
      const lang = await resolveTenantLanguageForInteraction(interaction, parsed.ownerId);
      const modal = buildTenantPointsModal(
        parsed.action,
        parsed.guildId,
        parsed.targetUserId,
        parsed.ownerId,
        lang,
      );
      await interaction.showModal(modal).catch(async () => {
        await replyEphemeral(interaction, `${E.VC_Cross} Impossibile aprire il modulo.`);
      });
      return true;
    }

    if (!interaction.isModalSubmit?.()) return false;

    const check = await validatePointsControl(interaction, parsed);
    if (!check.ok) return true;

    const lang = await resolveTenantLanguageForInteraction(interaction, parsed.ownerId);
    const rawAmount = interaction.fields?.getTextInputValue?.(POINTS_AMOUNT_INPUT_ID);
    const amount = parsePointsAmount(rawAmount);
    if (!amount) {
      await replyEphemeral(
        interaction,
        `${E.VC_Cross} Inserisci un numero valido tra **1** e **${MAX_POINTS_AMOUNT}**.`,
      );
      return true;
    }

    await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});

    if (parsed.action === "add") {
      const staffData = await addPartnerPoints(interaction.guild.id, parsed.targetUserId, amount, {
        client: interaction.client,
        guild: interaction.guild,
      });
      if (!staffData) {
        await interaction.editReply({
          content: `${E.VC_Cross} Impossibile aggiungere i punti.`,
        }).catch(() => {});
        return true;
      }
      await refreshPointsPanel(interaction, parsed, check.actorMember, lang);
      await interaction.editReply({
        content: `${E.success} **Punti aggiunti con successo!**\n**Points:** ${amount}`,
      }).catch(() => {});
      return true;
    }

    const staffData = await removePartnerPoints(interaction.guild.id, parsed.targetUserId, amount);
    if (!staffData) {
      await interaction.editReply({
        content: `${E.VC_Cross} Nessun punto da rimuovere.`,
      }).catch(() => {});
      return true;
    }

    const removedAmount = Math.max(0, Math.floor(Number(staffData?._partnerPointsRemoved ?? amount) || 0));
    const logChannelId = resolvePointsCustomLogChannelId(interaction.guild.id);
    if (logChannelId && removedAmount > 0) {
      const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel?.isTextBased?.()) {
        await logChannel
          .send({
            content: `${E["981353partner"]} <@${parsed.targetUserId}> — **${removedAmount}** ${removedAmount === 1 ? "punto rimosso" : "punti rimossi"} da <@${interaction.user.id}>.`,
            allowedMentions: { users: [parsed.targetUserId, interaction.user.id] },
          })
          .catch(() => null);
      }
    }

    await refreshPointsPanel(interaction, parsed, check.actorMember);
    const changeLabel = formatPartnerPointsChange("remove", removedAmount);
    await interaction.editReply({
      content: `${E.success} **${changeLabel}** con successo!\n**Points:** ${removedAmount}`,
    }).catch(() => {});
    return true;
  },
};
