const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { removePartnerPoints, formatPartnerPointsChange } = require("../../Utils/Staff/partnerPointsUtils") as typeof import("../../Utils/Staff/partnerPointsUtils");
const { resolvePartnerTotalEarned, resolvePartnerPointsShown } = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");
const {
  buildPartnershipMessageLink,
  buildPartnerPointLogContent,
  getPartnerPointHighStaffPingRoleIds,
  parsePartnerPointModalId,
  parseMainPartnershipRemoveModalId,
  MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX,
  MAIN_PARTNERSHIP_REMOVE_RULE_INPUT,
} = require("../../Utils/Partner/partnerPointContextUtils") as typeof import("../../Utils/Partner/partnerPointContextUtils");
const { deletePartnershipFromContextMessage } = require("../../Services/Partner/tenantPartnershipDeleteService") as typeof import("../../Services/Partner/tenantPartnershipDeleteService");
const { memberHasPartnerManagerRole, getPartnershipLogChannelIds, shouldApplyMainPartnershipFilters } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { recordTenantBugReport } = require("../../Services/Partner/tenantObjectiveService") as typeof import("../../Services/Partner/tenantObjectiveService");
const { logPmPointsRemoved, entryMessageId } = require("../../Utils/Partner/pmPointsRemovedStore") as typeof import("../../Utils/Partner/pmPointsRemovedStore");
const { safeReply, safeDeferReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");

const IN_RULE = "regolaViolata";
const EPHEMERAL = MessageFlags.Ephemeral;

async function resolvePartnerLogChannel(guild?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return null;
  const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
  const { primary, fallback } = getPartnershipLogChannelIds(guild?.id);
  const hardFallback = String(IDs.channels?.puntiTolti || "").trim();
  for (const channelId of [primary, fallback, hardFallback]) {
    if (!channelId) continue;
    const channel =
      guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (channel?.isTextBased?.()) return channel;
  }
  return null;
}

function getModalText(interaction?, customId?) {
  return String(interaction.fields?.getTextInputValue?.(customId) || "").trim();
}

async function handlePartnerSegnalaModal(interaction?) {
  const parsed =
    parsePartnerPointModalId(interaction.customId, "psig_m:") ||
    parsePartnerPointModalId(interaction.customId, "partner_segnala_m:");
  if (!parsed) return false;
  if (!shouldApplyMainPartnershipFilters(interaction.guild?.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Le segnalazioni partnership sono disponibili solo sul server principale.",
      flags: EPHEMERAL,
    });
    return true;
  }
  if (String(interaction.user.id) !== parsed.actorId) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto la segnalazione può inviarla.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const rule = getModalText(interaction, IN_RULE);
  if (!rule) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Indica la regola violata.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) return true;

  if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return true;

  const pmMember = await guild.members.fetch(parsed.pmUserId).catch(() => null);
  if (!memberHasPartnerManagerRole(pmMember, guild.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
    });
    return true;
  }
  const logChannel = await resolvePartnerLogChannel(guild);
  const messageLink = buildPartnershipMessageLink(guild.id, parsed.channelId, parsed.partnershipMsgId);
  const content = buildPartnerPointLogContent({
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    reporterUserId: parsed.actorId,
    pingHighStaff: true,
    statusLine: "<:VC_Attention:1482534443632558151> In attesa di conferma High Staff.",
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partner_pt_ok:${parsed.pmUserId}:${parsed.actorId}`)
      .setLabel("Conferma rimozione")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`partner_pt_no:${parsed.pmUserId}:${parsed.actorId}`)
      .setLabel("Nega segnalazione")
      .setStyle(ButtonStyle.Secondary),
  );
  const entry = await logPmPointsRemoved({
    guild,
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    reporterUserId: parsed.actorId,
    status: "pending",
    source: "report",
    mirrorChannel: logChannel,
    mirrorContent: content,
    mirrorComponents: [row],
    mirrorAllowedMentions: { roles: getPartnerPointHighStaffPingRoleIds() },
  });
  if (!entry) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Impossibile registrare la segnalazione.",
    });
    return true;
  }
  if (entryMessageId(entry)) {
    try {
      const { notifyPuntiToltiPending, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
      const reporterMember = await guild.members.fetch(parsed.actorId).catch(() => null);
      void notifyPuntiToltiPending({
        guild,
        pmUserId: parsed.pmUserId,
        pmName: memberDisplayName(pmMember, null, parsed.pmUserId),
        reporterName: memberDisplayName(reporterMember, null, parsed.actorId),
        rule,
        messageId: entryMessageId(entry),
      }).catch(() => 0);
    } catch (_) {}
  }
  await safeReply(interaction, {
    content: logChannel
      ? `<:success:1461731530333229226> Segnalazione inviata in ${logChannel}.`
      : "<:success:1461731530333229226> Segnalazione registrata. L'High Staff può gestirla dal sito.",
  });
  void recordTenantBugReport(interaction.client, guild.id, parsed.actorId, {
    discordLocale: interaction.locale,
  }).catch(() => null);
  return true;
}

async function handlePartnerEliminaMainModal(interaction?) {
  const parsed = parseMainPartnershipRemoveModalId(interaction.customId);
  if (!parsed) return false;
  if (!shouldApplyMainPartnershipFilters(interaction.guild?.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Questa azione è disponibile solo sul server principale.",
      flags: EPHEMERAL,
    });
    return true;
  }
  if (String(interaction.user.id) !== parsed.actorId) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto l'eliminazione può confermarla.",
      flags: EPHEMERAL,
    });
    return true;
  }

  const rule = getModalText(interaction, MAIN_PARTNERSHIP_REMOVE_RULE_INPUT);
  if (!rule) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Indica la regola violata.",
      flags: EPHEMERAL,
    });
    return true;
  }

  const guild = interaction.guild;
  if (!guild) return true;

    if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return true;

  const channel =
    guild.channels.cache.get(parsed.channelId) ||
    (await getGuildChannelCached(guild, parsed.channelId).catch(() => null));
  const targetMessage = channel?.messages
    ? await channel.messages.fetch(parsed.partnershipMsgId).catch(() => null)
    : null;
  if (!targetMessage?.id) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Messaggio partnership non trovato.",
    });
    return true;
  }

  const pmMember = await guild.members.fetch(parsed.pmUserId).catch(() => null);
  if (!memberHasPartnerManagerRole(pmMember, guild.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
    });
    return true;
  }

  const deleteResult = await deletePartnershipFromContextMessage(
    guild,
    targetMessage,
    parsed.actorId,
    interaction.client,
    "context_menu_main_unified",
  );
  if (!deleteResult?.ok) {
    await safeReply(interaction, {
      content:
        "<a:VC_Cross:1482532424570376253> Non riesco a eliminare la **partnership** da questo messaggio.",
    });
    return true;
  }

        const pointsUserId = String(deleteResult.pmUserId || parsed.pmUserId || "").trim() || parsed.pmUserId;
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
  const staffLean = await ActivityUserProfile.findOne({
    guildId: guild.id,
    userId: pointsUserId,
  })
    .select("staff")
    .lean()
    .catch(() => null);
  const total = resolvePartnerTotalEarned(staffLean?.staff);
  const spendable = resolvePartnerPointsShown(staffLean?.staff);

  const logChannel = await resolvePartnerLogChannel(guild);
  const messageLink = buildPartnershipMessageLink(guild.id, parsed.channelId, parsed.partnershipMsgId);
  const content = buildPartnerPointLogContent({
    pmUserId: pointsUserId,
    rule,
    messageLink,
    actorUserId: parsed.actorId,
  });
  const entry = await logPmPointsRemoved({
    guild,
    pmUserId: pointsUserId,
    rule,
    messageLink,
    actorUserId: parsed.actorId,
    status: "logged",
    source: "partnership_delete",
    mirrorChannel: logChannel,
    mirrorContent: content,
  });
  if (entry && deleteResult.pointsAdjusted) {
    try {
      const { notifyPuntiToltiPointsRemoved, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
      const actorMember = await guild.members.fetch(parsed.actorId).catch(() => null);
      void notifyPuntiToltiPointsRemoved({
        guild,
        pmUserId: pointsUserId,
        rule,
        actorName: memberDisplayName(actorMember, null, parsed.actorId),
        dedupeKey: `pt-removed:${entryMessageId(entry)}`,
      }).catch(() => 0);
    } catch (_) {}
  } else if (!entry && !logChannel) {
    global.logger?.warn?.("[partnerElimina] punti tolti non registrati (Mongo fallito, canale assente)");
  }

  const saldoHint =
    Number(spendable) !== Number(total) ? ` · Saldo shop: \`${spendable}\`` : "";
  const pointsLine = deleteResult.pointsAdjusted
    ? `<:success:1461731530333229226> **${formatPartnerPointsChange("remove", 1)}** a <@${pointsUserId}>. Totale: \`${total}\`${saldoHint}.`
    : `<:success:1461731530333229226> Totale punti di <@${pointsUserId}>: \`${total}\`${saldoHint}.`;
  await safeReply(interaction, {
    content:
      `<a:VC_Events:1482706144953897223> **Partner** eliminata con **successo**!\n` +
      pointsLine,
  });
  return true;
}

async function handlePartnerRimuoviModal(interaction?) {
  const parsed =
    parsePartnerPointModalId(interaction.customId, "prm_m:") ||
    parsePartnerPointModalId(interaction.customId, "partner_rimuovi_m:");
  if (!parsed) return false;
  if (!shouldApplyMainPartnershipFilters(interaction.guild?.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> La rimozione punti partnership è disponibile solo sul server principale.",
      flags: EPHEMERAL,
    });
    return true;
  }
  if (String(interaction.user.id) !== parsed.actorId) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto la rimozione può confermarla.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const rule = getModalText(interaction, IN_RULE);
  if (!rule) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Indica la regola violata.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) return true;

  if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return true;

  const pmMember = await guild.members.fetch(parsed.pmUserId).catch(() => null);
  if (!memberHasPartnerManagerRole(pmMember, guild.id)) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
    });
    return true;
  }
  const staffData = await removePartnerPoints(guild.id, parsed.pmUserId, 1);
  if (!staffData) {
    await safeReply(interaction, {
      content: "<a:VC_Cross:1482532424570376253> Impossibile aggiornare i punti partner.",
    });
    return true;
  }
  const logChannel = await resolvePartnerLogChannel(guild);
  const messageLink = buildPartnershipMessageLink(guild.id, parsed.channelId, parsed.partnershipMsgId);
  const content = buildPartnerPointLogContent({
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    actorUserId: parsed.actorId,
  });
  const entry = await logPmPointsRemoved({
    guild,
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    actorUserId: parsed.actorId,
    status: "logged",
    source: "removal",
    mirrorChannel: logChannel,
    mirrorContent: content,
  });
  if (entry?.id || entry?._id) {
    try {
      const { notifyPuntiToltiPointsRemoved, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
      const actorMember = await guild.members.fetch(parsed.actorId).catch(() => null);
      void notifyPuntiToltiPointsRemoved({
        guild,
        pmUserId: parsed.pmUserId,
        rule,
        actorName: memberDisplayName(actorMember, null, parsed.actorId),
        dedupeKey: `pt-removed:${entryMessageId(entry)}`,
      }).catch(() => 0);
    } catch (_) {}
  }
  const changeLabel = formatPartnerPointsChange("remove", staffData?._partnerPointsRemoved ?? 1);
  const total = resolvePartnerTotalEarned(staffData?.staff);
  const spendable = resolvePartnerPointsShown(staffData?.staff);
  const saldoHint =
    Number(spendable) !== Number(total) ? ` · Saldo shop: \`${spendable}\`` : "";
  await safeReply(interaction, {
    content: `<:success:1461731530333229226> **${changeLabel}** a <@${parsed.pmUserId}>. Totale: \`${total}\`${saldoHint}.`,
  });
  return true;
}

async function handlePartnerPointContextModal(interaction?) {
  if (!interaction.isModalSubmit?.()) return false;
  const id = String(interaction.customId || "");
  if (id.startsWith(MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX)) {
    return handlePartnerEliminaMainModal(interaction);
  }
  if (id.startsWith("psig_m:") || id.startsWith("partner_segnala_m:")) {
    return handlePartnerSegnalaModal(interaction);
  }
  if (id.startsWith("prm_m:") || id.startsWith("partner_rimuovi_m:")) {
    return handlePartnerRimuoviModal(interaction);
  }
  return false;
}

export = {
  handlePartnerPointContextModal,
  handlePartnerEliminaMainModal,
  handlePartnerSegnalaModal,
  handlePartnerRimuoviModal,
};
