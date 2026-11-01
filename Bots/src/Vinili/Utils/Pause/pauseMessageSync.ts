/** Pause: messaggi aggiornati nel tempo (stato, pulsanti, pause annullate). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { MS_PER_DAY, getRomeDayStartUtcMs, parseItalianDate } = require("./pauseDates") as typeof import("./pauseDates");
const { PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, getMemberStaffRankRoleId, normalizePauseRoleChoice, getBasePauseLimit } = require("./pauseRoles") as typeof import("./pauseRoles");
const { buildCancelledPauseLogContent, formatPauseRoleLabelForMessage, buildAcceptedPauseMessageContent, getStaffPauseRecord, buildPauseInboxLinkRow, buildAcceptedButtonsRow, normalizePauseStatusPhrase, getPausePhase, getValPosTradedPauseBonusDays, getStaffPauseBonusDaysTotal } = require("./pauseMessages") as typeof import("./pauseMessages");
const { updatePauseInDb, computeConsumedPauseDays, computeConsumedDaysForCancelledPause } = require("./pauseDb") as typeof import("./pauseDb");

const MAX_SET_TIMEOUT_MS = 2147483647;
const pauseStatusRefreshScheduled = new Map();
const pauseRankChangeSyncTimers = new Map();

async function applyAcceptedPausePhaseToDiscordMessage(channel?, messageId?, userId?, pauseId?, phase?, withControls?, rebuiltContent = null) {
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  const currentContent = String(msg.content || "");
  const phrase =
    phase === "planned" ? "andrà in pausa" : phase === "active" ? "è in pausa" : "era in pausa";
  let nextContent = rebuiltContent
    ? normalizePauseStatusPhrase(String(rebuiltContent), phrase)
    : normalizePauseStatusPhrase(currentContent, phrase);
  let nextComponents = [];
  if (withControls) {
    if (phase === "ended") nextComponents = [];
    else nextComponents = [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: false, disableCancel: phase === "ended" })];
  } else {
    nextComponents = [];
  }
  const sameContent = nextContent === currentContent;
  const hasComponentsNow = Array.isArray(msg.components) && msg.components.length > 0;
  const hasComponentsNext = Array.isArray(nextComponents) && nextComponents.length > 0;
  if (sameContent && hasComponentsNow === hasComponentsNext) return true;
  const edited = await msg.edit({ content: nextContent, components: nextComponents }).catch((err?) => {
    global.logger?.warn?.("[PAUSE] sync edit failed:", String(messageId || ""), err?.message || err);
    return null;
  });
  return Boolean(edited);
}

async function syncAcceptedPauseMessagePhaseOnly(guild?, userId?, pause?) {
  const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
  const messageId = String(pause?.requestMessageId || "").trim();
  const messageIdPm = String(pause?.requestMessageIdPm || "").trim();
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !channelId || !messageId || !pauseId) return false;
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return false;
  let ok = await applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, true, null);
  if (messageIdPm) {
    ok =
      (await applyAcceptedPausePhaseToDiscordMessage(channel, messageIdPm, userId, pauseId, phase, true, null)) || ok;
  }
  return ok;
}

async function syncSingleAcceptedPauseMessage(guild?, userId?, pause?) {
  const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
  const messageId = String(pause?.requestMessageId || "").trim();
  const messageIdPm = String(pause?.requestMessageIdPm || "").trim();
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !channelId || !messageId || !pauseId) {
    if (!channelId || !messageId) {
      global.logger?.warn?.("[PAUSE] sync skip: missing refs", { userId, channelId: channelId || null, messageId: messageId || null, pauseId: pauseId || null });
    }
    return false;
  }
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[PAUSE] sync skip: channel unavailable", channelId);
    return false;
  }

  let member = guild.members?.cache?.get(String(userId)) || null;
  if (guild.members?.fetch) {
    member = await guild.members.fetch({ user: String(userId), force: true }).catch(() => member);
  }
  const liveRankId = getMemberStaffRankRoleId(member);
  if (liveRankId && String(pause?.ruoloGradeId || "").trim() !== liveRankId) {
    await updatePauseInDb(guild.id, userId, pauseId, { ruoloGradeId: liveRankId });
    pause.ruoloGradeId = liveRankId;
  }

  const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
  const primaryIsPm = roleChoice === PAUSE_ROLE_PM;
  const primaryContent = await buildAcceptedPauseMessageContent(guild, userId, pause, { forPm: primaryIsPm });
  const pmContent = messageIdPm
    ? await buildAcceptedPauseMessageContent(guild, userId, pause, { forPm: true })
    : null;

  let ok = false;
  ok = (await applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, true, primaryContent)) || ok;
  if (messageIdPm) {
    ok = (await applyAcceptedPausePhaseToDiscordMessage(channel, messageIdPm, userId, pauseId, phase, true, pmContent)) || ok;
  }
  const countMatch = String(primaryContent || "").match(/__`(\d+)`__ staffer in pausa/);
  if (countMatch) {
    const nextCount = Number(countMatch[1]);
    if (Number.isFinite(nextCount) && nextCount !== Number(pause.stafferInPausa)) {
      await updatePauseInDb(guild.id, userId, pauseId, { stafferInPausa: nextCount });
      pause.stafferInPausa = nextCount;
    }
  }
  return ok;
}

async function scheduleAcceptedPauseMessagesRefreshAfterRankChange(guild?, userId?) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!guildId || !uid || !guild?.client) return;
  const inAcceptedPause = await ActivityUserProfile.exists({
    guildId,
    userId: uid,
    "staff.pauses": { $elemMatch: { status: "accepted" } },
  }).catch(() => null);
  if (!inAcceptedPause) return;
  const prev = pauseRankChangeSyncTimers.get(guildId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    pauseRankChangeSyncTimers.delete(guildId);
    restorePauseMessageStatusSync(guild.client).catch((err?) => {
      global.logger?.warn?.("[PAUSE] rank-change pause message sync failed:", err?.message || err);
    });
  }, 2500);
  if (typeof timer?.unref === "function") timer.unref();
  pauseRankChangeSyncTimers.set(guildId, timer);
}

function scheduleDelayedCallback(runAtMs?, callback?) {
  const delayMs = runAtMs - Date.now();
  if (delayMs <= 0) {
    callback();
    return;
  }
  const waitMs = Math.min(delayMs, MAX_SET_TIMEOUT_MS);
  const timer = setTimeout(() => {
    if (Date.now() < runAtMs) {
      scheduleDelayedCallback(runAtMs, callback);
      return;
    }
    callback();
  }, waitMs);
  if (typeof timer?.unref === "function") timer.unref();
}

function pauseStatusRefreshKey(guildId?, userId?, pauseId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}:${String(pauseId || "").trim()}`;
}

function schedulePauseStatusRefresh(guild?, userId?, pause?) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const end = parseItalianDate(pause?.dataRitorno);
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !pause || !start || !end || !pauseId) return;
  const key = pauseStatusRefreshKey(guild.id, userId, pauseId);
  const flags = pauseStatusRefreshScheduled.get(key) || { start: false, end: false };
  const runPhaseSync = () => {
        syncAcceptedPauseMessagePhaseOnly(guild, userId, pause).catch(() => null);
  };
      const startAt = getRomeDayStartUtcMs(start) ?? start.getTime();
  const dayAfterEnd = new Date(end.getTime() + MS_PER_DAY);
  const endAt = getRomeDayStartUtcMs(dayAfterEnd) ?? dayAfterEnd.getTime();
  const now = Date.now();
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);

  if (!flags.start) {
    flags.start = true;
    if (now < startAt) {
      scheduleDelayedCallback(startAt, runPhaseSync);
    }
  }
  if (!flags.end) {
    flags.end = true;
    if (now < endAt) {
      scheduleDelayedCallback(endAt, runPhaseSync);
    }
  }
  pauseStatusRefreshScheduled.set(key, flags);

      if (phase === "ended" && now >= endAt) {
    runPhaseSync();
  }
}

async function restorePauseMessageStatusSync(client?) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "accepted" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  let synced = 0;
  let examined = 0;
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    for (const pause of pauses) {
      if (!pause || pause.status !== "accepted") continue;
      examined += 1;
      if (await syncAcceptedPauseMessagePhaseOnly(guild, userId, pause)) synced += 1;
      schedulePauseStatusRefresh(guild, userId, pause);
    }
  }
  return { ok: true, examined, synced };
}

async function cancelOpenPausesOnMemberLeave(guild?, userId?, options: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!guildId || !uid) return { cancelled: 0 };
  const stafferRecord = await getStaffPauseRecord(guildId, uid);
  if (!stafferRecord) return { cancelled: 0 };
  const pauses = Array.isArray(stafferRecord.staff?.pauses) ? stafferRecord.staff.pauses : [];
  if (!pauses.length) return { cancelled: 0 };

  let cancelled = 0;

  async function deletePauseDiscordMessages(pause?) {
    const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
    const channel = channelId ? await getGuildChannelCached(guild, channelId) : null;
    if (!channel?.isTextBased?.()) return;
    const messageIds = [pause?.requestMessageId, pause?.requestMessageIdPm]
      .map((id?) => String(id || "").trim())
      .filter(Boolean);
    for (const mid of messageIds) {
      const msg = await channel.messages.fetch(mid).catch(() => null);
      if (msg) await msg.delete().catch(() => null);
    }
    const threadId = String(pause?.requestThreadId || "").trim();
    if (threadId) {
      let thread = await guild.channels.fetch(threadId).catch(() => null);
      if (!thread && guild.client) thread = await guild.client.channels.fetch(threadId).catch(() => null);
      if (thread?.isThread?.()) await thread.delete().catch(() => null);
    }
  }

  for (const pause of pauses) {
    const status = String(pause?.status || "");
    const pauseId = String(pause?._id || "").trim();
    if (!pauseId) continue;

    if (status === "pending") {
      await updatePauseInDb(guildId, uid, pauseId, { status: "cancelled", cancelledAt: new Date() });
      pause.status = "cancelled";
      pause.cancelledAt = new Date();
      cancelled += 1;
      try {
        const { updateStaffWorkflowFromPause } = require("../../features/workflow/siteStaffWorkflowStore") as typeof import("../../features/workflow/siteStaffWorkflowStore");
        await updateStaffWorkflowFromPause(guildId, uid, pauseId, "cancelled", {
          statusLabel: String(options.reason || "Annullato (uscita)").slice(0, 200),
          staffReason: String(options.reason || "Annullato (uscita)").slice(0, 200),
          decidedBy: "system",
        });
      } catch (_) {}
      await deletePauseDiscordMessages(pause);
      continue;
    }

    if (status !== "accepted") continue;
    if (getPausePhase(pause.dataRichiesta, pause.dataRitorno) === "ended") continue;

    const consumed = computeConsumedDaysForCancelledPause(pause);
    await updatePauseInDb(guildId, uid, pauseId, {
      status: "cancelled",
      giorniUsati: consumed,
      cancelledAt: new Date(),
    });
    pause.status = "cancelled";
    pause.giorniUsati = consumed;
    pause.cancelledAt = new Date();
    cancelled += 1;
    await deletePauseDiscordMessages(pause);
  }

  if (cancelled > 0) {
    try {
      const { broadcastSiteStaffPausesChanged } = require("../../features/suggestions/siteSuggestionsBroadcast") as typeof import("../../features/suggestions/siteSuggestionsBroadcast");
      broadcastSiteStaffPausesChanged();
    } catch {
    }
    /* staffProfLiveAll1 */
    try {
      if (/^\d{16,22}$/.test(uid)) {
        require("../../features/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(uid, { action: "pause" });
      }
    } catch {
    }
  }
  return { cancelled };
}

function cancelledPauseMessageLooksStale(content?) {
  const text = String(content || "");
  if (!text) return false;
  if (/aveva una pausa \*\*annullata\*\*/i.test(text)) return false;
    if (/ANNULLATA/i.test(text) && /(è in pausa|andrà in pausa|era in pausa)/i.test(text)) return true;
  if (/ANNULLATA/i.test(text) && /Limite ruolo/i.test(text)) return true;
  return false;
}

async function applyCancelledPauseContentToMessage(channel?, messageId?, content?, userId?, pauseId?) {
  const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
  if (!msg) return false;
  if (!cancelledPauseMessageLooksStale(msg.content) && String(msg.content || "") === String(content || "")) {
    return false;
  }
  if (!cancelledPauseMessageLooksStale(msg.content) && /aveva una pausa \*\*annullata\*\*/i.test(String(msg.content || ""))) {
    return false;
  }
  const components = [buildPauseInboxLinkRow()];
  const edited = await msg.edit({ content, components }).catch((err?) => {
    global.logger?.warn?.("[PAUSE] cancelled message rewrite failed:", String(messageId), err?.message || err);
    return null;
  });
  return Boolean(edited);
}

async function rewriteStaleCancelledPauseMessages(client?) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild", rewritten: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found", rewritten: 0 };

  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "cancelled" },
    { userId: 1, staff: 1 },
  )
    .lean()
    .catch(() => []);

  let examined = 0;
  let rewritten = 0;
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    let member = guild.members?.cache?.get(userId) || null;
    if (!member && guild.members?.fetch) {
      member = await guild.members.fetch({ user: userId }).catch(() => null);
    }
    for (const pause of pauses) {
      if (!pause || pause.status !== "cancelled") continue;
      const pauseId = String(pause._id || "").trim();
      const channelId = String(pause.requestChannelId || IDs.channels?.pause || "").trim();
      const messageId = String(pause.requestMessageId || "").trim();
      const messageIdPm = String(pause.requestMessageIdPm || "").trim();
      if (!pauseId || !channelId || !messageId) continue;
      examined += 1;

      const channel = await getGuildChannelCached(guild, channelId);
      if (!channel?.isTextBased?.()) continue;

      const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
      const baseLimit = getBasePauseLimit(member, roleChoice);
      const bonusPause = member
        ? getStaffPauseBonusDaysTotal(member, doc)
        : getValPosTradedPauseBonusDays(doc);
      const maxGiorni = baseLimit + bonusPause;
      const giorniTotaliUsati = computeConsumedPauseDays(doc?.staff?.pauses);
      const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);
      const giorniScalati = Number.isFinite(Number(pause.giorniUsati))
        ? Math.max(0, Number(pause.giorniUsati))
        : computeConsumedDaysForCancelledPause(pause);

      const roleLabel = formatPauseRoleLabelForMessage(
        guild,
        roleChoice === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoice,
        member,
      );
      const staffContent = buildCancelledPauseLogContent({
        roleLabel,
        effectiveUserId: userId,
        dataRichiesta: pause.dataRichiesta,
        dataRitorno: pause.dataRitorno,
        giorniScalati,
        giorniTotaliUsati,
        maxGiorni,
        giorniRimanenti,
      });
      if (await applyCancelledPauseContentToMessage(channel, messageId, staffContent, userId, pauseId)) {
        rewritten += 1;
      }

      if (messageIdPm) {
        const pmRole = guild.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
        const pmContent = buildCancelledPauseLogContent({
          roleLabel: pmRole?.name || "Partner Manager",
          effectiveUserId: userId,
          dataRichiesta: pause.dataRichiesta,
          dataRitorno: pause.dataRitorno,
          giorniScalati,
          giorniTotaliUsati,
          maxGiorni,
          giorniRimanenti,
        });
        if (await applyCancelledPauseContentToMessage(channel, messageIdPm, pmContent, userId, pauseId)) {
          rewritten += 1;
        }
      }
    }
  }
  return { ok: true, examined, rewritten };
}

export = { syncSingleAcceptedPauseMessage, scheduleAcceptedPauseMessagesRefreshAfterRankChange, cancelOpenPausesOnMemberLeave, rewriteStaleCancelledPauseMessages };
