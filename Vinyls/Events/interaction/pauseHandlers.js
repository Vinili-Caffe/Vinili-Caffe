const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

async function deletePauseThreadIfAny(guild, requestThreadId) {
  if (!guild || !requestThreadId) return;
  const thread = await guild.channels.fetch(requestThreadId).catch(() => null);
  if (thread?.isThread?.()) await thread.delete().catch(() => null);
}
const { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, computeConsumedPauseDays, getPauseStatusLabel, computePauseScaledDaysThisYear, getStaffPauseRecord, getStaffAndPauseByRequestMessageId, updatePauseInDb, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, getMemberRoleLabel, getBasePauseLimit, getPauseRoleLimit, getPauseTimingText, computeStaffersInPauseByRoleForRange, getPauseReasonFromMessage } = require("../../Utils/Pause/pauseHandlersUtils");
const { buildPauseListPayload, buildPauseListMonthRows } = require("../../Utils/Pause/pauseListRuntime");
const pauseActionLocks = new Set();

async function handlePauseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (
    !interaction.customId.startsWith("pause_accept:") &&
    !interaction.customId.startsWith("pause_reject:") &&
    !interaction.customId.startsWith("pause_cancel:") &&
    !interaction.customId.startsWith("pause_list:") &&
    !interaction.customId.startsWith("pause_list_month:")
  )
    return false;

  const parts = interaction.customId.split(":");
  const [action, userId, pauseId] = parts;
  if (!userId) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  if (
    (action === "pause_accept" ||
      action === "pause_reject" ||
      action === "pause_cancel") &&
    parts.length !== 3
  ) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const isHighStaff=Boolean(interaction.member?.roles?.cache?.has(IDs.roles.HighStaff),);
  const isStaff=Boolean(interaction.member?.roles?.cache?.has(IDs.roles.Staff),);
  if (
    (action === "pause_accept" ||
      action === "pause_reject" ||
      action === "pause_cancel") &&
    !isHighStaff
  ) {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1482706673176150077> Solo High Staff può usare questi pulsanti.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const guildId = interaction.guildId;
  const messageId = interaction.message?.id;
  let stafferRecord = await getStaffPauseRecord(guildId, userId);
  let effectiveUserId = userId;
  if (!stafferRecord && messageId) {
    const byMsg = await getStaffAndPauseByRequestMessageId(guildId, messageId);
    if (byMsg) {
      stafferRecord = byMsg.stafferRecord;
      effectiveUserId = String(stafferRecord.userId ?? "").trim();
    }
  }
  if (!stafferRecord) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Record pausa non trovato.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  if (
    (action === "pause_list" || action === "pause_list_month") &&
    !isHighStaff &&
    !isStaff &&
    interaction.user.id !== effectiveUserId
  ) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Puoi vedere solo le tue pause.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (action === "pause_list") {
    const pauses = Array.isArray(stafferRecord.staff?.pauses) ? stafferRecord.staff?.pauses : [];
    const todayUtc = getTodayUtc();
    const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
    const year = yearStart.getUTCFullYear();

    const rowPromises = pauses.map(async (pause) => {
      const start = parseItalianDate(pause?.dataRichiesta);
      const end = parseItalianDate(pause?.dataRitorno);
      if (!start || !end) return null;
      if (countOverlapDays(start, end, yearStart, yearEnd) <= 0) return null;
      const scaledDays = computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd);
      const statusLabel = getPauseStatusLabel(pause, todayUtc);
      const reasonFromMsg = await getPauseReasonFromMessage(interaction.client, pause);
      const reason = (reasonFromMsg || String(pause?.motivazione || "").trim().slice(0, 800) || "—");
      return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}** · Giorni scalati: \`${scaledDays}\`\n\n<:VC_reason:1478517122929004544> ${reason}`;
    });
    const rows = (await Promise.all(rowPromises)).filter(Boolean);
    const memberLabel = interaction.guild?.members?.cache?.get(effectiveUserId)?.displayName || interaction.client?.users?.cache?.get(effectiveUserId)?.username || ` User ID: ${effectiveUserId}`;

    const monthRows = buildPauseListMonthRows(effectiveUserId, year);
    const payload = rows.length === 0
      ? { content: `<:staff:1443651912179388548> Staffer: <@${effectiveUserId}>\n<:VC_Attention:1482534443632558151> Nessuna pausa trovata nell'anno **${year}**.`, components: monthRows, flags: 1 << 6 }
      : {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle(`Pause ${year}-${memberLabel}`)
              .setDescription(
                `<:staff:1443651912179388548> Staffer: <@${effectiveUserId}>\n\n${rows.join("\n")}\n\n<a:VC_Calendar:1482706208149475358> Totale giorni scalati nell'anno corrente: \`${computeConsumedPauseDays(pauses)}\``,
              ),
          ],
          components: monthRows,
          flags: 1 << 6,
        };

    await interaction.reply(payload).catch(() => {});
    return true;
  }

  if (action === "pause_list_month") {
    const year = parts[2];
    const month = parts[3];
    if (!year || !month) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Mese non valido.", flags: 1 << 6 }).catch(() => {});
      return true;
    }
    const memberLabel = interaction.guild?.members?.cache?.get(effectiveUserId)?.displayName || interaction.client?.users?.cache?.get(effectiveUserId)?.username || ` User ID: ${effectiveUserId}`;
    const targetUser = { id: effectiveUserId, username: memberLabel };
    const listPayload = await buildPauseListPayload({
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      targetUser,
      isHighStaff,
      client: interaction.client,
      filterMonth: Number(month),
    });
    if (!listPayload.ok) {
      await interaction.reply({ content: listPayload.error || "<a:VC_Alert:1482706673176150077> Errore.", flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await interaction.reply({
      embeds: listPayload.embeds,
      components: listPayload.components || [],
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }

  if (!pauseId) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  let targetPause = stafferRecord.staff?.pauses?.id?.(pauseId);
  let effectivePauseId = pauseId;
  if (!targetPause && messageId && Array.isArray(stafferRecord.staff?.pauses)) {
    const byMsg = stafferRecord.staff?.pauses.find((x) => String(x?.requestMessageId) === String(messageId));
    if (byMsg) {
      targetPause = byMsg;
      effectivePauseId = String(targetPause._id ?? "").trim();
      await interaction.message?.edit({
        components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: false, disableCancel: false })],
      }).catch(() => {});
    }
  }

  const lockKey = `${String(interaction.guildId || "dm")}:${String(effectiveUserId)}:${String(effectivePauseId)}`;
  if (pauseActionLocks.has(lockKey)) {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1482706673176150077> Questa richiesta pausa è già in elaborazione.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  pauseActionLocks.add(lockKey);

  try {

  if (!targetPause) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Richiesta pausa non trovata.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (action === "pause_reject") {
    if (targetPause.status !== "pending") {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Questa richiesta è già stata gestita.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, { status: "rejected" });
    targetPause.status = "rejected";
    await deletePauseThreadIfAny(interaction.guild, targetPause.requestThreadId);
    await interaction.deferUpdate().catch(() => {});
    const currentContent = interaction.message?.content || "";
    const rejectedSuffix = currentContent.includes("<:cancel:1461730653677551691>") ? "" : `\n\n<:cancel:1461730653677551691> **Richiesta pausa rifiutata** per <@${effectiveUserId}>.`;
    const updatedContent = currentContent + rejectedSuffix;
    await interaction.message?.edit({
      content: updatedContent,
      components: [],
    }).catch(() => {});
    return true;
  }

  if (action === "pause_cancel") {
    if (targetPause.status !== "accepted") {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Questa pausa non è annullabile.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const end = parseItalianDate(targetPause.dataRitorno);
    const todayForExpiry = getTodayUtc();
    if (end && todayForExpiry > end) {
      await interaction
        .update({
          components: [],
        })
        .catch(() => {});
      await interaction
        .followUp({
          content:
            "<a:VC_Alert:1482706673176150077> La pausa è scaduta: il pulsante annulla non è più disponibile.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const member = await getGuildMemberCached(interaction.guild, effectiveUserId);
    if (!member) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Staffer non trovato nel server.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const todayUtc = getTodayUtc();
    const start = parseItalianDate(targetPause.dataRichiesta);
    const totalScheduledDays=getPauseDaysBetween(targetPause.dataRichiesta,targetPause.dataRitorno)||0;
    let consumedForCancelledPause = 0;
    if (start && end) {
      if (todayUtc < start) consumedForCancelledPause = 0;
      else if (todayUtc > end) consumedForCancelledPause = totalScheduledDays;
      else
        consumedForCancelledPause = Math.max(
          1,
          Math.floor((todayUtc - start) / MS_PER_DAY) + 1,
        );
    }

    await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, {
      status: "cancelled",
      giorniUsati: consumedForCancelledPause,
      cancelledAt: new Date(),
    });
    targetPause.status = "cancelled";
    targetPause.giorniUsati = consumedForCancelledPause;
    targetPause.cancelledAt = new Date();

    const baseLimit = getBasePauseLimit(member);
    const bonusBestStaff=member.roles.cache.has(IDs.roles.StafferDelMese)?5:0;
    const maxGiorni = baseLimit + bonusBestStaff;
    const giorniTotaliUsati = computeConsumedPauseDays(stafferRecord.staff?.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    const currentContent = interaction.message?.content || "";
    const annullataTag = "<:cancel:1461730653677551691> **__\`ANNULLATA\`__**";
    const updatedContent=currentContent.includes(annullataTag)?currentContent:`${currentContent}\n\n${annullataTag}`;

    await interaction
      .update({
        content: updatedContent,
        components: [
          buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: true }),
        ],
      })
      .catch(() => {});

    await interaction.channel
      ?.send({
        content: `<:cancel:1461730653677551691> Pausa annullata per <@${effectiveUserId}>. <a:VC_Calendar:1482706208149475358> Giorni scalati: \`${consumedForCancelledPause}\`. <:VC_Clock:1473359204189474886> Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).`,
      })
      .catch(() => {});
    return true;
  }

  if (targetPause.status !== "pending") {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1482706673176150077> Questa richiesta è già stata gestita.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const member = await getGuildMemberCached(interaction.guild, effectiveUserId);
  if (!member) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Staffer non trovato nel server.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const giorniRichiesti=getPauseDaysBetween(targetPause.dataRichiesta,targetPause.dataRitorno,);
  if (!giorniRichiesti) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Date pausa non valide.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const baseLimit = getBasePauseLimit(member);
  const bonusBestStaff=member.roles.cache.has(IDs.roles.StafferDelMese)?5:0;
  const maxGiorni = baseLimit + bonusBestStaff;
  const usedBefore = computeConsumedPauseDays(stafferRecord.staff?.pauses);
  const giorniUsati = usedBefore + giorniRichiesti;
  const giorniRimanenti = maxGiorni - giorniUsati;
  if (giorniRimanenti < 0) {
    await interaction
      .reply({
        content: `<a:VC_Alert:1482706673176150077> Limite pause superato: disponibili \`${Math.max(0, maxGiorni - usedBefore)}\` su \`${maxGiorni}\`.`,
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const roleLabel = getMemberRoleLabel(member);
  const overlappingSameRole=await computeStaffersInPauseByRoleForRange(guildId,roleLabel,targetPause.dataRichiesta,targetPause.dataRitorno,);
  const sameRoleActiveCount = overlappingSameRole + 1;

  const updateResult = await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, {
    status: "accepted",
    ruolo: roleLabel,
    giorniUsati,
    giorniAggiuntivi: bonusBestStaff,
    stafferInPausa: sameRoleActiveCount,
  });
  if (!updateResult.ok) {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Impossibile salvare l'accettazione della pausa nel database. Riprova.",
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }
  targetPause.status = "accepted";
  targetPause.ruolo = roleLabel;
  targetPause.giorniUsati = giorniUsati;
  targetPause.giorniAggiuntivi = bonusBestStaff;
  targetPause.stafferInPausa = sameRoleActiveCount;

  const roleLimit = getPauseRoleLimit(roleLabel);
  const roleLimitWarning = (roleLimit != null && sameRoleActiveCount > roleLimit)
    ? `\n\n⚠️ Limite ruolo \`${roleLabel}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`
    : "";

  const pauseEnd = parseItalianDate(targetPause.dataRitorno);
  const now = getTodayUtc();
  const pauseAlreadyEnded = Boolean(pauseEnd && now > pauseEnd);
  const pauseTimingText = getPauseTimingText(targetPause.dataRichiesta, targetPause.dataRitorno);
  const acceptanceContent = `<a:VC_Calendar:1482706208149475358> **\`${targetPause.ruolo}\`** - **<@${effectiveUserId}>** ${pauseTimingText}.\n<:VC_Clock:1473359204189474886> Dal **\`${targetPause.dataRichiesta}\`** al **\`${targetPause.dataRitorno}\`**\n<:VC_update:1478721333096349817> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - <:staff:1443651912179388548> __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo${roleLimitWarning}`;

  await deletePauseThreadIfAny(interaction.guild, targetPause.requestThreadId);
  await interaction.deferUpdate().catch(() => {});
  await interaction.message?.edit({
    content: acceptanceContent,
    components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: false, disableCancel: pauseAlreadyEnded })],
  }).catch(() => {});
  if (pauseEnd && interaction.message?.id && interaction.channel?.id) {
    schedulePauseButtonsRemoval(
      interaction.guild,
      interaction.channel.id,
      interaction.message.id,
      targetPause.dataRitorno,
    );
  }
  return true;
  } finally {
    pauseActionLocks.delete(lockKey);
  }
}

module.exports = { handlePauseButton };