const { getRomeWeekKey, getRomeSaturdayKeyForWeek, getMovieNightFinalAnnouncementSlot, shouldAttemptMovieNightEventStartRecovery, shouldAttemptMovieNightStageCloseRecovery, getMovieNightStartupRecoverySlot, hasMovieNightSpareggio, getHarryPotterMovieNightScheduleForWeek, getFixedMovieTitleForWeek, resolveExtraMovieNightDateKey, getMovieNightEventStartDate } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_NAME, isTargetMovieNightEvent, isFixedScheduleMovieNightEvent, findCurrentWeekMovieNightEvent } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const { EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID, FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS, buildMovieNightAnnouncementMessage, buildDiscordEventUrl, buildFinalMovieNightAnnouncementMessage, buildMovieNightStartAnnouncementMessage } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { isFallbackMovieDescription, fetchItalianMovieDescription } = require("./movieNightDescriptions") as typeof import("./movieNightDescriptions");
const { ANNOUNCEMENT_CHANNEL_ID, maybePublishTieBreakerPoll, hydrateMovieNightStateForWeek, resolveMovieNightThread, resolveFinalMovieTitle, describeFinalMovieTitleMiss } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { STATE_KEY, fetchAnnouncementChannel, isMovieNightFinalPublicAnnouncePresent, movieNightStaffCommunicationStatePatch, resolveMovieNightFinalAnnounceStatus, resolveMovieNightEventStartStatus, repairMovieNightFinalAnnounceState, logMovieNightFinalResult } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const { pickOpenReviewThreadStateFields, ensureMovieNightReviewThreadTracking, closeMovieNightReviewThreadIfDue } = require("./movieNightReviewThread") as typeof import("./movieNightReviewThread");
const { openMovieNightStagePermissions } = require("./movieNightStage") as typeof import("./movieNightStage");
const { maybePublishMovieNightStaffCommunication, repairFinalMovieNightAnnouncementDescription, repairMovieNightStaffCommunication, ensureMovieNightStaffCommunicationOnStartup } = require("./movieNightRepairs") as typeof import("./movieNightRepairs");
const { handleMovieNightStageClose, runMovieNightStageCloseRecoveryCheck } = require("./movieNightStageCloseFlow") as typeof import("./movieNightStageCloseFlow");
const { runExtraMovieNightEventStartCheck } = require("./movieNightExtraChecks") as typeof import("./movieNightExtraChecks");
const { startMovieNightAnnouncementLoop: startMovieNightAnnouncementLoopImpl } = require("./movieNightAnnouncementLoop") as typeof import("./movieNightAnnouncementLoop");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getClientGuildCached, getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { mergeWatchedTitleEntries } = require("../../Utils/Community/movieNightWatchedTitles") as typeof import("../../Utils/Community/movieNightWatchedTitles");
const { startSerataFilmAttendanceSession, restoreSerataFilmAttendanceSession } = require("./serataFilmAttendance") as typeof import("./serataFilmAttendance");
const { startSerataFilmSession } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");

let movieNightAnnouncementRunning = false;
let movieNightThreadCloseRunning = false;
let movieNightFinalAnnouncementRunning = false;
let movieNightEventStartRunning = false;

async function publishMovieNightAnnouncement(guild?, event?, weekKey?) {
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "announcement_channel_unavailable" };
  }

  const message = await channel.send({
    content: buildMovieNightAnnouncementMessage(),
    allowedMentions: { roles: [EVENTS_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  let thread = await message.startThread({
    name: MOVIE_NIGHT_NAME,
    autoArchiveDuration: 10080,
    reason: "Thread automatico suggerimenti Serata Film",
  }).catch(() => null);
  if (!thread) {
    thread = await message.startThread({
      name: MOVIE_NIGHT_NAME,
      autoArchiveDuration: 1440,
      reason: "Thread automatico suggerimenti Serata Film",
    }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread create failed:", err?.message || err);
      return null;
    });
  }

  const previousState = await getBotState(STATE_KEY, null);
  const previousWeekKey = String(previousState?.weekKey || "");
  const keepPriorWeekFields = previousWeekKey && previousWeekKey === weekKey && previousState && typeof previousState === "object";
  const openReviewFields = pickOpenReviewThreadStateFields(previousState);
  const archivedWatched = mergeWatchedTitleEntries(
    previousState?.watchedMovieTitles,
    previousState?.stageCloseMovieTitle
      ? {
          title: previousState.stageCloseMovieTitle,
          source: "week_roll_stage",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
    previousState?.finalMovieTitle
      ? {
          title: previousState.finalMovieTitle,
          source: "week_roll_final",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
    previousState?.eventStartMovieTitle
      ? {
          title: previousState.eventStartMovieTitle,
          source: "week_roll_event",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
  );
  await setBotState(STATE_KEY, {
    ...(keepPriorWeekFields ? previousState : openReviewFields),
    watchedMovieTitles: archivedWatched,
    watchedTitlesBootstrappedAt: previousState?.watchedTitlesBootstrappedAt || "",
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event?.id || ""),
    messageId: String(message.id || ""),
    threadId: String(thread?.id || ""),
    announcedAt: new Date().toISOString(),
    /* movieNightStrictProposal1: anno + durata/vecchiaia dal prossimo announce in poi */
    strictProposalRules: true,
  });

  return { ok: true, messageId: String(message.id || ""), threadId: String(thread?.id || "") };
}

async function runMovieNightFinalAnnouncementCheck(client?, opts: Record<string, any> = {}) {
  if (movieNightFinalAnnouncementRunning) {
    const out = { skipped: true, reason: "already_running" };
    logMovieNightFinalResult(out, "concurrent");
    return out;
  }
  movieNightFinalAnnouncementRunning = true;
  try {
    if (!isMongoReady()) {
      const out = { skipped: true, reason: "mongo_not_ready" };
      logMovieNightFinalResult(out);
      return out;
    }
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const saturdayKey = getRomeSaturdayKeyForWeek(now);
    const announceSlot = getMovieNightFinalAnnouncementSlot(now, opts.slot);
    if (!opts.force && !announceSlot) {
      const out = { skipped: true, reason: "outside_final_announce_slot", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (announceSlot === "friday" && !opts.force && hasMovieNightSpareggio(state)) {
      const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
      logMovieNightFinalResult(out);
      return out;
    }
    if (announceSlot === "friday" && state?.threadId && !state?.closedAt) {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] friday thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
      if (!opts.force && hasMovieNightSpareggio(state)) {
        const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
        logMovieNightFinalResult(out);
        return out;
      }
    }
    if (state?.threadId && !state?.closedAt && announceSlot !== "friday") {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
    }
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule?.skip) {
      const out = { skipped: true, reason: "fixed_schedule_skip", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    const hasFixedMovie = Boolean(getFixedMovieTitleForWeek(now));
    const allowWithoutMondayState =
      hasFixedMovie || FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(saturdayKey);
    if (state?.weekKey !== weekKey && !allowWithoutMondayState) {
      const out = {
        skipped: true,
        reason: "state_not_current_week",
        weekKey,
        stateWeekKey: state?.weekKey || null,
      };
      logMovieNightFinalResult(out);
      return out;
    }
    if (!opts.force) {
      const announceStatus = await resolveMovieNightFinalAnnounceStatus(client, state, weekKey, saturdayKey, now);
      if (announceStatus.done) {
        state = await repairMovieNightFinalAnnounceState(client, state, weekKey, saturdayKey, announceStatus);
        /* movieDescWiki1: ripara anche descrizione fallback (non solo title drift) */
        const needsDescRepair =
          Boolean(announceStatus.repairTitle) ||
          isFallbackMovieDescription(state?.finalMovieDescription);
        if (needsDescRepair) {
          await repairFinalMovieNightAnnouncementDescription(client).catch((err?) => {
            global.logger?.warn?.("[MOVIE NIGHT FINAL] description repair failed:", err?.message || err);
          });
        }
        const staffResult = await maybePublishMovieNightStaffCommunication(client, {
          state,
          saturdayKey,
          weekKey,
          now,
          announceSlot,
          title: state?.finalMovieTitle || getFixedMovieTitleForWeek(now),
        });
        const staffPatch = movieNightStaffCommunicationStatePatch(staffResult, saturdayKey);
        if (Object.keys(staffPatch).length) {
          await setBotState(STATE_KEY, {
            ...state,
            ...staffPatch,
          });
        }
        const out = {
          skipped: true,
          reason: announceStatus.reason || "already_announced",
          weekKey,
          saturdayKey,
        };
        logMovieNightFinalResult(out);
        return out;
      }
    }

    const title = await resolveFinalMovieTitle(client, state, now);
    if (!title) {
      const detail = await describeFinalMovieTitleMiss(client, state, now).catch(() => "");
      const out = { skipped: true, reason: "winner_unavailable", weekKey, detail };
      logMovieNightFinalResult(out);
      if (detail) global.logger?.warn?.("[MOVIE NIGHT FINAL] winner_unavailable:", detail);
      return out;
    }

    const channel = await fetchAnnouncementChannel(client);
    if (!channel?.isTextBased?.() || !channel?.send) {
      const out = { skipped: true, reason: "announcement_channel_unavailable", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }

    const description = await fetchItalianMovieDescription(title);
    const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
    const event = guild ? await findCurrentWeekMovieNightEvent(guild, now) : null;
    const previousState =
      state?.weekKey === weekKey && typeof state === "object"
        ? state
        : typeof state === "object"
          ? state
          : {};
    const message = await channel.send({
      content: buildFinalMovieNightAnnouncementMessage({
        title,
        description,
        eventUrl: buildDiscordEventUrl(previousState?.guildId || guildId || IDs.guilds?.main, previousState?.eventId || event?.id),
        saturdayKey,
        announceSlot,
      }),
      allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
      __skipNoticeEmbed: true,
    });

    const staffResult: any = await maybePublishMovieNightStaffCommunication(client, {
      state: previousState,
      saturdayKey,
      weekKey,
      now,
      announceSlot,
      title,
    });
    await setBotState(STATE_KEY, {
      ...previousState,
      weekKey,
      guildId: String(guild?.id || previousState?.guildId || guildId || ""),
      eventId: String(event?.id || previousState?.eventId || ""),
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncementMessageId: String(message.id || ""),
      finalAnnouncedSaturdayKey: saturdayKey,
      finalAnnouncedAt: new Date().toISOString(),
      ...movieNightStaffCommunicationStatePatch(staffResult, saturdayKey),
    });
    const out = {
      ok: true,
      title,
      messageId: String(message.id || ""),
      staffCommunicationMessageId: staffResult?.ok ? String(staffResult.messageId || "") : "",
      weekKey,
    };
    logMovieNightFinalResult(out);
    return out;
  } finally {
    movieNightFinalAnnouncementRunning = false;
  }
}

async function handleMovieNightEventStart(event?, opts: Record<string, any> = {}) {
  const now = opts.now || new Date();
  const startDate = event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : now);
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(startDate);
  if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip" };
  if (!isTargetMovieNightEvent(event, now) && !isFixedScheduleMovieNightEvent(event, now)) return { skipped: true, reason: "not_movie_night_event" };
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  const client = event.client || guild.client;
  const weekKey = getRomeWeekKey(startDate);
  const state = await getBotState(STATE_KEY, null);
  if (!opts.force) {
    const startStatus = await resolveMovieNightEventStartStatus(client, state, weekKey);
    if (startStatus.done) {
      let permissionsOpened = false;
      if (!String(state?.stagePermissionsOpenedAt || "").trim() || String(state?.weekKey || "") !== weekKey) {
        permissionsOpened = await openMovieNightStagePermissions(guild);
        if (permissionsOpened && state && typeof state === "object") {
          await setBotState(STATE_KEY, {
            ...state,
            weekKey,
            stagePermissionsOpenedAt: new Date().toISOString(),
          });
        }
      }
      await startSerataFilmAttendanceSession(guild).catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film attendance start failed:", err?.message || err);
      });
      await startSerataFilmSession(event).catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff session start failed:", err?.message || err);
      });
      return { skipped: true, reason: startStatus.reason || "already_announced", weekKey, permissionsOpened };
    }
  }

  const permissionsOpened = await openMovieNightStagePermissions(guild);
  const title = (await resolveFinalMovieTitle(client, state, startDate).catch(() => null)) || state?.finalMovieTitle || "il film scelto";
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsOpened };
  }

  const message = await channel.send({
    content: buildMovieNightStartAnnouncementMessage(title),
    allowedMentions: { parse: ["everyone"], roles: [SERATA_FILM_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event.id || state?.eventId || ""),
    eventStartMovieTitle: title,
    eventStartMessageId: String(message.id || ""),
    stagePermissionsOpenedAt: permissionsOpened ? new Date().toISOString() : state?.stagePermissionsOpenedAt || "",
    eventStartAnnouncedAt: new Date().toISOString(),
  });
  await startSerataFilmAttendanceSession(guild).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film attendance start failed:", err?.message || err);
  });
  await startSerataFilmSession(event).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff session start failed:", err?.message || err);
  });
  return { ok: true, messageId: String(message.id || ""), title, permissionsOpened, weekKey };
}

async function runMovieNightAnnouncementCheck(client?, opts: Record<string, any> = {}) {
  if (movieNightAnnouncementRunning) return { skipped: true, reason: "already_running" };
  movieNightAnnouncementRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_movie", weekKey };
    }
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force && state?.weekKey === weekKey && state?.messageId) {
      return { skipped: true, reason: "already_announced", weekKey };
    }

    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId)))) || client.guilds.cache.first();
    if (!guild) return { skipped: true, reason: "guild_unavailable", weekKey };

    const event = await findCurrentWeekMovieNightEvent(guild, now);
    if (!event) return { skipped: true, reason: "event_not_found", weekKey };

    return await publishMovieNightAnnouncement(guild, event, weekKey);
  } finally {
    movieNightAnnouncementRunning = false;
  }
}

async function runMovieNightThreadCloseCheck(client?, opts: Record<string, any> = {}) {
  if (movieNightThreadCloseRunning) return { skipped: true, reason: "already_running" };
  movieNightThreadCloseRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_no_vote_thread", weekKey };
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (!state?.threadId) {
      return { skipped: true, reason: "thread_not_recorded", weekKey };
    }
    if (!opts.force && state?.closedAt) {
      return { skipped: true, reason: "already_closed", weekKey };
    }

    const thread = await resolveMovieNightThread(client, state.threadId);
    if (!thread?.isThread?.()) return { skipped: true, reason: "thread_unavailable", weekKey };
    const tieBreaker: any = await maybePublishTieBreakerPoll(client, thread, state).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] tie breaker poll failed:", err?.message || err);
      return { skipped: true, reason: "tie_poll_failed" };
    });
    if (thread.archived && !thread.locked) {
      await thread.setArchived(false, "Riapertura tecnica per bloccare il thread Serata Film").catch(() => null);
    }
    if (!thread.locked && thread.setLocked) {
      await thread.setLocked(true, "Chiusura votazioni Serata Film").catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread lock failed:", err?.message || err);
      });
    }
    if (!thread.archived && thread.setArchived) {
      await thread.setArchived(true, "Chiusura votazioni Serata Film").catch((err?) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread archive failed:", err?.message || err);
      });
    }

    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      voteResults: Array.isArray(tieBreaker?.voteResults) ? tieBreaker.voteResults : state?.voteResults || [],
      tieBreakerPollMessageId: tieBreaker?.tieBreakerPollMessageId || state?.tieBreakerPollMessageId || "",
      tiedMovieTitles: tieBreaker?.tiedMovieTitles || state?.tiedMovieTitles || [],
      topTieVotes: Number.isFinite(Number(tieBreaker?.topVotes)) ? Number(tieBreaker.topVotes) : state?.topTieVotes,
      closedAt: new Date().toISOString(),
    });
    return { ok: true, threadId: String(thread.id || ""), weekKey };
  } finally {
    movieNightThreadCloseRunning = false;
  }
}

async function recoverMovieNightAnnouncementsOnStartup(client?, opts: Record<string, any> = {}) {
  const { isRecoveryPrimaryShard } = require("../../Utils/Community/supportersChannelEmbedRecoveryUtils") as typeof import("../../Utils/Community/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const now = opts.now || new Date();
  const steps: Record<string, any> = {};
  const weekKey = getRomeWeekKey(now);
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
  const publicPresent = await isMovieNightFinalPublicAnnouncePresent(client, state, weekKey, now);
  if (publicPresent) {
    steps.finalAnnouncementRepair = await repairFinalMovieNightAnnouncementDescription(client);
    steps.staffCommunication = await repairMovieNightStaffCommunication(client, { now });
  }
  const slot = getMovieNightStartupRecoverySlot(now);
  if (!slot) return { ok: true, skipped: true, reason: "outside_recovery_window", steps };
  if (slot === "monday") {
    steps.mondayAnnounce = await runMovieNightAnnouncementCheck(client, { now });
  } else if (slot === "thread_close") {
    steps.threadClose = await runMovieNightThreadCloseCheck(client, { now });
  } else if (slot === "final_friday") {
    steps.finalFriday = await runMovieNightFinalAnnouncementCheck(client, { now, slot: "friday" });
  } else if (slot === "final_saturday") {
    steps.finalSaturday = await runMovieNightFinalAnnouncementCheck(client, { now, slot: "saturday" });
  } else if (slot === "event_start") {
    steps.eventStart = await runMovieNightEventStartCheck(client, { now });
  }
  if (shouldAttemptMovieNightStageCloseRecovery(now)) {
    steps.stageClose = await runMovieNightStageCloseRecoveryCheck(client, { now });
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const mainGuild = mainGuildId
    ? (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId).catch(() => null)))
    : client.guilds.cache.first();
  if (mainGuild) {
    steps.serataFilmAttendanceRestore = await restoreSerataFilmAttendanceSession(mainGuild).then(() => ({ ok: true })).catch((err?) => ({
      ok: false,
      error: err?.message || String(err),
    }));
  }
  steps.reviewThreadTracking = await ensureMovieNightReviewThreadTracking(client).catch((err?) => ({
    ok: false,
    error: err?.message || String(err),
  }));
  steps.reviewThreadClose = await closeMovieNightReviewThreadIfDue(client).catch((err?) => ({
    ok: false,
    error: err?.message || String(err),
  }));
  return { ok: true, slot, steps };
}

async function runMovieNightEventStartCheck(client?, opts: Record<string, any> = {}) {
  if (movieNightEventStartRunning) return { skipped: true, reason: "already_running" };
  movieNightEventStartRunning = true;
  try {
    const now = opts.now || new Date();
    if (!shouldAttemptMovieNightEventStartRecovery(now)) {
      return { skipped: true, reason: "outside_window" };
    }
    if (resolveExtraMovieNightDateKey(now)) {
      return await runExtraMovieNightEventStartCheck(client, opts);
    }
    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
    if (!guild) return { skipped: true, reason: "guild_unavailable" };
    const event = await findCurrentWeekMovieNightEvent(guild, now);
    if (!event) return { skipped: true, reason: "no_event" };
    const status = Number(event.status || 0);
    if (status === 3 || status === 4) return { skipped: true, reason: "event_ended" };
    const startMs = Number(event.scheduledStartTimestamp || getMovieNightEventStartDate(event)?.getTime() || 0);
    if (status === 1 && startMs && now.getTime() + 60_000 < startMs) {
      return { skipped: true, reason: "event_not_due" };
    }
    return await handleMovieNightEventStart(event, { now, force: Boolean(opts.force) });
  } finally {
    movieNightEventStartRunning = false;
  }
}

function startMovieNightAnnouncementLoop(client?) {
  return startMovieNightAnnouncementLoopImpl(client, {
    runMovieNightAnnouncementCheck,
    runMovieNightThreadCloseCheck,
    runMovieNightFinalAnnouncementCheck,
    runMovieNightEventStartCheck,
  });
}

export = { ensureMovieNightStaffCommunicationOnStartup, handleMovieNightEventStart, handleMovieNightStageClose, recoverMovieNightAnnouncementsOnStartup, startMovieNightAnnouncementLoop };
