const {
  TIME_ZONE,
  MOVIE_NIGHT_DISPLAY_TIME,
  ITALIAN_MONTH_NAMES,
  EXTRA_FIXED_MOVIE_NIGHTS,
  getRomeParts,
  getRomeDateKey,
  getExtraFixedMovieNight,
  getFixedMovieTitleForDate,
  resolveExtraMovieNightDateKey,
  getExtraMovieNightState,
  patchExtraMovieNightState,
  getMovieNightEventStartDate,
  shouldAttemptMovieNightStageCloseRecovery,
  formatMovieNightStaffDateLabel,
} = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { findExtraMovieNightEvent, MOVIE_NIGHT_EVENT_CHANNEL_ID } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const {
  EVENTS_ROLE_ID,
  SERATA_FILM_ROLE_ID,
  STAFF_COMMUNICATION_ROLE_ID,
  buildDiscordEventUrl,
  buildMovieNightStaffCommunicationMessage,
  buildFinalMovieNightAnnouncementMessage,
  buildMovieNightStartAnnouncementMessage,
} = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { fetchItalianMovieDescription } = require("./movieNightDescriptions") as typeof import("./movieNightDescriptions");
const { ANNOUNCEMENT_CHANNEL_ID } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { fetchAnnouncementChannel, fetchStaffCommunicationChannel } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const { openMovieNightStagePermissions, isSerataFilmStageLive } = require("./movieNightStage") as typeof import("./movieNightStage");
const { getClientGuildCached, getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { startSerataFilmSession } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");

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
  const { handleMovieNightStageClose } = require("./movieNightStageCloseFlow") as typeof import("./movieNightStageCloseFlow");
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

export = {
  runExtraMovieNightFinalAnnouncementCheck,
  runExtraMovieNightEventStartCheck,
  runExtraMovieNightStageCloseCheck,
};
