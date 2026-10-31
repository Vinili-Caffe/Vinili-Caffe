/** Serata film: riparazione di annunci e messaggi staff venuti male. */
const { getRomeWeekKey, getRomeSaturdayKeyForWeek, getMovieNightFinalAnnouncementSlot, shouldAllowMovieNightStaffCommunication, resolveMovieNightStaffAnnounceSlot, getMovieNightStartupRecoverySlot, isMovieNightFixedScheduleSkipWeek, getFixedMovieTitleForWeek } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID, buildDiscordEventUrl, buildFinalMovieNightAnnouncementMessage, buildMovieNightStaffCommunicationPayload } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { isFallbackMovieDescription, fetchItalianMovieDescription } = require("./movieNightDescriptions") as typeof import("./movieNightDescriptions");
const { hydrateMovieNightStateForWeek, resolveFinalMovieTitle } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { STATE_KEY, STAFF_COMMUNICATION_CHANNEL_ID, isStageCloseMessageForWeekKey, fetchStaffCommunicationChannel, messageTextHaystack, isMovieNightFinalPublicAnnouncePresent, movieNightStaffCommunicationStatePatch, fetchFinalAnnouncementMessage, resolveMovieNightStaffCommunicationStatus } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

let movieNightFinalRepairRunning = false;

async function maybePublishMovieNightStaffCommunication(client, { state, saturdayKey, weekKey, now, announceSlot, title }) {
  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip", weekKey };
  }
  const resolvedTitle =
    String(title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    (await resolveFinalMovieTitle(client, state, now).catch(() => null));
  if (!resolvedTitle) {
    global.logger?.warn?.("[MOVIE NIGHT STAFF] titolo non disponibile", weekKey ? `week=${weekKey}` : "");
    return { ok: false, reason: "title_unavailable", weekKey };
  }

  const staffStatus = await resolveMovieNightStaffCommunicationStatus(client, state, saturdayKey, resolvedTitle, now, weekKey);
  if (staffStatus.done) {
    return {
      ok: true,
      skipped: true,
      messageId: staffStatus.messageId || String(state?.staffCommunicationMessageId || ""),
      weekKey,
    };
  }

  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "staff_channel_unavailable", weekKey, channelId: STAFF_COMMUNICATION_CHANNEL_ID };
  }

  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip", weekKey };
  }

  try {
    const message = await channel.send(
      buildMovieNightStaffCommunicationPayload({
        title: resolvedTitle,
        now,
        announceSlot,
      }),
    );
    return { ok: true, messageId: String(message.id || ""), weekKey };
  } catch (err) {
    const result = {
      ok: false,
      reason: "staff_send_failed",
      weekKey,
      detail: String(err?.message || err || ""),
    };
    global.logger?.warn?.(
      "[MOVIE NIGHT STAFF] invio fallito:",
      result.reason,
      weekKey ? `week=${weekKey}` : "",
      result.detail ? `(${result.detail})` : "",
    );
    return result;
  }
}

function inferFinalAnnounceSlotFromMessage(content?) {
  return /\*\*Domani\*\*/.test(String(content || "")) ? "friday" : "saturday";
}

async function repairFinalMovieNightAnnouncementDescription(client?) {
  if (movieNightFinalRepairRunning) return { skipped: true, reason: "already_running" };
  movieNightFinalRepairRunning = true;
  try {
    const state = await getBotState(STATE_KEY, null);
    const messageId = String(state?.finalAnnouncementMessageId || "").trim();
    const now = new Date();
    const weekKey = getRomeWeekKey(now);
    const title =
      (await resolveFinalMovieTitle(client, state, now).catch(() => null)) ||
      getFixedMovieTitleForWeek(now) ||
      String(state?.finalMovieTitle || "").trim();
    if (!messageId || !title) return { skipped: true, reason: "no_announcement" };

    const savedTitle = String(state?.finalMovieTitle || "").trim();
    const savedDesc = String(state?.finalMovieDescription || "").trim();
    /* annunci vecchi col blocco della Coppa delle Case (evento Hogwarts): vanno riscritti */
    const savedHogwartsBlock = state?.finalAnnouncementHogwartsBlock === true;
    const message = await fetchFinalAnnouncementMessage(client, messageId);
    if (!message?.edit) return { skipped: true, reason: "message_unavailable", title };
    if (!isStageCloseMessageForWeekKey(message, weekKey)) {
      return { skipped: true, reason: "message_wrong_week", title };
    }

    const announceSlot = inferFinalAnnounceSlotFromMessage(message.content);
    const saturdayKey = String(getRomeSaturdayKeyForWeek(now) || state?.finalAnnouncedSaturdayKey || "").trim();
    const needsDescriptionFetch =
      savedTitle !== title ||
      !savedDesc ||
      isFallbackMovieDescription(savedDesc) ||
      savedHogwartsBlock;
    const description = needsDescriptionFetch
      ? await fetchItalianMovieDescription(title)
      : savedDesc;
    const content = buildFinalMovieNightAnnouncementMessage({
      title,
      description,
      eventUrl: buildDiscordEventUrl(state?.guildId || IDs.guilds?.main, state?.eventId),
      saturdayKey,
      announceSlot,
    });
    const previousContent = String(message.content || "");
    if (content === previousContent && savedTitle === title) {
      return { skipped: true, reason: "already_correct", title };
    }

    await message.edit({
      content,
      allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    });
    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncedSaturdayKey: saturdayKey || state?.finalAnnouncedSaturdayKey || "",
      finalAnnouncementHogwartsBlock: false,
      finalMovieDescriptionRepairedAt: new Date().toISOString(),
    });
    return { ok: true, title, messageId, description };
  } finally {
    movieNightFinalRepairRunning = false;
  }
}

async function republishMovieNightStaffCommunicationAsPlainText(client?, opts: Record<string, any> = {}) {
  const now = opts.now || new Date();
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.isTextBased?.() || !channel?.messages?.fetch) {
    return { ok: false, reason: "staff_channel_unavailable" };
  }

  const state = await getBotState(STATE_KEY, null);
  const title =
    String(opts.title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    "Harry Potter e i Doni della Morte - Parte 1";
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const weekKey = getRomeWeekKey(now);
  const announceSlot =
    String(opts.announceSlot || getMovieNightFinalAnnouncementSlot(now) || getMovieNightStartupRecoverySlot(now) || "friday").toLowerCase() ===
    "saturday"
      ? "saturday"
      : "friday";

  const recent = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  const marker = /COMUNICAZIONE SERATA FILM/i;
  const deletedIds = [];
  if (recent?.size) {
    for (const message of recent.values()) {
      const haystack = messageTextHaystack(message);
      if (!marker.test(haystack)) continue;
      if (title && !haystack.includes(title) && !/harry potter/i.test(haystack)) continue;
      const hasEmbed = Array.isArray(message.embeds) && message.embeds.length > 0;
      const contentEmpty = !String(message.content || "").trim();
            const tracked = String(state?.staffCommunicationMessageId || "") === String(message.id || "");
      if (!hasEmbed && !tracked) continue;
      if (hasEmbed || (tracked && contentEmpty)) {
        await message.delete().catch(() => null);
        deletedIds.push(String(message.id));
      }
    }
  }

  if (state && typeof state === "object") {
    await setBotState(STATE_KEY, {
      ...state,
      staffCommunicationMessageId: "",
      staffCommunicationAt: "",
      staffAnnouncedSaturdayKey: "",
    });
  }

  const message = await channel.send(
    buildMovieNightStaffCommunicationPayload({
      title,
      now,
      announceSlot,
    }),
  );
  const messageId = String(message?.id || "");
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    finalMovieTitle: title,
    staffCommunicationMessageId: messageId,
    staffCommunicationAt: new Date().toISOString(),
    staffAnnouncedSaturdayKey: saturdayKey,
  });

  return {
    ok: true,
    messageId,
    deletedIds,
    title,
    weekKey,
    saturdayKey,
  };
}

async function repairMovieNightStaffCommunication(client?, opts: Record<string, any> = {}) {
  const state = await getBotState(STATE_KEY, null);
  const now = opts.now || new Date();
  if (isMovieNightFixedScheduleSkipWeek(now) && !opts.force) {
    return { skipped: true, reason: "fixed_schedule_skip" };
  }
  if (!opts.force && !shouldAllowMovieNightStaffCommunication(now)) {
    return { skipped: true, reason: "outside_staff_communication_window" };
  }
  const weekKey = getRomeWeekKey(now);
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const hydrated = await hydrateMovieNightStateForWeek(client, state, weekKey);
  const publicPresent = await isMovieNightFinalPublicAnnouncePresent(client, hydrated, weekKey, now);
  if (!publicPresent) return { skipped: true, reason: "no_public_announce" };
  const slotHint = getMovieNightStartupRecoverySlot(now) || "";
  const announceSlot = resolveMovieNightStaffAnnounceSlot(now, slotHint);
  if (!announceSlot) return { skipped: true, reason: "outside_staff_communication_window" };
  const title =
    (await resolveFinalMovieTitle(client, hydrated, now).catch(() => null)) ||
    hydrated?.finalMovieTitle ||
    getFixedMovieTitleForWeek(now);
  const staffResult: any = await maybePublishMovieNightStaffCommunication(client, {
    state: hydrated,
    saturdayKey,
    weekKey,
    now,
    announceSlot,
    title,
  });
  const staffPatch = movieNightStaffCommunicationStatePatch(staffResult, saturdayKey);
  if (Object.keys(staffPatch).length) {
    await setBotState(STATE_KEY, {
      ...(hydrated && typeof hydrated === "object" ? hydrated : {}),
      ...staffPatch,
    });
  }
  if (staffResult?.ok && staffResult.skipped) return { ok: true, skipped: true, title };
  if (staffResult?.ok) return { ok: true, sent: true, messageId: staffPatch.staffCommunicationMessageId, title };
  return { ok: false, reason: staffResult?.reason || "staff_send_failed" };
}

async function ensureMovieNightStaffCommunicationOnStartup(client?, opts: Record<string, any> = {}) {
  const { isRecoveryPrimaryShard } = require("../../Utils/Community/supportersChannelEmbedRecoveryUtils") as typeof import("../../Utils/Community/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const now = opts.now || new Date();
  if (isMovieNightFixedScheduleSkipWeek(now) && !opts.force) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip" };
  }
  return repairMovieNightStaffCommunication(client, opts);
}

export = { maybePublishMovieNightStaffCommunication, repairFinalMovieNightAnnouncementDescription, republishMovieNightStaffCommunicationAsPlainText, repairMovieNightStaffCommunication, ensureMovieNightStaffCommunicationOnStartup };
