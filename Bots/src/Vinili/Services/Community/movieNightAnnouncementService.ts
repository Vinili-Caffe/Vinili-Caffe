const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const BotState = require("../../Schemas/BotState/botStateSchema");
const { TIME_ZONE, MOVIE_NIGHT_DISPLAY_TIME, ITALIAN_MONTH_NAMES, EXTRA_FIXED_MOVIE_NIGHTS, getRomeParts, getRomeWeekKey, getRomeSaturdayKeyForWeek, formatMovieNightStaffDateLabel, getMovieNightFinalAnnouncementSlot, shouldAttemptMovieNightEventStartRecovery, shouldAttemptMovieNightStageCloseRecovery, getMovieNightStartupRecoverySlot, hasMovieNightSpareggio, getRomeDateKey, getHarryPotterMovieNightScheduleForWeek, getExtraFixedMovieNight, getFixedMovieTitleForWeek, getFixedMovieTitleForDate, resolveExtraMovieNightDateKey, getExtraMovieNightState, patchExtraMovieNightState, getMovieNightEventStartDate } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_NAME, MOVIE_NIGHT_EVENT_CHANNEL_ID, isTargetMovieNightEvent, isFixedScheduleMovieNightEvent, findCurrentWeekMovieNightEvent, findExtraMovieNightEvent } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const { EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID, STAFF_COMMUNICATION_ROLE_ID, FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS, buildMovieNightAnnouncementMessage, buildDiscordEventUrl, buildMovieNightStaffCommunicationMessage, buildFinalMovieNightAnnouncementMessage, buildMovieNightStartAnnouncementMessage, buildMovieNightEndAnnouncementMessage } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { isFallbackMovieDescription, fetchItalianMovieDescription } = require("./movieNightDescriptions") as typeof import("./movieNightDescriptions");
const { ANNOUNCEMENT_CHANNEL_ID, maybePublishTieBreakerPoll, hydrateMovieNightStateForWeek, resolveMovieNightThread, resolveFinalMovieTitle, describeFinalMovieTitleMiss } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { STATE_KEY, fetchStageCloseMessageForWeek, fetchAnnouncementChannel, fetchStaffCommunicationChannel, isMovieNightFinalPublicAnnouncePresent, movieNightStaffCommunicationStatePatch, resolveMovieNightFinalAnnounceStatus, resolveMovieNightEventStartStatus, repairMovieNightFinalAnnounceState, logMovieNightFinalResult, resolveTextChannelForMovieNight } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const { REVIEW_THREAD_CLOSE_AFTER_MS, pickOpenReviewThreadStateFields, ensureMovieNightReviewThreadTracking, closeMovieNightReviewThreadIfDue, findRecentMovieNightEndAnnouncementInChannel, ensureReviewThreadForEndMessage } = require("./movieNightReviewThread") as typeof import("./movieNightReviewThread");
const { openMovieNightStagePermissions, closeMovieNightStagePermissions, isSerataFilmStageLive } = require("./movieNightStage") as typeof import("./movieNightStage");
const { maybePublishMovieNightStaffCommunication, repairFinalMovieNightAnnouncementDescription, repairMovieNightStaffCommunication, ensureMovieNightStaffCommunicationOnStartup } = require("./movieNightRepairs") as typeof import("./movieNightRepairs");









const { COMPACT_BOTSTATE_KEY } = BotState;
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  ensureWatchedMovieNightTitlesReady,
  mergeWatchedTitleEntries,
} = require("../../Utils/Community/movieNightWatchedTitles") as typeof import("../../Utils/Community/movieNightWatchedTitles");
const { startSerataFilmAttendanceSession, snapshotSerataFilmAttendance, clearSerataFilmAttendanceSession, restoreSerataFilmAttendanceSession } = require("./serataFilmAttendance") as typeof import("./serataFilmAttendance");
const { startSerataFilmSession, finishSerataFilmSessionsForChannel } = require("../Staff/staffAutoValutazioniService") as typeof import("../Staff/staffAutoValutazioniService");
const ANNOUNCE_CRON = "0 15 * * 1";
const CLOSE_THREAD_CRON = "0 20 * * 5";
const FINAL_ANNOUNCEMENT_FRIDAY_CRON = "0 21 * * 5";
const FINAL_ANNOUNCEMENT_SATURDAY_CRON = "0 12 * * 6";
const EVENT_START_SWEEP_CRON = "*/2 * * * 3,6";
const STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4,6,0";
let movieNightStageCloseRecoveryRunning = false;
const REVIEW_THREAD_SWEEP_MS = 5 * 60 * 1000;
const EXTRA_FINAL_EVE_CRON = "0 21 * * 2";
const EXTRA_FINAL_DAY_CRON = "0 12 * * 3";
const EXTRA_EVENT_START_SWEEP_CRON = "*/2 * * * 3";
const EXTRA_STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4";
let movieNightAnnouncementTasks = null;
let movieNightAnnouncementRunning = false;
let movieNightThreadCloseRunning = false;
let movieNightFinalAnnouncementRunning = false;
let movieNightEventStartRunning = false;
let movieNightReviewCloseSweep = null;
const movieNightStageCloseLocksByWeek = new Map();

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

async function syncLiveMovieNightAnnouncementMessage(client?) {
  const state = await getBotState(STATE_KEY, null).catch(() => null);
  const messageId = String(state?.messageId || "").trim();
  const guildId = String(state?.guildId || IDs.guilds?.main || "").trim();
  if (!messageId || !guildId) return { ok: false, reason: "no_state_message" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const channel =
    guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  if (!channel?.messages?.fetch) return { ok: false, reason: "channel_unavailable" };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return { ok: false, reason: "message_not_found" };
  const content = buildMovieNightAnnouncementMessage();
  if (String(message.content || "") === content) {
    return { ok: true, reason: "already_synced", messageId, skippedStrict: true };
  }
  await message.edit({
    content,
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
  });
  /* Non attivare strictProposalRules sul thread già aperto */
  return { ok: true, reason: "edited", messageId, skippedStrict: true };
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

async function withMovieNightStageCloseLock(weekKey?, fn?) {
  const lockKey = String(weekKey || "");
  const prev = movieNightStageCloseLocksByWeek.get(lockKey) || Promise.resolve();
  const mine = prev.catch(() => {}).then(() => fn());
  movieNightStageCloseLocksByWeek.set(lockKey, mine);
  try {
    return await mine;
  } finally {
    if (movieNightStageCloseLocksByWeek.get(lockKey) === mine) {
      movieNightStageCloseLocksByWeek.delete(lockKey);
    }
  }
}

async function claimMovieNightStageCloseSlot(weekKey?) {
  if (!isMongoReady()) return { claimed: true, reason: "no_mongo" };
  const stageCloseIdPath = `value.${STATE_KEY}.stageCloseMessageId`;
  const weekKeyPath = `value.${STATE_KEY}.weekKey`;
  try {
    const compact = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
    if (!compact) {
      const state = await getBotState(STATE_KEY, null);
      if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
        return { claimed: false, reason: "already_announced", state };
      }
      await setBotState(STATE_KEY, {
        ...(state && typeof state === "object" ? state : {}),
        weekKey,
        stageCloseMessageId: "pending",
      });
      return { claimed: true, reason: "legacy_reserve" };
    }
    const result = await BotState.updateOne(
      {
        key: COMPACT_BOTSTATE_KEY,
        $or: [
          { [weekKeyPath]: { $ne: weekKey } },
          { [stageCloseIdPath]: { $exists: false } },
          { [stageCloseIdPath]: null },
          { [stageCloseIdPath]: "" },
        ],
      },
      {
        $set: {
          [stageCloseIdPath]: "pending",
          [weekKeyPath]: weekKey,
        },
      },
    );
    if (Number(result?.modifiedCount || 0) > 0) return { claimed: true };
    const state = await getBotState(STATE_KEY, null);
    if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      return { claimed: false, reason: "already_announced", state };
    }
    return { claimed: false, reason: "pending_other", state };
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] stage close claim failed:", err?.message || err);
    return { claimed: true, reason: "claim_error_fallback" };
  }
}

async function runMovieNightStageCloseRecoveryCheck(client?, opts: Record<string, any> = {}) {
  if (movieNightStageCloseRecoveryRunning) return { skipped: true, reason: "already_running" };
  movieNightStageCloseRecoveryRunning = true;
  try {
    const now = opts.now || new Date();
    if (!shouldAttemptMovieNightStageCloseRecovery(now)) {
      return { skipped: true, reason: "outside_window" };
    }
    if (resolveExtraMovieNightDateKey(now)) {
      return await runExtraMovieNightStageCloseCheck(client, opts);
    }
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip" };
    const weekKey = getRomeWeekKey(now);
    const state = await getBotState(STATE_KEY, null);
    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
    if (!guild) return { skipped: true, reason: "guild_unavailable" };
    const title = (await resolveFinalMovieTitle(client, state, now).catch(() => null))
      || state?.finalMovieTitle
      || state?.eventStartMovieTitle
      || getFixedMovieTitleForWeek(now)
      || "il film scelto";
    if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      const closeMessage = await fetchStageCloseMessageForWeek(guild, weekKey, state);
      if (closeMessage) {
        await ensureMovieNightReviewThreadTracking(client).catch((err?) => {
          global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking on recovery failed:", err?.message || err);
        });
        await closeMovieNightReviewThreadIfDue(client).catch((err?) => {
          global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close on recovery failed:", err?.message || err);
        });
        return { ok: true, skipped: true, reason: "close_already_done" };
      }
    }
    if (await isSerataFilmStageLive(guild)) {
      return { skipped: true, reason: "stage_still_live" };
    }
    return await handleMovieNightStageClose(
      { guild, channelId: MOVIE_NIGHT_EVENT_CHANNEL_ID, client: guild.client },
      { now, force: Boolean(opts.force) },
    );
  } finally {
    movieNightStageCloseRecoveryRunning = false;
  }
}

async function handleMovieNightStageClose(stageInstance?, opts: Record<string, any> = {}) {
  const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
  const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
  if (!guild || channelId !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return { skipped: true, reason: "not_movie_night_stage" };

  const client = stageInstance?.client || guild.client;
  const attendanceSnapshot = opts.attendanceSnapshot instanceof Map
    ? opts.attendanceSnapshot
    : snapshotSerataFilmAttendance(guild.id);

  // serataFilmFinishFromClose1: always attempt staff auto-vals on stage close / recovery
  // (even if announce was already posted — vals may have been skipped before).
  const stateEarly = await getBotState(STATE_KEY, null).catch(() => null);
  const staffAuto = await finishSerataFilmSessionsForChannel(guild, channelId, {
    attendanceSnapshot,
    eventId: String(stateEarly?.eventId || stageInstance?.id || `stage-${Date.now()}`),
    startedAt: Date.parse(String(stateEarly?.eventStartAnnouncedAt || stateEarly?.stagePermissionsOpenedAt || "")) || undefined,
  }).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff auto finish failed:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  });

  const weekKey = String(opts.weekKeyOverride || "").trim() || getRomeWeekKey(opts.now || new Date());
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(opts.now || new Date());
  if (fixedSchedule?.skip && !opts.movieTitleOverride) return { skipped: true, reason: "fixed_schedule_skip", weekKey, staffAuto };

  const result = await withMovieNightStageCloseLock(weekKey, async () => {
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force) {
        const existingForWeek = await fetchStageCloseMessageForWeek(guild, weekKey, state);
      if (existingForWeek) {
        const title = String(opts.movieTitleOverride || "").trim()
          || (await resolveFinalMovieTitle(client, state, opts.now || new Date()).catch(() => null))
          || state?.finalMovieTitle
          || state?.eventStartMovieTitle
          || "il film scelto";
        await ensureReviewThreadForEndMessage(existingForWeek, {
          client,
          guild,
          weekKey,
          title,
          state,
          permissionsClosed: Boolean(state?.stagePermissionsClosedAt),
        });
        return { skipped: true, reason: "already_announced", weekKey, leaderboardEnsured: true };
      }
    }

    const permissionsClosed = await closeMovieNightStagePermissions(guild);
    const title = String(opts.movieTitleOverride || "").trim()
      || (await resolveFinalMovieTitle(client, state, opts.now || new Date()).catch(() => null))
      || state?.finalMovieTitle
      || state?.eventStartMovieTitle
      || "il film scelto";
    const channel = await resolveTextChannelForMovieNight(guild);
    if (!channel?.isTextBased?.() || !channel?.send) {
      return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsClosed };
    }

    const existingMessage = !opts.force ? await findRecentMovieNightEndAnnouncementInChannel(channel, client, weekKey) : null;
    if (existingMessage) {
      const ensured = await ensureReviewThreadForEndMessage(existingMessage, {
        client,
        guild,
        weekKey,
        title,
        state,
        permissionsClosed,
      });
      const nextState = {
        ...(state && typeof state === "object" ? state : {}),
        weekKey,
        guildId: String(guild.id || ""),
        stageCloseMovieTitle: title,
        stageCloseMessageId: String(existingMessage.id || ""),
        reviewThreadId: String(ensured.thread?.id || state?.reviewThreadId || ""),
        reviewThreadCloseAt: ensured.reviewThreadCloseAt || state?.reviewThreadCloseAt || null,
        stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
        stageClosedAt: new Date().toISOString(),
      };
      return {
        ok: true,
        deduped: true,
        reason: "channel_recent_message",
        messageId: String(existingMessage.id || ""),
        threadId: String(ensured.thread?.id || ""),
        title,
        permissionsClosed,
        weekKey,
        nextState,
      };
    }

    if (!opts.force) {
      const claim = await claimMovieNightStageCloseSlot(weekKey);
      if (!claim.claimed) {
        if (claim.reason === "already_announced" || claim.reason === "pending_other") {
          const retryMessage = await findRecentMovieNightEndAnnouncementInChannel(channel, client, weekKey);
          if (retryMessage) {
            const ensured = await ensureReviewThreadForEndMessage(retryMessage, {
              client,
              guild,
              weekKey,
              title,
              state: claim.state || state,
              permissionsClosed,
            });
            const nextState = {
              ...(claim.state || state || {}),
              weekKey,
              stageCloseMovieTitle: title,
              stageCloseMessageId: String(retryMessage.id || ""),
              reviewThreadId: String(ensured.thread?.id || ""),
              stageClosedAt: new Date().toISOString(),
            };
            return {
              ok: true,
              deduped: true,
              reason: "claim_lost_channel_message",
              messageId: String(retryMessage.id || ""),
              threadId: String(ensured.thread?.id || ""),
              title,
              permissionsClosed,
              weekKey,
              nextState,
            };
          }
        }
        return { skipped: true, reason: claim.reason || "claim_failed", weekKey, permissionsClosed };
      }
    }

    const message = await channel.send({
      content: buildMovieNightEndAnnouncementMessage(title),
      embeds: [],
      allowedMentions: {
        roles: [SERATA_FILM_ROLE_ID].filter(Boolean),
      },
      __skipNoticeEmbed: true,
    });
    const ensured = await ensureReviewThreadForEndMessage(message, {
      client,
      guild,
      weekKey,
      title,
      state,
      permissionsClosed,
    });
    const reviewThreadCloseAt =
      ensured.reviewThreadCloseAt || Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS;
    const nextState = {
      ...(state && typeof state === "object" ? state : {}),
      weekKey,
      guildId: String(guild.id || ""),
      stageCloseMovieTitle: title,
      stageCloseMessageId: String(message.id || ""),
      reviewThreadId: String(ensured.thread?.id || ""),
      reviewThreadCloseAt,
      stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
      stageClosedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      messageId: String(message.id || ""),
      threadId: String(ensured.thread?.id || ""),
      title,
      permissionsClosed,
      weekKey,
      nextState,
    };
  });

  clearSerataFilmAttendanceSession(guild.id);
  return result;
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

async function runExtraMovieNightFinalAnnouncementCheck(client?, opts: Record<string, any> = {}) {
  const now = opts.now || new Date();
  const slot = String(opts.slot || "").trim().toLowerCase(); // eve | day
  const eventDateKey =
    slot === "eve"
      ? (() => {
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          return getExtraFixedMovieNight(tomorrow) ? getRomeDateKey(tomorrow) : "";
        })()
      : resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie_tonight" };
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || "").trim();
  if (!title) return { skipped: true, reason: "extra_title_missing", eventDateKey };
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  const alreadyKey = slot === "eve" ? "finalEveMessageId" : "finalDayMessageId";
  if (!opts.force && state[alreadyKey]) {
    return { skipped: true, reason: "already_announced", eventDateKey, slot };
  }
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", eventDateKey };
  }
  const description = await fetchItalianMovieDescription(title);
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  const event = guild ? await findExtraMovieNightEvent(guild, eventDateKey, now) : null;
  const announceSlot = slot === "eve" ? "friday" : "saturday";
  const message = await channel.send({
    content: buildFinalMovieNightAnnouncementMessage({
      title,
      description,
      eventUrl: buildDiscordEventUrl(guildId || IDs.guilds?.main, event?.id || state.eventId),
      saturdayKey: eventDateKey,
      announceSlot,
    }),
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    __skipNoticeEmbed: true,
  });
  await patchExtraMovieNightState(eventDateKey, {
    title,
    description,
    eventId: String(event?.id || state.eventId || ""),
    guildId: String(guild?.id || guildId || ""),
    [alreadyKey]: String(message.id || ""),
    finalAnnouncedAt: new Date().toISOString(),
  });
  try {
    const staffChannel = await fetchStaffCommunicationChannel(client);
    if (staffChannel?.isTextBased?.() && staffChannel?.send && !state.staffCommunicationMessageId) {
      const dateLabel = formatMovieNightStaffDateLabel(
        slot === "eve" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now,
        { advanceForSaturday: false },
      );
      // Per mercoledì: etichetta esplicita
      const parts = getRomeParts(slot === "eve" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now);
      const monthName = ITALIAN_MONTH_NAMES[Math.max(0, parts.month - 1)] || "";
      const wedLabel =
        slot === "eve"
          ? `Mercoledì ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`
          : `Oggi, ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
      const staffMsg = await staffChannel.send({
        content: buildMovieNightStaffCommunicationMessage({
          title,
          dateLabel: wedLabel || dateLabel,
        }),
        allowedMentions: { roles: [STAFF_COMMUNICATION_ROLE_ID] },
        __skipNoticeEmbed: true,
      });
      await patchExtraMovieNightState(eventDateKey, {
        staffCommunicationMessageId: String(staffMsg?.id || ""),
      });
    }
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT EXTRA] staff communication failed:", err?.message || err);
  }
  global.logger?.info?.("[MOVIE NIGHT EXTRA] final announce", { eventDateKey, slot, title, messageId: message.id });
  return { ok: true, eventDateKey, slot, title, messageId: String(message.id || "") };
}

async function runExtraMovieNightEventStartCheck(client?, opts: Record<string, any> = {}) {
  const now = opts.now || new Date();
  const eventDateKey = resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie" };
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || "").trim();
  if (!title) return { skipped: true, reason: "extra_title_missing" };
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  if (!opts.force && state.eventStartMessageId) {
    return { skipped: true, reason: "already_started", eventDateKey };
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  const event = await findExtraMovieNightEvent(guild, eventDateKey, now);
  if (!event) return { skipped: true, reason: "no_event" };
  const status = Number(event.status || 0);
  if (status === 3 || status === 4) return { skipped: true, reason: "event_ended" };
  const startMs = Number(event.scheduledStartTimestamp || getMovieNightEventStartDate(event)?.getTime() || 0);
  if (status === 1 && startMs && now.getTime() + 60_000 < startMs) {
    return { skipped: true, reason: "event_not_due" };
  }
  const permissionsOpened = await openMovieNightStagePermissions(guild);
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", permissionsOpened };
  }
  const message = await channel.send({
    content: buildMovieNightStartAnnouncementMessage(title),
    allowedMentions: { parse: ["everyone"], roles: [SERATA_FILM_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  await patchExtraMovieNightState(eventDateKey, {
    title,
    eventId: String(event.id || ""),
    guildId: String(guild.id || ""),
    eventStartMessageId: String(message.id || ""),
    eventStartAnnouncedAt: new Date().toISOString(),
    stagePermissionsOpenedAt: permissionsOpened ? new Date().toISOString() : state.stagePermissionsOpenedAt || "",
  });
  await startSerataFilmSession(event).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT EXTRA] staff session start failed:", err?.message || err);
  });
  return { ok: true, eventDateKey, title, messageId: String(message.id || ""), permissionsOpened };
}

async function runExtraMovieNightStageCloseCheck(client?, opts: Record<string, any> = {}) {
  const now = opts.now || new Date();
  const eventDateKey = resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie" };
  if (!shouldAttemptMovieNightStageCloseRecovery(now) && !opts.force) {
    return { skipped: true, reason: "outside_window" };
  }
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || getFixedMovieTitleForDate(now) || "il film scelto").trim();
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  if (!opts.force && state.stageCloseMessageId) {
    return { skipped: true, reason: "already_closed", eventDateKey };
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  if (!opts.force && (await isSerataFilmStageLive(guild))) {
    return { skipped: true, reason: "stage_still_live" };
  }
  // riusa la chiusura stage standard ma con weekKey = eventDateKey per tracking review
  const result = await handleMovieNightStageClose(
    { guild, channelId: MOVIE_NIGHT_EVENT_CHANNEL_ID, client: guild.client },
    { now, force: Boolean(opts.force), movieTitleOverride: title, weekKeyOverride: eventDateKey },
  );
  if (result?.ok || result?.nextState?.stageCloseMessageId) {
    await patchExtraMovieNightState(eventDateKey, {
      title,
      stageCloseMessageId: String(result?.messageId || result?.nextState?.stageCloseMessageId || ""),
      stageClosedAt: new Date().toISOString(),
      reviewThreadId: String(result?.threadId || result?.nextState?.reviewThreadId || ""),
    });
  }
  return result || { skipped: true, reason: "stage_close_noop", eventDateKey };
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

let lastStageCloseSweepReason = "";

function startMovieNightAnnouncementLoop(client?) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return null;
  if (!client || movieNightAnnouncementTasks) return movieNightAnnouncementTasks;
  ensureMovieNightReviewThreadTracking(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking on loop start failed:", err?.message || err);
  });
  closeMovieNightReviewThreadIfDue(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close on loop start failed:", err?.message || err);
  });
  ensureWatchedMovieNightTitlesReady(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] watched titles bootstrap failed:", err?.message || err);
  });
  const announceTask = cron.schedule(
    ANNOUNCE_CRON,
    runCronDetached("[MOVIE NIGHT ANNOUNCE]", () => runMovieNightAnnouncementCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const closeTask = cron.schedule(
    CLOSE_THREAD_CRON,
    runCronDetached("[MOVIE NIGHT THREAD CLOSE]", () => runMovieNightThreadCloseCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementFridayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_FRIDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE FRIDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "friday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementSaturdayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_SATURDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE SATURDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "saturday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalEveTask = cron.schedule(
    EXTRA_FINAL_EVE_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL EVE]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "eve" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalDayTask = cron.schedule(
    EXTRA_FINAL_DAY_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL DAY]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "day" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const eventStartSweepTask = cron.schedule(
    EVENT_START_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT EVENT START]", () => runMovieNightEventStartCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const stageCloseSweepTask = cron.schedule(
    STAGE_CLOSE_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT STAGE CLOSE]", async () => {
      /* serataCloseLog1: senza questo non si capiva perché la fine serata non partiva */
      const res = await runMovieNightStageCloseRecoveryCheck(client);
      const reason = String(res?.reason || (res?.ok ? "ok" : ""));
      if (reason !== "outside_window" && reason !== "close_already_done" && reason !== lastStageCloseSweepReason) {
        lastStageCloseSweepReason = reason;
        global.logger?.warn?.("[MOVIE NIGHT STAGE CLOSE] sweep:", JSON.stringify(res || null).slice(0, 300));
      }
      return res;
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  // keep EXTRA_EVENT_START/STAGE cron constants for documentation; sweeps already cover Wed via EVENT_START_SWEEP_CRON
  void EXTRA_EVENT_START_SWEEP_CRON;
  void EXTRA_STAGE_CLOSE_SWEEP_CRON;
  movieNightReviewCloseSweep = setInterval(() => {
    closeMovieNightReviewThreadIfDue(client).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close sweep failed:", err?.message || err);
    });
  }, REVIEW_THREAD_SWEEP_MS);
  movieNightReviewCloseSweep.unref?.();
  movieNightAnnouncementTasks = {
    announceTask,
    closeTask,
    finalAnnouncementFridayTask,
    finalAnnouncementSaturdayTask,
    extraFinalEveTask,
    extraFinalDayTask,
    eventStartSweepTask,
    stageCloseSweepTask,
  };
  return movieNightAnnouncementTasks;
}

export = { ensureMovieNightStaffCommunicationOnStartup, handleMovieNightEventStart, handleMovieNightStageClose, recoverMovieNightAnnouncementsOnStartup, startMovieNightAnnouncementLoop };
