const BotState = require("../../../shared/schemas/botState/botStateSchema") as any;
const { getRomeWeekKey, shouldAttemptMovieNightStageCloseRecovery, getHarryPotterMovieNightScheduleForWeek, getFixedMovieTitleForWeek, resolveExtraMovieNightDateKey } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_EVENT_CHANNEL_ID } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const { SERATA_FILM_ROLE_ID, buildMovieNightEndAnnouncementMessage } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { resolveFinalMovieTitle } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { STATE_KEY, fetchStageCloseMessageForWeek, resolveTextChannelForMovieNight } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const {
  REVIEW_THREAD_CLOSE_AFTER_MS,
  ensureMovieNightReviewThreadTracking,
  closeMovieNightReviewThreadIfDue,
  findRecentMovieNightEndAnnouncementInChannel,
  ensureReviewThreadForEndMessage,
} = require("./movieNightReviewThread") as typeof import("./movieNightReviewThread");
const { closeMovieNightStagePermissions, isSerataFilmStageLive } = require("./movieNightStage") as typeof import("./movieNightStage");
const { COMPACT_BOTSTATE_KEY } = BotState;
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { snapshotSerataFilmAttendance, clearSerataFilmAttendanceSession } = require("./serataFilmAttendance") as typeof import("./serataFilmAttendance");
const { finishSerataFilmSessionsForChannel } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");

let movieNightStageCloseRecoveryRunning = false;
const movieNightStageCloseLocksByWeek = new Map();

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
      const { runExtraMovieNightStageCloseCheck } = require("./movieNightExtraChecks") as typeof import("./movieNightExtraChecks");
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

export = {
  handleMovieNightStageClose,
  runMovieNightStageCloseRecoveryCheck,
};
