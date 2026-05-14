const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");

function pauseListMemberLabel(guild, client, userId) {
  const mem = guild?.members?.cache?.get(userId);
  const usr = mem?.user || client?.users?.cache?.get(userId);
  if (mem || usr) return accountUsername(mem || usr);
  return `User ID: ${userId}`;
}

async function deletePauseThreadIfAny(guild, requestThreadId) {
  const tid = String(requestThreadId || "").trim();
  if (!guild || !tid) return;
  let ch = await guild.channels.fetch(tid).catch(() => null);
  if (!ch && guild.client) ch = await guild.client.channels.fetch(tid).catch(() => null);
  if (!ch?.isThread?.()) return;
  try {
    await ch.delete();
  } catch (err) {
    global.logger?.warn?.("[pause] delete thread failed:", tid, err?.message || err);
  }
}
const { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, computeConsumedPauseDays, getMemberRoleLabel, getPauseStatusLabel, computePauseScaledDaysThisYear, getStaffPauseRecord, getStaffAndPauseByRequestMessageId, updatePauseInDb, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, getBasePauseLimit, getPauseRoleLimit, getPauseTimingText, computeStaffersInPauseByRoleForRange, getPauseReasonFromMessage, normalizePauseRoleChoice, getPauseRoleTargets, roleChoiceAppliesTo, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, getBestStaffPauseBonusDays, grantBestStaffPauseBonusYear } = require("../../Utils/Pause/pauseHandlersUtils");
const { buildPauseListPayload, buildPauseListMonthRows } = require("../../Utils/Pause/pauseListRuntime");
const pauseActionLocks = new Set();

function resolveAcceptedPauseRoleChoice(member, targetPause) {
  const requested = normalizePauseRoleChoice(targetPause?.ruoloRichiesto);
  const targets = getPauseRoleTargets(requested, member);
  if (targets.length === 2) return PAUSE_ROLE_BOTH;
  if (targets[0] === PAUSE_ROLE_PM) return PAUSE_ROLE_PM;
  return PAUSE_ROLE_STAFF;
}

function formatPauseRoleLabelForMessage(guild, roleChoice, member) {
  const normalized = normalizePauseRoleChoice(roleChoice) || PAUSE_ROLE_STAFF;
  const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
  const pmLabel = pmRole?.name || "Partner Manager";
  const staffRole = guild?.roles?.cache?.get(String(IDs.roles?.Staff || ""));
  const staffFallback = staffRole?.name || "Staff";

  if (normalized === PAUSE_ROLE_PM) return pmLabel;
  if (member) return getMemberRoleLabel(member);
  return staffFallback;
}

function buildAcceptedPauseLogContent({ roleLabel, effectiveUserId, pauseTimingText, dataRichiesta, dataRitorno, giorniUsati, maxGiorni, giorniRimanenti, sameRoleActiveCount, roleLimitWarning }) {
  return `<a:VC_Calendar:1482706208149475358> **\`${roleLabel}\`** - **<@${effectiveUserId}>** ${pauseTimingText}.\n<:VC_Clock:1473359204189474886> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**\n<:VC_update:1478721333096349817> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - <:VC_Staff:1494286904089247754> __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo${roleLimitWarning}`;
}

async function handlePauseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("pause_accept:") && !interaction.customId.startsWith("pause_reject:") && !interaction.customId.startsWith("pause_cancel:") && !interaction.customId.startsWith("pause_list:") && !interaction.customId.startsWith("pause_list_month:")) return false;

  const parts = interaction.customId.split(":");
  const [action, userId, pauseId] = parts;
  if (!userId) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> ID pausa non valido.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  if (
    (action === "pause_accept" ||
      action === "pause_reject" ||
      action === "pause_cancel") &&
    parts.length !== 3
  ) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> ID pausa non valido.", flags: 1 << 6 }).catch(() => {});
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
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Solo High Staff può usare questi pulsanti.", flags: 1 << 6 }).catch(() => {});
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
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Pausa non trovata.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  if (
    (action === "pause_list" || action === "pause_list_month") &&
    !isHighStaff &&
    !isStaff &&
    interaction.user.id !== effectiveUserId
  ) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Puoi vedere solo le tue pause.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (action === "pause_list") {
    const roleTag = String(parts[2] || "").toLowerCase();
    const pauseListRoleFilter = roleTag === "pm" || roleTag === "staff" ? roleTag : null;
    let pauses = Array.isArray(stafferRecord.staff?.pauses) ? stafferRecord.staff?.pauses : [];
    if (pauseListRoleFilter === "pm") {
      pauses = pauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto));
    } else if (pauseListRoleFilter === "staff") {
      pauses = pauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_STAFF, p?.ruolo || p?.ruoloRichiesto));
    }
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
      const pauseRole = String(pause?.ruolo || pause?.ruoloRichiesto || "Staff");
      return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}** · Giorni scalati: \`${scaledDays}\` · Ruolo pausa: \`${pauseRole}\`\n\n<:VC_reason:1478517122929004544> ${reason}`;
    });
    const rows = (await Promise.all(rowPromises)).filter(Boolean);
    const memberLabel = pauseListMemberLabel(interaction.guild, interaction.client, effectiveUserId);

    const monthRows = buildPauseListMonthRows(effectiveUserId, year, {
      ...(pauseListRoleFilter ? { pauseRoleFilter: pauseListRoleFilter } : {}),
      staff: stafferRecord?.staff || null,
    });
    const payload = rows.length === 0
      ? { content: `<:VC_Staff:1494286904089247754> Staffer: <@${effectiveUserId}>\n<:VC_Attention:1482534443632558151> Nessuna pausa trovata nell'anno **${year}**.`, components: monthRows, flags: 1 << 6 }
      : {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle(`Pause ${year}-${memberLabel}`)
              .setDescription(
                `<:VC_Staff:1494286904089247754> Staffer: <@${effectiveUserId}>\n\n${rows.join("\n")}\n\n<a:VC_Calendar:1482706208149475358> Totale giorni scalati nell'anno corrente: \`${computeConsumedPauseDays(pauses)}\``,
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
    const prfMonth = String(parts[4] || "").toLowerCase();
    const pauseRoleFilterForList = prfMonth === "pm" || prfMonth === "staff" ? prfMonth : undefined;
    const memberLabel = pauseListMemberLabel(interaction.guild, interaction.client, effectiveUserId);
    const targetUser = { id: effectiveUserId, username: memberLabel };
    const listPayload = await buildPauseListPayload({ guildId: interaction.guildId, requesterId: interaction.user.id, targetUser, isHighStaff, client: interaction.client, filterMonth: Number(month), pauseRoleFilter: pauseRoleFilterForList });
    if (!listPayload.ok) {
      await interaction.reply({ content: listPayload.error || "<a:VC_Alert:1482706673176150077> Errore.", flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await interaction.reply({ embeds: listPayload.embeds, components: listPayload.components || [], flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (!pauseId) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> ID pausa non valido.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  let targetPause = stafferRecord.staff?.pauses?.id?.(pauseId);
  let effectivePauseId = pauseId;
  if (!targetPause && messageId && Array.isArray(stafferRecord.staff?.pauses)) {
    const byMsg = stafferRecord.staff?.pauses.find(
      (x) =>
        String(x?.requestMessageId) === String(messageId) || String(x?.requestMessageIdPm) === String(messageId),
    );
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
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questa richiesta pausa è già in elaborazione.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  pauseActionLocks.add(lockKey);

  try {

  if (!targetPause) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Richiesta pausa non trovata.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (action === "pause_reject") {
    if (targetPause.status !== "pending") {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questa richiesta è già stata gestita.", flags: 1 << 6 }).catch(() => {});
      return true;
    }
    const threadIdToDelete = String(targetPause.requestThreadId || "").trim();
    await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, { status: "rejected", requestThreadId: null });
    targetPause.status = "rejected";
    targetPause.requestThreadId = null;
    await deletePauseThreadIfAny(interaction.guild, threadIdToDelete);
    await interaction.deferUpdate();
    const currentContent = interaction.message?.content || "";
    const rejectedSuffix = currentContent.includes("<:cancel:1461730653677551691>") ? "" : `\n\n<:cancel:1461730653677551691> **Richiesta pausa rifiutata** per <@${effectiveUserId}>.`;
    const updatedContent = currentContent + rejectedSuffix;
    await interaction.message?.edit({ content: updatedContent, components: [] });
    return true;
  }

  if (action === "pause_cancel") {
    if (targetPause.status !== "accepted") {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questa pausa non è annullabile.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const end = parseItalianDate(targetPause.dataRitorno);
    const todayForExpiry = getTodayUtc();
    if (end && todayForExpiry > end) {
      await interaction.update({ components: [] });
      await interaction.followUp({ content: "<a:VC_Alert:1482706673176150077> La pausa è scaduta: il pulsante annulla non è più disponibile.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const member = await getGuildMemberCached(interaction.guild, effectiveUserId);
    if (!member) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Staffer non trovato nel server.", flags: 1 << 6 }).catch(() => {});
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

    await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, { status: "cancelled", giorniUsati: consumedForCancelledPause, cancelledAt: new Date() });
    targetPause.status = "cancelled";
    targetPause.giorniUsati = consumedForCancelledPause;
    targetPause.cancelledAt = new Date();

    const roleChoiceForPause = normalizePauseRoleChoice(targetPause?.ruolo || targetPause?.ruoloRichiesto) || PAUSE_ROLE_STAFF;
    const baseLimit = getBasePauseLimit(member, roleChoiceForPause);
    const bonusBestStaff = getBestStaffPauseBonusDays(member, stafferRecord);
    const maxGiorni = baseLimit + bonusBestStaff;
    const giorniTotaliUsati = computeConsumedPauseDays(stafferRecord.staff?.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    const currentContent = interaction.message?.content || "";
    const annullataTag = "<:cancel:1461730653677551691> **__\`ANNULLATA\`__**";
    const updatedContent=currentContent.includes(annullataTag)?currentContent:`${currentContent}\n\n${annullataTag}`;

    await interaction.update({ content: updatedContent, components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: true })] });

    const staffMsgId = String(targetPause.requestMessageId || "").trim();
    const pmMsgId = String(targetPause.requestMessageIdPm || "").trim();
    const currentMsgId = String(interaction.message?.id || "").trim();
    const siblingId =
      currentMsgId && pmMsgId && currentMsgId === pmMsgId && staffMsgId
        ? staffMsgId
        : currentMsgId && staffMsgId && currentMsgId === staffMsgId && pmMsgId
          ? pmMsgId
          : "";
    if (siblingId && interaction.channel?.messages?.fetch) {
      const siblingMsg = await interaction.channel.messages.fetch(siblingId).catch(() => null);
      if (siblingMsg) {
        const sibContent = String(siblingMsg.content || "");
        const sibUpdated = sibContent.includes(annullataTag) ? sibContent : `${sibContent}\n\n${annullataTag}`;
        await siblingMsg
          .edit({
            content: sibUpdated,
            components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: true })],
          })
          .catch(() => {});
      }
    }

    await interaction.channel?.send({ content: `<:cancel:1461730653677551691> Pausa annullata per <@${effectiveUserId}>. <a:VC_Calendar:1482706208149475358> Giorni scalati: \`${consumedForCancelledPause}\`. <:VC_Clock:1473359204189474886> Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).` });
    return true;
  }

  if (targetPause.status !== "pending") {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questa richiesta è già stata gestita.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const member = await getGuildMemberCached(interaction.guild, effectiveUserId);
  if (!member) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Staffer non trovato nel server.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const giorniRichiesti=getPauseDaysBetween(targetPause.dataRichiesta,targetPause.dataRitorno,);
  if (!giorniRichiesti) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Date pausa non valide.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const roleChoice = resolveAcceptedPauseRoleChoice(member, targetPause);
  const baseLimit = getBasePauseLimit(member, roleChoice);
  const bonusBestStaff = getBestStaffPauseBonusDays(member, stafferRecord);
  const maxGiorni = baseLimit + bonusBestStaff;
  const usedBefore = computeConsumedPauseDays(stafferRecord.staff?.pauses);
  const giorniUsati = usedBefore + giorniRichiesti;
  const giorniRimanenti = maxGiorni - giorniUsati;
  if (giorniRimanenti < 0) {
    await interaction.reply({ content: `<a:VC_Alert:1482706673176150077> Limite pause superato: disponibili \`${Math.max(0, maxGiorni - usedBefore)}\` su \`${maxGiorni}\`.`, flags: 1 << 6 }).catch(() => {});
    return true;
  }

  let sameRoleActiveCount = 1;
  let sameRoleActiveCountStaff = null;
  let sameRoleActiveCountPm = null;
  if (roleChoice === PAUSE_ROLE_BOTH) {
    const overlapStaff = await computeStaffersInPauseByRoleForRange(guildId, PAUSE_ROLE_STAFF, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    const overlapPm = await computeStaffersInPauseByRoleForRange(guildId, PAUSE_ROLE_PM, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    sameRoleActiveCountStaff = overlapStaff + 1;
    sameRoleActiveCountPm = overlapPm + 1;
    sameRoleActiveCount = Math.max(sameRoleActiveCountStaff, sameRoleActiveCountPm);
  } else {
    const overlappingSameRole = await computeStaffersInPauseByRoleForRange(guildId, roleChoice, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    sameRoleActiveCount = overlappingSameRole + 1;
  }

  const threadIdToDelete = String(targetPause.requestThreadId || "").trim();
  const updateResult = await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, {
    status: "accepted",
    ruolo: roleChoice,
    giorniUsati,
    giorniAggiuntivi: bonusBestStaff,
    stafferInPausa: sameRoleActiveCount,
    requestThreadId: null,
  });
  if (!updateResult.ok) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Impossibile salvare l'accettazione della pausa nel database. Riprova.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  targetPause.status = "accepted";
  targetPause.ruolo = roleChoice;
  targetPause.giorniUsati = giorniUsati;
  targetPause.giorniAggiuntivi = bonusBestStaff;
  targetPause.stafferInPausa = sameRoleActiveCount;
  targetPause.requestThreadId = null;

  if (bonusBestStaff >= 5) {
    await grantBestStaffPauseBonusYear(guildId, effectiveUserId);
  }

  const roleLimit = roleChoice === PAUSE_ROLE_BOTH ? null : getPauseRoleLimit(roleChoice);
  const roleLimitWarning = roleChoice !== PAUSE_ROLE_BOTH && roleLimit != null && sameRoleActiveCount > roleLimit
    ? `\n\n⚠️ Limite ruolo \`${roleChoice}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`
    : "";

  const staffLimit = getPauseRoleLimit(PAUSE_ROLE_STAFF);
  const pmLimit = getPauseRoleLimit(PAUSE_ROLE_PM);
  const roleLimitWarningStaff =
    roleChoice === PAUSE_ROLE_BOTH && staffLimit != null && sameRoleActiveCountStaff > staffLimit
      ? `\n\n⚠️ Limite ruolo \`${PAUSE_ROLE_STAFF}\` superato (max ${staffLimit} in pausa). Accettata comunque da High Staff.`
      : "";
  const roleLimitWarningPm =
    roleChoice === PAUSE_ROLE_BOTH && pmLimit != null && sameRoleActiveCountPm > pmLimit
      ? `\n\n⚠️ Limite ruolo \`${PAUSE_ROLE_PM}\` superato (max ${pmLimit} in pausa). Accettata comunque da High Staff.`
      : "";

  const pauseEnd = parseItalianDate(targetPause.dataRitorno);
  const now = getTodayUtc();
  const pauseAlreadyEnded = Boolean(pauseEnd && now > pauseEnd);
  const pauseTimingText = getPauseTimingText(targetPause.dataRichiesta, targetPause.dataRitorno);

  await deletePauseThreadIfAny(interaction.guild, threadIdToDelete);
  await interaction.deferUpdate();

  if (roleChoice === PAUSE_ROLE_BOTH) {
    const pmRole = interaction.guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
    const pmLabel = pmRole?.name || "Partner Manager";
    const staffLabel = getMemberRoleLabel(member);
    const acceptanceStaff = buildAcceptedPauseLogContent({ roleLabel: staffLabel, effectiveUserId, pauseTimingText, dataRichiesta: targetPause.dataRichiesta, dataRitorno: targetPause.dataRitorno, giorniUsati, maxGiorni, giorniRimanenti, sameRoleActiveCount: sameRoleActiveCountStaff, roleLimitWarning: roleLimitWarningStaff });
    const acceptancePm = buildAcceptedPauseLogContent({ roleLabel: pmLabel, effectiveUserId, pauseTimingText, dataRichiesta: targetPause.dataRichiesta, dataRitorno: targetPause.dataRitorno, giorniUsati, maxGiorni, giorniRimanenti, sameRoleActiveCount: sameRoleActiveCountPm, roleLimitWarning: roleLimitWarningPm });
    await interaction.message?.edit({ content: acceptanceStaff, components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: false, disableCancel: pauseAlreadyEnded })] });
    let pmMessageId = null;
    const sentPm = await interaction.channel
      ?.send({
        content: acceptancePm,
        components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: false, disableCancel: pauseAlreadyEnded })],
      })
      .catch(() => null);
    if (sentPm?.id) {
      pmMessageId = String(sentPm.id);
      await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, { requestMessageIdPm: pmMessageId });
      targetPause.requestMessageIdPm = pmMessageId;
    }
    if (pauseEnd && interaction.message?.id && interaction.channel?.id) { schedulePauseButtonsRemoval(interaction.guild, interaction.channel.id, interaction.message.id, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId, effectivePauseId, pmMessageId) }
  } else {
    const pauseRoleLabel = formatPauseRoleLabelForMessage(interaction.guild, targetPause.ruolo, member);
    const acceptanceContent = buildAcceptedPauseLogContent({ roleLabel: pauseRoleLabel, effectiveUserId, pauseTimingText, dataRichiesta: targetPause.dataRichiesta, dataRitorno: targetPause.dataRitorno, giorniUsati, maxGiorni, giorniRimanenti, sameRoleActiveCount, roleLimitWarning });
    await interaction.message?.edit({ content: acceptanceContent, components: [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: false, disableCancel: pauseAlreadyEnded })] });
    if (pauseEnd && interaction.message?.id && interaction.channel?.id) { schedulePauseButtonsRemoval(interaction.guild, interaction.channel.id, interaction.message.id, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId, effectivePauseId) }
  }
  return true;
  } finally { pauseActionLocks.delete(lockKey) }
  }

module.exports = { handlePauseButton };