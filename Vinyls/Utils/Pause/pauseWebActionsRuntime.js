const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached, resolveGuildMemberPresence } = require("../Interaction/interactionEntityCache");
const { maybeRepositionPauseSticky } = require("./pauseStickyPanelRuntime");
const { scheduleStaffListRefresh } = require("../Community/staffListUtils");
const {
  MS_PER_DAY,
  parseItalianDate,
  getPauseDaysBetween,
  getTodayUtc,
  getCurrentYearBoundsUtc,
  countOverlapDays,
  computeConsumedPauseDays,
  getMemberRoleLabel,
  getPauseStatusLabel,
  computePauseScaledDaysThisYear,
  getStaffPauseRecord,
  updatePauseInDb,
  buildAcceptedButtonsRow,
  schedulePauseButtonsRemoval,
  syncSingleAcceptedPauseMessage,
  getPausePhase,
  getBasePauseLimit,
  getPauseRoleLimit,
  getPauseTimingText,
  computeStaffersInPauseByRoleForRange,
  computeStaffersInPauseByStaffRankForRange,
  getMemberStaffRankRoleId,
  getStaffRankLimitKey,
  buildAcceptedPauseLogContent,
  buildCancelledPauseLogContent,
  formatPauseRoleLabelForMessage,
  normalizePauseRoleChoice,
  getPauseRoleTargets,
  hasSiblingAcceptedPauseSameRange,
  PAUSE_ROLE_STAFF,
  PAUSE_ROLE_PM,
  PAUSE_ROLE_BOTH,
  getBestStaffPauseBonusDays,
  getStaffPauseBonusDaysTotal,
  getValPosTradedPauseBonusDays,
  grantBestStaffPauseBonusYear,
  computeStaffPauseDayBudget,
  allocateBestStaffWeekPauseBonusDays,
} = require("./pauseHandlersUtils");
const { invalidateStaffPauseCalendarCache } = require("../Web/siteStaffPauseApi");

const pauseActionLocks = new Set();

function notifyStaffPauseCalendarChanged(userId) {
  try {
    const { broadcastSiteStaffPausesChanged } = require("../Web/siteSuggestionsBroadcast");
    broadcastSiteStaffPausesChanged();
  } catch {
      }
  /* staffProfLiveAll1: profilo aperto si aggiorna su accept/reject/cancel pausa */
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return;
  try {
    const { clearStaffProfileCacheForUser } = require("../Web/siteStaffProfileApi");
    clearStaffProfileCacheForUser(uid, { action: "pause" });
  } catch {
      }
}

async function deletePauseThreadIfAny(guild, requestThreadId) {
  const tid = String(requestThreadId || "").trim();
  if (!guild || !tid) return;
  let ch = await guild.channels.fetch(tid).catch(() => null);
  if (!ch && guild.client) ch = await guild.client.channels.fetch(tid).catch(() => null);
  if (!ch?.isThread?.()) return;
  await ch.delete().catch(() => null);
}

function resolveAcceptedPauseRoleChoice(member, targetPause) {
  const requested = normalizePauseRoleChoice(targetPause?.ruoloRichiesto);
  const targets = getPauseRoleTargets(requested, member);
  if (targets.length === 2) return PAUSE_ROLE_BOTH;
  if (targets[0] === PAUSE_ROLE_PM) return PAUSE_ROLE_PM;
  return PAUSE_ROLE_STAFF;
}

async function fetchPauseRequestMessage(guild, pause) {
  const msgId = String(pause?.requestMessageId || "").trim();
  const chId = String(IDs.channels?.pause || "").trim();
  if (!guild || !msgId || !chId) return null;
  const channel = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(msgId).catch(() => null);
}

async function listPendingStaffPauses(client, guildId) {
  const gid = String(guildId || IDs.guilds.main || "").trim();
  const docs = await ActivityUserProfile.find(
    { guildId: gid, "staff.pauses.status": "pending" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  const today = getTodayUtc();
  const items = [];
  const { memberEligibleForPauseRole, autoCancelPendingPausesIfNotEligible } = require("../Web/siteStaffWorkflowStore");
  const presenceByUser = new Map();

  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    let presence = presenceByUser.get(userId);
    if (!presence && guild && userId) {
      presence = await resolveGuildMemberPresence(guild, userId, { preferFresh: true }).catch(() => ({
        member: null,
        left: false,
        uncertain: true,
      }));
      presenceByUser.set(userId, presence);
      if (presence.left || (presence.member && !memberEligibleForPauseRole(presence.member, "Staff"))) {
        await autoCancelPendingPausesIfNotEligible(guild, userId, { decidedBy: "system" }).catch(() => 0);
      }
    }
    for (const pause of pauses) {
      if (!pause || String(pause.status || "") !== "pending") continue;
      const ruoloRichiesto = String(pause.ruoloRichiesto || pause.ruolo || "Staff").trim();
      if (presence) {
        if (presence.uncertain && !presence.member) {
                  } else if (presence.left || !presence.member || !memberEligibleForPauseRole(presence.member, ruoloRichiesto)) {
          continue;
        }
      }
      const pauseId = String(pause._id || "");
      const member = presence?.member || (guild ? await getGuildMemberCached(guild, userId).catch(() => null) : null);
      const displayName =
        String(member?.displayName || member?.user?.globalName || member?.user?.username || userId).trim() ||
        userId;
      items.push({
        id: pauseId,
        userId,
        displayName,
        avatarUrl: member?.displayAvatarURL?.({ size: 64, extension: "webp" }) || "",
        start: String(pause.dataRichiesta || ""),
        end: String(pause.dataRitorno || ""),
        motivazione: String(pause.motivazione || "").trim(),
        ruoloRichiesto,
        createdAt: pause.createdAt ? new Date(pause.createdAt).toISOString() : null,
        phase: getPausePhase(pause.dataRichiesta, pause.dataRitorno, today),
      });
    }
  }

  items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return items;
}

async function listStaffPausesForInbox(client, guildId, opts = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const limit = Math.min(150, Math.max(1, Number(opts.limit) || 80));
  const gid = String(guildId || IDs.guilds.main || "").trim();
  const query =
    scope === "pending"
      ? { guildId: gid, "staff.pauses.status": "pending" }
      : { guildId: gid, "staff.pauses.0": { $exists: true } };
  const docs = await ActivityUserProfile.find(query, { userId: 1, "staff.pauses": 1 })
    .lean()
    .catch(() => []);

  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  const today = getTodayUtc();
  const items = [];
  const { memberEligibleForPauseRole, autoCancelPendingPausesIfNotEligible } = require("../Web/siteStaffWorkflowStore");
  const presenceByUser = new Map();

  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    let presence = presenceByUser.get(userId);
    if (!presence && guild && userId) {
      presence = await resolveGuildMemberPresence(guild, userId, { preferFresh: true }).catch(() => ({
        member: null,
        left: false,
        uncertain: true,
      }));
      presenceByUser.set(userId, presence);
    }
    for (const pause of pauses) {
      if (!pause) continue;
      const status = String(pause.status || "pending").trim() || "pending";
      if (scope === "pending" && status !== "pending") continue;
      const ruoloRichiesto = String(pause.ruoloRichiesto || pause.ruolo || "Staff").trim();
      if (status === "pending" && presence) {
        if (presence.uncertain && !presence.member) {
                  } else if (presence.left || !presence.member || !memberEligibleForPauseRole(presence.member, ruoloRichiesto)) {
          if (!presenceByUser.get(`${userId}:cancelled`)) {
            presenceByUser.set(`${userId}:cancelled`, true);
            await autoCancelPendingPausesIfNotEligible(guild, userId, { decidedBy: "system" }).catch(() => 0);
          }
          continue;
        }
      }
      const pauseId = String(pause._id || "");
      const member = presence?.member || (guild ? await getGuildMemberCached(guild, userId).catch(() => null) : null);
      const displayName =
        String(member?.displayName || member?.user?.globalName || member?.user?.username || userId).trim() ||
        userId;
      items.push({
        id: pauseId,
        userId,
        displayName,
        avatarUrl: member?.displayAvatarURL?.({ size: 64, extension: "webp" }) || "",
        start: String(pause.dataRichiesta || ""),
        end: String(pause.dataRitorno || ""),
        motivazione: String(pause.motivazione || "").trim(),
        ruoloRichiesto,
        createdAt: pause.createdAt ? new Date(pause.createdAt).toISOString() : null,
        phase: getPausePhase(pause.dataRichiesta, pause.dataRitorno, today),
        status,
        statusLabel: getPauseStatusLabel(pause, today),
        canAct: status === "pending",
      });
    }
  }

  items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return items.slice(0, limit);
}

async function getStaffPauseInboxDetail(client, guildId, userId, pauseId) {
  const gid = String(guildId || IDs.guilds.main || "").trim();
  const uid = String(userId || "").trim();
  const pid = String(pauseId || "").trim();
  if (!uid || !pid) return null;
  const stafferRecord = await getStaffPauseRecord(gid, uid);
  const pause = stafferRecord?.staff?.pauses?.id?.(pid);
  if (!pause) return null;
  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
  const today = getTodayUtc();
  const yearBounds = getCurrentYearBoundsUtc(today);
  const status = String(pause.status || "pending").trim() || "pending";
  const displayName =
    String(member?.displayName || member?.user?.globalName || member?.user?.username || uid).trim() || uid;
  return {
    id: pid,
    userId: uid,
    displayName,
    avatarUrl: member?.displayAvatarURL?.({ size: 128, extension: "webp" }) || "",
    start: String(pause.dataRichiesta || ""),
    end: String(pause.dataRitorno || ""),
    motivazione: String(pause.motivazione || "").trim(),
    ruoloRichiesto: String(pause.ruoloRichiesto || pause.ruolo || "Staff").trim(),
    ruolo: String(pause.ruolo || "").trim(),
    giorniUsati: Number(pause.giorniUsati || 0),
    giorniAggiuntivi: Number(pause.giorniAggiuntivi || 0),
    createdAt: pause.createdAt ? new Date(pause.createdAt).toISOString() : null,
    cancelledAt: pause.cancelledAt ? new Date(pause.cancelledAt).toISOString() : null,
    phase: getPausePhase(pause.dataRichiesta, pause.dataRitorno, today),
    timing: getPauseTimingText(pause.dataRichiesta, pause.dataRitorno, today),
    status,
    statusLabel: getPauseStatusLabel(pause, today),
    giorniScalati: computePauseScaledDaysThisYear(pause, today, yearBounds.yearStart, yearBounds.yearEnd),
    canAct: status === "pending",
    fields: [
      { name: "Periodo", value: `${pause.dataRichiesta || "?"} \u2192 ${pause.dataRitorno || "?"}` },
      { name: "Ruolo richiesto", value: String(pause.ruoloRichiesto || pause.ruolo || "Staff") },
      { name: "Motivazione", value: String(pause.motivazione || "\u2014") },
      { name: "Stato", value: getPauseStatusLabel(pause, today) },
    ],
  };
}

async function rejectPauseRequestWeb(client, guild, actorMember, userId, pauseId) {
  const guildId = String(guild?.id || "");
  const lockKey = `${guildId}:${userId}:${pauseId}:reject`;
  if (pauseActionLocks.has(lockKey)) {
    return { ok: false, status: 429, message: "Richiesta già in elaborazione." };
  }
  pauseActionLocks.add(lockKey);
  try {
    const stafferRecord = await getStaffPauseRecord(guildId, userId);
    const targetPause = stafferRecord?.staff?.pauses?.id?.(pauseId);
    if (!targetPause) {
      return { ok: false, status: 404, message: "Richiesta pausa non trovata." };
    }
    if (targetPause.status !== "pending") {
      return { ok: false, status: 409, message: "Questa richiesta è già stata gestita." };
    }
    const threadIdToDelete = String(targetPause.requestThreadId || "").trim();
    await updatePauseInDb(guildId, userId, pauseId, { status: "rejected", requestThreadId: null });
    await deletePauseThreadIfAny(guild, threadIdToDelete);
    const msg = await fetchPauseRequestMessage(guild, targetPause);
    if (msg?.editable) {
      const currentContent = String(msg.content || "");
      const rejectedSuffix = currentContent.includes("<:cancel:") ? "" : `\n\n<:cancel:1461730653677551691> **Richiesta pausa rifiutata** per <@${userId}> (via sito · ${actorMember?.displayName || actorMember?.id}).`;
      await msg.edit({ content: currentContent + rejectedSuffix, components: [] }).catch(() => null);
    }
    invalidateStaffPauseCalendarCache();
    notifyStaffPauseCalendarChanged(userId);
    try {
      const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromPause(
        guildId,
        userId,
        pauseId,
        "rejected",
        workflowActorExtras(actorMember),
      );
    } catch (_) {}
    return { ok: true, status: 200, message: "Richiesta pausa rifiutata." };
  } finally {
    pauseActionLocks.delete(lockKey);
  }
}

async function acceptPauseRequestWeb(client, guild, actorMember, userId, pauseId) {
  const guildId = String(guild?.id || "");
  const lockKey = `${guildId}:${userId}:${pauseId}:accept`;
  if (pauseActionLocks.has(lockKey)) {
    return { ok: false, status: 429, message: "Richiesta già in elaborazione." };
  }
  pauseActionLocks.add(lockKey);
  try {
    const stafferRecord = await getStaffPauseRecord(guildId, userId);
    const targetPause = stafferRecord?.staff?.pauses?.id?.(pauseId);
    if (!targetPause) {
      return { ok: false, status: 404, message: "Richiesta pausa non trovata." };
    }
    if (targetPause.status !== "pending") {
      return { ok: false, status: 409, message: "Questa richiesta è già stata gestita." };
    }

    const member = await getGuildMemberCached(guild, userId);
    if (!member) {
      return { ok: false, status: 404, message: "Staffer non trovato nel server." };
    }

    const rangeDays = getPauseDaysBetween(targetPause.dataRichiesta, targetPause.dataRitorno);
    if (!rangeDays) {
      return { ok: false, status: 400, message: "Date pausa non valide." };
    }

    const roleChoice = resolveAcceptedPauseRoleChoice(member, targetPause);
    const bonusBestStaff = getBestStaffPauseBonusDays(member, stafferRecord);
    const budget = computeStaffPauseDayBudget(member, stafferRecord, roleChoice);
    const maxGiorni = budget.maxGiorni;
    const usedBefore = budget.usedDays;
    /* pauseBothSplit1: se l'altro ruolo è già accettato sulla stessa finestra, non riscalare giorni */
    const siblingCovered = hasSiblingAcceptedPauseSameRange(
      stafferRecord?.staff?.pauses || stafferRecord?.pauses,
      targetPause,
    );
    const giorniRichiesti = siblingCovered ? 0 : rangeDays;
    const giorniUsati = usedBefore + giorniRichiesti;
    const giorniRimanenti = maxGiorni - giorniUsati;
    if (giorniRimanenti < 0) {
      return {
        ok: false,
        status: 400,
        message: `Limite pause superato: disponibili ${Math.max(0, maxGiorni - usedBefore)} su ${maxGiorni}.`,
      };
    }
    const weekBonusOnAccept = allocateBestStaffWeekPauseBonusDays(stafferRecord, giorniRichiesti);

    let sameRoleActiveCount = 1;
    let sameRoleActiveCountStaff = null;
    let sameRoleActiveCountPm = null;
    const staffRankRoleId = getMemberStaffRankRoleId(member);
    if (roleChoice === PAUSE_ROLE_BOTH) {
      const overlapStaff = staffRankRoleId
        ? await computeStaffersInPauseByStaffRankForRange(
            guild,
            guildId,
            staffRankRoleId,
            targetPause.dataRichiesta,
            targetPause.dataRitorno,
            userId,
            PAUSE_ROLE_STAFF,
          )
        : await computeStaffersInPauseByRoleForRange(
            guildId,
            PAUSE_ROLE_STAFF,
            targetPause.dataRichiesta,
            targetPause.dataRitorno,
            userId,
          );
      const overlapPm = await computeStaffersInPauseByRoleForRange(
        guildId,
        PAUSE_ROLE_PM,
        targetPause.dataRichiesta,
        targetPause.dataRitorno,
        userId,
      );
      sameRoleActiveCountStaff = overlapStaff + 1;
      sameRoleActiveCountPm = overlapPm + 1;
      sameRoleActiveCount = Math.max(sameRoleActiveCountStaff, sameRoleActiveCountPm);
    } else if (roleChoice === PAUSE_ROLE_PM) {
      sameRoleActiveCount =
        (await computeStaffersInPauseByRoleForRange(
          guildId,
          roleChoice,
          targetPause.dataRichiesta,
          targetPause.dataRitorno,
          userId,
        )) + 1;
    } else {
      sameRoleActiveCount =
        (staffRankRoleId
          ? await computeStaffersInPauseByStaffRankForRange(
              guild,
              guildId,
              staffRankRoleId,
              targetPause.dataRichiesta,
              targetPause.dataRitorno,
              userId,
              PAUSE_ROLE_STAFF,
            )
          : await computeStaffersInPauseByRoleForRange(
              guildId,
              roleChoice,
              targetPause.dataRichiesta,
              targetPause.dataRitorno,
              userId,
            )) + 1;
    }

    const threadIdToDelete = String(targetPause.requestThreadId || "").trim();
    const updateResult = await updatePauseInDb(guildId, userId, pauseId, {
      status: "accepted",
      ruolo: roleChoice,
      ruoloGradeId: staffRankRoleId || null,
      giorniUsati,
      giorniAggiuntivi: bonusBestStaff,
      giorniAggiuntiviSettimana: weekBonusOnAccept,
      stafferInPausa: sameRoleActiveCount,
      requestThreadId: null,
    });
    if (!updateResult.ok) {
      return { ok: false, status: 500, message: "Impossibile salvare l'accettazione nel database." };
    }

    if (bonusBestStaff >= 5) {
      await grantBestStaffPauseBonusYear(guildId, userId);
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
        ? ` Limite ruolo superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`
        : "";

    const pauseEnd = parseItalianDate(targetPause.dataRitorno);
    const now = getTodayUtc();
    const pauseAlreadyEnded = Boolean(pauseEnd && now > pauseEnd);
    const pauseTimingText = getPauseTimingText(targetPause.dataRichiesta, targetPause.dataRitorno);

    await deletePauseThreadIfAny(guild, threadIdToDelete);

    const msg = await fetchPauseRequestMessage(guild, targetPause);
    const pauseChannel = msg?.channel || null;
    const {
      isDiscordWorkflowUiEnabled,
      buildInboxManageLinkRow,
    } = require("../Web/discordWorkflowUiGate");
    const discordUi = isDiscordWorkflowUiEnabled();
    const buttonsRow = discordUi
      ? buildAcceptedButtonsRow(userId, pauseId, {
          hideCancel: false,
          disableCancel: pauseAlreadyEnded,
        })
      : buildInboxManageLinkRow("pause");
    const msgComponents = buttonsRow ? [buttonsRow] : [];

    if (roleChoice === PAUSE_ROLE_BOTH) {
      const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
      const pmLabel = pmRole?.name || "Partner Manager";
      const staffLabel = getMemberRoleLabel(member);
      const acceptanceStaff = buildAcceptedPauseLogContent({
        roleLabel: staffLabel,
        effectiveUserId: userId,
        pauseTimingText,
        dataRichiesta: targetPause.dataRichiesta,
        dataRitorno: targetPause.dataRitorno,
        giorniUsati,
        maxGiorni,
        giorniRimanenti,
        sameRoleActiveCount: sameRoleActiveCountStaff,
        roleLimitWarning: "",
      });
      const acceptancePm = buildAcceptedPauseLogContent({
        roleLabel: pmLabel,
        effectiveUserId: userId,
        pauseTimingText,
        dataRichiesta: targetPause.dataRichiesta,
        dataRitorno: targetPause.dataRitorno,
        giorniUsati,
        maxGiorni,
        giorniRimanenti,
        sameRoleActiveCount: sameRoleActiveCountPm,
        roleLimitWarning: "",
      });
      if (msg?.editable) {
        await msg.edit({ content: acceptanceStaff, components: msgComponents }).catch(() => null);
      }
      if (pauseChannel?.send) {
        const sentPm = await pauseChannel
          .send({ content: acceptancePm, components: msgComponents })
          .catch(() => null);
        if (sentPm?.id) {
          await updatePauseInDb(guildId, userId, pauseId, { requestMessageIdPm: String(sentPm.id) });
        }
      }
    } else {
      const pauseRoleLabel = formatPauseRoleLabelForMessage(guild, roleChoice, member);
      const acceptanceContent = buildAcceptedPauseLogContent({
        roleLabel: pauseRoleLabel,
        effectiveUserId: userId,
        pauseTimingText,
        dataRichiesta: targetPause.dataRichiesta,
        dataRitorno: targetPause.dataRitorno,
        giorniUsati,
        maxGiorni,
        giorniRimanenti,
        sameRoleActiveCount,
        roleLimitWarning,
      });
      if (msg?.editable) {
        await msg.edit({ content: acceptanceContent, components: msgComponents }).catch(() => null);
      }
    }

    scheduleStaffListRefresh(client, guildId, 800);
    if (pauseChannel) void maybeRepositionPauseSticky(pauseChannel, client).catch(() => null);
    invalidateStaffPauseCalendarCache();
    notifyStaffPauseCalendarChanged(userId);
    try {
      const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromPause(
        guildId,
        userId,
        pauseId,
        "accepted",
        workflowActorExtras(actorMember),
      );
    } catch (_) {}
    return { ok: true, status: 200, message: "Pausa accettata." };
  } finally {
    pauseActionLocks.delete(lockKey);
  }
}

async function cancelPauseRequestWeb(client, guild, actorMember, userId, pauseId) {
  const guildId = String(guild?.id || "");
  const lockKey = `${guildId}:${userId}:${pauseId}:cancel`;
  if (pauseActionLocks.has(lockKey)) {
    return { ok: false, status: 429, message: "Richiesta già in elaborazione." };
  }
  pauseActionLocks.add(lockKey);
  try {
    const stafferRecord = await getStaffPauseRecord(guildId, userId);
    const targetPause = stafferRecord?.staff?.pauses?.id?.(pauseId);
    if (!targetPause) {
      return { ok: false, status: 404, message: "Pausa non trovata." };
    }
    const pausePhase = getPausePhase(targetPause.dataRichiesta, targetPause.dataRitorno);
    if (pausePhase === "ended") {
      if (targetPause.status === "accepted") {
        await syncSingleAcceptedPauseMessage(guild, userId, targetPause);
      }
      return { ok: false, status: 409, message: "La pausa è scaduta: non è più annullabile." };
    }
    if (targetPause.status !== "accepted") {
      return { ok: false, status: 409, message: "Questa pausa non è annullabile." };
    }

    const member = await getGuildMemberCached(guild, userId);
    const todayUtc = getTodayUtc();
    const start = parseItalianDate(targetPause.dataRichiesta);
    const end = parseItalianDate(targetPause.dataRitorno);
    const totalScheduledDays = getPauseDaysBetween(targetPause.dataRichiesta, targetPause.dataRitorno) || 0;
    let consumedForCancelledPause = 0;
    if (start && end) {
      if (todayUtc < start) consumedForCancelledPause = 0;
      else if (todayUtc > end) consumedForCancelledPause = totalScheduledDays;
      else consumedForCancelledPause = Math.max(1, Math.floor((todayUtc - start) / MS_PER_DAY) + 1);
    }

    await updatePauseInDb(guildId, userId, pauseId, {
      status: "cancelled",
      giorniUsati: consumedForCancelledPause,
      cancelledAt: new Date(),
    });
    targetPause.status = "cancelled";
    targetPause.giorniUsati = consumedForCancelledPause;
    targetPause.cancelledAt = new Date();

    const roleChoiceForPause =
      normalizePauseRoleChoice(targetPause?.ruolo || targetPause?.ruoloRichiesto) || PAUSE_ROLE_STAFF;
    const budgetCancel = member
      ? computeStaffPauseDayBudget(member, stafferRecord, roleChoiceForPause)
      : null;
    const maxGiorni = budgetCancel
      ? budgetCancel.maxGiorni
      : getBasePauseLimit(null, roleChoiceForPause) + getValPosTradedPauseBonusDays(stafferRecord);
    const giorniTotaliUsati = budgetCancel
      ? budgetCancel.usedDays
      : computeConsumedPauseDays(stafferRecord.staff?.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    const roleLabelForCancel = formatPauseRoleLabelForMessage(
      guild,
      roleChoiceForPause === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoiceForPause,
      member,
    );
    const cancelledContent = buildCancelledPauseLogContent({
      roleLabel: roleLabelForCancel,
      effectiveUserId: userId,
      dataRichiesta: targetPause.dataRichiesta,
      dataRitorno: targetPause.dataRitorno,
      giorniScalati: consumedForCancelledPause,
      giorniTotaliUsati,
      maxGiorni,
      giorniRimanenti,
    });
    const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
    const cancelledContentPm = buildCancelledPauseLogContent({
      roleLabel: pmRole?.name || "Partner Manager",
      effectiveUserId: userId,
      dataRichiesta: targetPause.dataRichiesta,
      dataRitorno: targetPause.dataRitorno,
      giorniScalati: consumedForCancelledPause,
      giorniTotaliUsati,
      maxGiorni,
      giorniRimanenti,
    });

    const {
      isDiscordWorkflowUiEnabled,
      buildInboxManageLinkRow,
    } = require("../Web/discordWorkflowUiGate");
    const discordUi = isDiscordWorkflowUiEnabled();
    const buttonsRow = discordUi
      ? buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true })
      : buildInboxManageLinkRow("pause");
    const msgComponents = buttonsRow ? [buttonsRow] : [];

    const staffMsg = await fetchPauseRequestMessage(guild, targetPause);
    const pauseChannel = staffMsg?.channel || null;
    if (staffMsg?.editable) {
      await staffMsg.edit({ content: cancelledContent, components: msgComponents }).catch(() => null);
    }
    const pmMsgId = String(targetPause.requestMessageIdPm || "").trim();
    if (pmMsgId && pauseChannel?.messages?.fetch) {
      const pmMsg = await pauseChannel.messages.fetch(pmMsgId).catch(() => null);
      if (pmMsg?.editable) {
        await pmMsg.edit({ content: cancelledContentPm, components: msgComponents }).catch(() => null);
      }
    }
    if (pauseChannel?.send) {
      const actorTag = actorMember?.displayName || actorMember?.id || "sito";
      await pauseChannel
        .send({
          content: `<:cancel:1461730653677551691> Pausa annullata per <@${userId}> (via sito · ${actorTag}). <a:VC_Calendar:1482706208149475358> Giorni scalati: \`${consumedForCancelledPause}\`. <:VC_Clock:1473359204189474886> Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).`,
        })
        .catch(() => null);
      void maybeRepositionPauseSticky(pauseChannel, client).catch(() => null);
    }

    scheduleStaffListRefresh(client, guildId, 800);
    invalidateStaffPauseCalendarCache();
    notifyStaffPauseCalendarChanged(userId);
    try {
      const { updateStaffWorkflowFromPause, workflowActorExtras } = require("../Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromPause(
        guildId,
        userId,
        pauseId,
        "cancelled",
        workflowActorExtras(actorMember),
      );
    } catch (_) {}
    return { ok: true, status: 200, message: "Pausa annullata.", giorniScalati: consumedForCancelledPause };
  } finally {
    pauseActionLocks.delete(lockKey);
  }
}

module.exports = {
  listPendingStaffPauses,
  listStaffPausesForInbox,
  getStaffPauseInboxDetail,
  acceptPauseRequestWeb,
  rejectPauseRequestWeb,
  cancelPauseRequestWeb,
};
