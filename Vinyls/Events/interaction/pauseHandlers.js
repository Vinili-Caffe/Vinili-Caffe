const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { PAUSE_REQUEST_OPEN_ID, maybeRepositionPauseSticky } = require("../../Utils/Pause/pauseStickyPanelRuntime");
const {
  PAUSE_ROLE_PICK_PM,
  PAUSE_ROLE_PICK_STAFF,
  PAUSE_ROLE_PICK_BOTH,
  memberCanRequestPause,
  storePendingPauseRolePick,
  takePendingPauseRolePick,
  submitPauseRequestForMember,
} = require("../../Utils/Pause/pauseRequestSubmitRuntime");
const PAUSE_REQUEST_MODAL_ID = "pause_request:modal";
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");
const { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, computeConsumedPauseDays, getMemberRoleLabel, getPauseStatusLabel, computePauseScaledDaysThisYear, getStaffPauseRecord, getStaffAndPauseByRequestMessageId, updatePauseInDb, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, syncSingleAcceptedPauseMessage, getPausePhase, getBasePauseLimit, getPauseRoleLimit, getPauseTimingText, computeStaffersInPauseByRoleForRange, computeStaffersInPauseByStaffRankForRange, getMemberStaffRankRoleId, getStaffRankLimitKey, buildAcceptedPauseLogContent, buildCancelledPauseLogContent, formatPauseRoleLabelForMessage, getPauseReasonFromMessage, normalizePauseRoleChoice, getPauseRoleTargets, roleChoiceAppliesTo, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, getBestStaffPauseBonusDays, getStaffPauseBonusDaysTotal, getValPosTradedPauseBonusDays, grantBestStaffPauseBonusYear } = require("../../Utils/Pause/pauseHandlersUtils");
const { buildPauseListPayload, buildPauseListMonthRows } = require("../../Utils/Pause/pauseListRuntime");
const { scheduleStaffListRefresh } = require("../../Utils/Community/staffListUtils");
const pauseActionLocks = new Set();

function notifyStaffPauseCalendarChanged() {
  try {
    const { broadcastSiteStaffPausesChanged } = require("../../Utils/Web/siteSuggestionsBroadcast");
    broadcastSiteStaffPausesChanged();
  } catch {
      }
}

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

function resolveAcceptedPauseRoleChoice(member, targetPause) {
  const requested = normalizePauseRoleChoice(targetPause?.ruoloRichiesto);
  const targets = getPauseRoleTargets(requested, member);
  if (targets.length === 2) return PAUSE_ROLE_BOTH;
  if (targets[0] === PAUSE_ROLE_PM) return PAUSE_ROLE_PM;
  return PAUSE_ROLE_STAFF;
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
    try {
      const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../../Utils/Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromPause(
        guildId,
        effectiveUserId,
        effectivePauseId,
        "rejected",
        workflowActorExtras(interaction.member || interaction.user),
      );
    } catch (_) {}
    return true;
  }

  if (action === "pause_cancel") {
    const pausePhase = getPausePhase(targetPause.dataRichiesta, targetPause.dataRitorno);
    if (pausePhase === "ended") {
      if (targetPause.status === "accepted") {
        await syncSingleAcceptedPauseMessage(interaction.guild, effectiveUserId, targetPause);
      }
      await interaction.update({ components: [] }).catch(() => {});
      await interaction.followUp({ content: "<a:VC_Alert:1482706673176150077> La pausa è scaduta: il pulsante annulla non è più disponibile.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    if (targetPause.status !== "accepted") {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questa pausa non è annullabile.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const member = await getGuildMemberCached(interaction.guild, effectiveUserId);
        const todayUtc = getTodayUtc();
    const start = parseItalianDate(targetPause.dataRichiesta);
    const end = parseItalianDate(targetPause.dataRitorno);
    const totalScheduledDays = getPauseDaysBetween(targetPause.dataRichiesta, targetPause.dataRitorno) || 0;
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
    scheduleStaffListRefresh(interaction.client, guildId, 800);

    const roleChoiceForPause = normalizePauseRoleChoice(targetPause?.ruolo || targetPause?.ruoloRichiesto) || PAUSE_ROLE_STAFF;
    const baseLimit = getBasePauseLimit(member, roleChoiceForPause);
    const bonusPause = member
      ? getStaffPauseBonusDaysTotal(member, stafferRecord)
      : getValPosTradedPauseBonusDays(stafferRecord);
    const maxGiorni = baseLimit + bonusPause;
    const giorniTotaliUsati = computeConsumedPauseDays(stafferRecord.staff?.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    const roleLabelForCancel = formatPauseRoleLabelForMessage(
      interaction.guild,
      roleChoiceForPause === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoiceForPause,
      member,
    );
    const cancelledContent = buildCancelledPauseLogContent({
      roleLabel: roleLabelForCancel,
      effectiveUserId,
      dataRichiesta: targetPause.dataRichiesta,
      dataRitorno: targetPause.dataRitorno,
      giorniScalati: consumedForCancelledPause,
      giorniTotaliUsati,
      maxGiorni,
      giorniRimanenti,
    });
    const pmRole = interaction.guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
    const cancelledContentPm = buildCancelledPauseLogContent({
      roleLabel: pmRole?.name || "Partner Manager",
      effectiveUserId,
      dataRichiesta: targetPause.dataRichiesta,
      dataRitorno: targetPause.dataRitorno,
      giorniScalati: consumedForCancelledPause,
      giorniTotaliUsati,
      maxGiorni,
      giorniRimanenti,
    });

    const staffMsgId = String(targetPause.requestMessageId || "").trim();
    const pmMsgId = String(targetPause.requestMessageIdPm || "").trim();
    const currentMsgId = String(interaction.message?.id || "").trim();
    const editingPmMessage = Boolean(currentMsgId && pmMsgId && currentMsgId === pmMsgId);
    const contentForCurrent = editingPmMessage ? cancelledContentPm : cancelledContent;
    const cancelButtons = [buildAcceptedButtonsRow(effectiveUserId, effectivePauseId, { hideCancel: true })];

    await interaction.update({ content: contentForCurrent, components: cancelButtons });

    const siblingId =
      editingPmMessage && staffMsgId
        ? staffMsgId
        : currentMsgId && staffMsgId && currentMsgId === staffMsgId && pmMsgId
          ? pmMsgId
          : "";
    if (siblingId && interaction.channel?.messages?.fetch) {
      const siblingMsg = await interaction.channel.messages.fetch(siblingId).catch(() => null);
      if (siblingMsg) {
        const siblingContent = editingPmMessage ? cancelledContent : cancelledContentPm;
        await siblingMsg
          .edit({
            content: siblingContent,
            components: cancelButtons,
          })
          .catch(() => {});
      }
    }

    await interaction.channel?.send({ content: `<:cancel:1461730653677551691> Pausa annullata per <@${effectiveUserId}>. <a:VC_Calendar:1482706208149475358> Giorni scalati: \`${consumedForCancelledPause}\`. <:VC_Clock:1473359204189474886> Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).` });
    void maybeRepositionPauseSticky(interaction.channel, interaction.client).catch(() => null);
    notifyStaffPauseCalendarChanged();
    try {
      const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../../Utils/Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromPause(
        guildId,
        effectiveUserId,
        effectivePauseId,
        "cancelled",
        workflowActorExtras(interaction.member || interaction.user),
      );
    } catch (_) {}
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
  const bonusPause = getStaffPauseBonusDaysTotal(member, stafferRecord);
  const maxGiorni = baseLimit + bonusPause;
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
  const staffRankRoleId = getMemberStaffRankRoleId(member);
  if (roleChoice === PAUSE_ROLE_BOTH) {
    const overlapStaff = staffRankRoleId
      ? await computeStaffersInPauseByStaffRankForRange(
          interaction.guild,
          guildId,
          staffRankRoleId,
          targetPause.dataRichiesta,
          targetPause.dataRitorno,
          effectiveUserId,
          PAUSE_ROLE_STAFF,
        )
      : await computeStaffersInPauseByRoleForRange(guildId, PAUSE_ROLE_STAFF, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    const overlapPm = await computeStaffersInPauseByRoleForRange(guildId, PAUSE_ROLE_PM, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    sameRoleActiveCountStaff = overlapStaff + 1;
    sameRoleActiveCountPm = overlapPm + 1;
    sameRoleActiveCount = Math.max(sameRoleActiveCountStaff, sameRoleActiveCountPm);
  } else if (roleChoice === PAUSE_ROLE_PM) {
    const overlappingSameRole = await computeStaffersInPauseByRoleForRange(guildId, roleChoice, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    sameRoleActiveCount = overlappingSameRole + 1;
  } else {
    const overlappingSameRole = staffRankRoleId
      ? await computeStaffersInPauseByStaffRankForRange(
          interaction.guild,
          guildId,
          staffRankRoleId,
          targetPause.dataRichiesta,
          targetPause.dataRitorno,
          effectiveUserId,
          PAUSE_ROLE_STAFF,
        )
      : await computeStaffersInPauseByRoleForRange(guildId, roleChoice, targetPause.dataRichiesta, targetPause.dataRitorno, effectiveUserId);
    sameRoleActiveCount = overlappingSameRole + 1;
  }

  const threadIdToDelete = String(targetPause.requestThreadId || "").trim();
  const updateResult = await updatePauseInDb(guildId, effectiveUserId, effectivePauseId, {
    status: "accepted",
    ruolo: roleChoice,
    ruoloGradeId: staffRankRoleId || null,
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
  targetPause.ruoloGradeId = staffRankRoleId || null;
  targetPause.giorniUsati = giorniUsati;
  targetPause.giorniAggiuntivi = bonusBestStaff;
  targetPause.stafferInPausa = sameRoleActiveCount;
  targetPause.requestThreadId = null;

  if (bonusBestStaff >= 5) {
    await grantBestStaffPauseBonusYear(guildId, effectiveUserId);
  }

  const staffRankLimitKey = getStaffRankLimitKey(staffRankRoleId);
  const roleLimit =
    roleChoice === PAUSE_ROLE_BOTH || roleChoice === PAUSE_ROLE_PM
      ? getPauseRoleLimit(roleChoice)
      : getPauseRoleLimit(staffRankLimitKey || roleChoice);
  const roleLimitWarning =
    roleChoice !== PAUSE_ROLE_BOTH &&
    roleChoice !== PAUSE_ROLE_PM &&
    roleLimit != null &&
    sameRoleActiveCount > roleLimit
      ? `\n\n⚠️ Limite ruolo \`${formatPauseRoleLabelForMessage(interaction.guild, roleChoice, member)}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`
      : roleChoice === PAUSE_ROLE_PM && roleLimit != null && sameRoleActiveCount > roleLimit
        ? `\n\n⚠️ Limite ruolo \`${PAUSE_ROLE_PM}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`
        : "";

  const staffLimit = getPauseRoleLimit(staffRankLimitKey || PAUSE_ROLE_STAFF);
  const pmLimit = getPauseRoleLimit(PAUSE_ROLE_PM);
  const roleLimitWarningStaff =
    roleChoice === PAUSE_ROLE_BOTH && staffLimit != null && sameRoleActiveCountStaff > staffLimit
      ? `\n\n⚠️ Limite ruolo \`${formatPauseRoleLabelForMessage(interaction.guild, PAUSE_ROLE_STAFF, member)}\` superato (max ${staffLimit} in pausa). Accettata comunque da High Staff.`
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
  scheduleStaffListRefresh(interaction.client, guildId, 800);
  void maybeRepositionPauseSticky(interaction.channel, interaction.client).catch(() => null);
  notifyStaffPauseCalendarChanged();
  try {
    const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../../Utils/Web/siteStaffWorkflowStore");
    await updateStaffWorkflowFromPause(
      guildId,
      effectiveUserId,
      effectivePauseId,
      "accepted",
      workflowActorExtras(interaction.member || interaction.user),
    );
  } catch (_) {}
  return true;
  } finally { pauseActionLocks.delete(lockKey) }
  }

async function handlePauseRequestOpen(interaction) {
  if (!interaction.isButton() || interaction.customId !== PAUSE_REQUEST_OPEN_ID) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Comando disponibile solo nel server.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  const member = interaction.member || (await getGuildMemberCached(interaction.guild, interaction.user.id));
  if (!memberCanRequestPause(member)) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Non hai i permessi per richiedere una pausa.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  const modal = new ModalBuilder().setCustomId(PAUSE_REQUEST_MODAL_ID).setTitle("Richiesta pausa");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pause_start")
        .setLabel("Data inizio pausa")
        .setPlaceholder("es. 20/05/2026 o 1 agosto")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pause_end")
        .setLabel("Data ritorno")
        .setPlaceholder("es. 25/05/2026")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pause_reason")
        .setLabel("Motivo")
        .setPlaceholder("Descrivi brevemente il motivo della pausa")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500),
    ),
  );
  await interaction.showModal(modal).catch(() => null);
  return true;
}

async function handlePauseRequestModal(interaction) {
  if (!interaction.isModalSubmit() || interaction.customId !== PAUSE_REQUEST_MODAL_ID) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Richiesta non valida.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  const member = interaction.member || (await getGuildMemberCached(interaction.guild, interaction.user.id));
  if (!memberCanRequestPause(member)) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Non hai i permessi per richiedere una pausa.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  const rawStart = interaction.fields.getTextInputValue("pause_start");
  const rawEnd = interaction.fields.getTextInputValue("pause_end");
  const reason = interaction.fields.getTextInputValue("pause_reason");
  const hasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const hasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  if (hasStaff && hasPm) {
    storePendingPauseRolePick(interaction.user.id, {
      guildId: interaction.guild.id,
      rawStart,
      rawEnd,
      reason,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_PM).setLabel("PM").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_STAFF).setLabel("Staff").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_BOTH).setLabel("Entrambi").setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({
      content: "Scegli per quale ruolo vuoi chiedere la pausa:",
      components: [row],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  await interaction.deferReply({ flags: 1 << 6 }).catch(() => null);
  const channel = interaction.channel || (await getGuildChannelCached(interaction.guild, IDs.channels?.pause));
  const result = await submitPauseRequestForMember({
    guild: interaction.guild,
    member,
    rawStart,
    rawEnd,
    reason,
    replyChannel: channel,
  });
  const text = result.ok
    ? "<:vegacheckmark:1443666279058772028> Richiesta pausa inviata nel canale."
    : `<:vegax:1443934876440068179> ${result.error || "Errore invio richiesta."}`;
  await interaction.editReply({ content: text }).catch(() => null);
  return true;
}

async function handlePauseRolePickForPending(interaction) {
  if (!interaction.isButton()) return false;
  const id = String(interaction.customId || "");
  if (id !== PAUSE_ROLE_PICK_PM && id !== PAUSE_ROLE_PICK_STAFF && id !== PAUSE_ROLE_PICK_BOTH) return false;
  const pending = takePendingPauseRolePick(interaction.user.id);
  if (!pending) return false;
  if (!interaction.guild || String(interaction.guild.id) !== String(pending.guildId || "")) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Sessione scaduta. Riapri il modulo pausa.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
  let requestedRole = "Staff";
  if (id === PAUSE_ROLE_PICK_PM) requestedRole = "PartnerManager";
  else if (id === PAUSE_ROLE_PICK_BOTH) requestedRole = "Entrambi";
  const member = interaction.member || (await getGuildMemberCached(interaction.guild, interaction.user.id));
  await interaction.deferUpdate().catch(() => null);
  const channel = interaction.channel || (await getGuildChannelCached(interaction.guild, IDs.channels?.pause));
  const result = await submitPauseRequestForMember({
    guild: interaction.guild,
    member,
    rawStart: pending.rawStart,
    rawEnd: pending.rawEnd,
    reason: pending.reason,
    requestedRole,
    replyChannel: channel,
  });
  const text = result.ok
    ? "<:vegacheckmark:1443666279058772028> Richiesta pausa inviata nel canale."
    : `<:vegax:1443934876440068179> ${result.error || "Errore invio richiesta."}`;
  await interaction.editReply({ content: text, components: [] }).catch(() => null);
  return true;
}

module.exports = { handlePauseButton, handlePauseRequestOpen, handlePauseRequestModal, handlePauseRolePickForPending };