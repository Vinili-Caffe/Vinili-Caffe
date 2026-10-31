/** Serata film: thread delle recensioni dopo il film (apertura e chiusura). */
const { getRomeWeekKey, getRomeSaturdayKeyForWeek } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { withReviewThreadMentionInEndContent } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { STATE_KEY, isStageCloseMessageForWeekKey, resolveTextChannelForMovieNight } = require("./movieNightStatus") as typeof import("./movieNightStatus");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { mergeWatchedTitleEntries } = require("../../Utils/Community/movieNightWatchedTitles") as typeof import("../../Utils/Community/movieNightWatchedTitles");

const REVIEW_THREAD_NAME = "RECENSIONI E SUGGERIMENTI";
const REVIEW_THREAD_CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEW_THREAD_DISCOVERY_MAX_AGE_MS = REVIEW_THREAD_CLOSE_AFTER_MS + 12 * 60 * 60 * 1000;
let movieNightReviewCloseTimer = null;
const MOVIE_NIGHT_END_ANNOUNCE_MARKER = "SERATA FILM ANDATA";
const MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS = 10 * 60 * 1000;

function pickOpenReviewThreadStateFields(state?) {
  if (!state || typeof state !== "object") return {};
  const threadId = String(state.reviewThreadId || "").trim();
  if (!threadId || state.reviewThreadClosedAt) return {};
  return {
    reviewThreadId: threadId,
    reviewThreadCloseAt: Number(state.reviewThreadCloseAt || 0) || null,
    stageCloseMessageId: String(state.stageCloseMessageId || ""),
    stageCloseMovieTitle: String(state.stageCloseMovieTitle || ""),
    stageClosedAt: String(state.stageClosedAt || ""),
    stagePermissionsClosedAt: String(state.stagePermissionsClosedAt || ""),
  };
}

function resolveReviewThreadCloseAtFromStageCloseMessage(message?, state = null) {
  const fromState = Number(state?.reviewThreadCloseAt || 0);
    if (fromState > Date.now()) return fromState;
  const created = Number(message?.createdTimestamp || 0);
  if (created > 0) return created + REVIEW_THREAD_CLOSE_AFTER_MS;
  return Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS;
}

async function discoverOpenMovieNightReviewThread(client?) {
  const channel = await resolveTextChannelForMovieNight(client);
  if (!channel?.messages?.fetch) return null;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages?.size) return null;
  for (const message of messages.values()) {
    if (!isMovieNightStageCloseMessage(message, client, REVIEW_THREAD_DISCOVERY_MAX_AGE_MS)) continue;
    const thread = await resolveReviewThreadFromMessage(message);
    if (!thread?.isThread?.()) continue;
    if (thread.locked && thread.archived) continue;
    return {
      threadId: String(thread.id),
      closeAt: resolveReviewThreadCloseAtFromStageCloseMessage(message),
      stageCloseMessageId: String(message.id || ""),
    };
  }
  return null;
}

async function syncMovieNightReviewThreadClosedState(client?, state?) {
  const threadId = String(state?.reviewThreadId || "").trim();
  if (!threadId || state?.reviewThreadClosedAt) return state;
  const thread = client.channels.cache.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
  if (!thread?.isThread?.() || !thread.locked || !thread.archived) return state;
  const next = {
    ...state,
    reviewThreadClosedAt: new Date().toISOString(),
  };
  const saved = await setBotState(STATE_KEY, next);
  return saved ? next : state;
}

async function ensureMovieNightReviewThreadTracking(client?) {
  let state = await getBotState(STATE_KEY, null);
  if (state?.reviewThreadId && !state?.reviewThreadClosedAt) {
    state = await syncMovieNightReviewThreadClosedState(client, state);
    if (state?.reviewThreadClosedAt) {
      return { ok: true, source: "state_sync", threadId: String(state.reviewThreadId || ""), alreadyClosed: true };
    }
    const closeAt = Number(state.reviewThreadCloseAt || 0);
        if (closeAt > Date.now()) scheduleMovieNightReviewThreadClose(client, closeAt);
    return { ok: true, source: "state", threadId: String(state.reviewThreadId || ""), closeAt };
  }

  const discovered = await discoverOpenMovieNightReviewThread(client);
  if (discovered?.threadId) {
    const nextState = {
      ...(state && typeof state === "object" ? state : {}),
      reviewThreadId: discovered.threadId,
      reviewThreadCloseAt: discovered.closeAt,
      reviewThreadClosedAt: "",
      stageCloseMessageId: discovered.stageCloseMessageId || state?.stageCloseMessageId || "",
    };
    await setBotState(STATE_KEY, nextState);
    if (Number(discovered.closeAt || 0) > Date.now()) {
      scheduleMovieNightReviewThreadClose(client, discovered.closeAt);
    }
    return { ok: true, source: "discovered", threadId: discovered.threadId, closeAt: discovered.closeAt };
  }

    const channel = await resolveTextChannelForMovieNight(client);
  const weekKey = String(state?.weekKey || getRomeWeekKey()).trim();
  const endMessage =
    (await findRecentMovieNightEndAnnouncementInChannel(
      channel,
      client,
      weekKey,
      REVIEW_THREAD_DISCOVERY_MAX_AGE_MS,
    ).catch(() => null)) ||
    (await findRecentMovieNightEndAnnouncementInChannel(
      channel,
      client,
      "",
      REVIEW_THREAD_DISCOVERY_MAX_AGE_MS,
    ).catch(() => null));
  if (!endMessage) {
    return {
      skipped: true,
      reason: state?.reviewThreadClosedAt ? "already_closed_in_state" : "no_open_review_thread",
    };
  }

  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild =
    (mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null) ||
    endMessage.guild ||
    null;
  const title =
    state?.stageCloseMovieTitle ||
    state?.finalMovieTitle ||
    state?.eventStartMovieTitle ||
    "il film scelto";
  const ensured = await ensureReviewThreadForEndMessage(endMessage, {
    client,
    guild,
    weekKey: weekKey || getRomeWeekKey(),
    title,
    state,
    permissionsClosed: Boolean(state?.stagePermissionsClosedAt),
  });
  if (!ensured.thread?.id) return { skipped: true, reason: "review_thread_create_failed" };
  return {
    ok: true,
    source: "created_missing",
    threadId: String(ensured.thread.id),
    closeAt: ensured.reviewThreadCloseAt,
  };
}

async function closeReviewThreadById(client?, threadId?) {
  const id = String(threadId || "");
  if (!id) return { ok: false, alreadyClosed: false };
  let thread = client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!thread?.isThread?.()) return { ok: false, alreadyClosed: false };
  if (thread.locked && thread.archived) {
    return { ok: true, alreadyClosed: true };
  }
  if (thread.archived && !thread.locked) {
    await thread.setArchived(false, "Riapertura tecnica per bloccare recensioni Serata Film").catch(() => null);
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  if (!thread.locked && thread.setLocked) {
    await thread.setLocked(true, "Chiusura recensioni Serata Film").catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread lock failed:", err?.message || err);
    });
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  if (!thread.archived && thread.setArchived) {
    await thread.setArchived(true, "Chiusura recensioni Serata Film").catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread archive failed:", err?.message || err);
    });
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  const done = Boolean(thread?.locked && thread.archived);
  return { ok: done, alreadyClosed: false };
}

const reviewThreadCloseLogOnce = new Set();

async function closeMovieNightReviewThreadIfDue(client?, opts: Record<string, any> = {}) {
  await ensureMovieNightReviewThreadTracking(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking failed:", err?.message || err);
  });
  let state = await getBotState(STATE_KEY, null);
  if (!state?.reviewThreadId || state?.reviewThreadClosedAt) {
    return { skipped: true, reason: "no_open_review_thread" };
  }
  const closeAt = Number(state.reviewThreadCloseAt || 0);
  if (!opts.force && (!closeAt || Date.now() < closeAt)) return { skipped: true, reason: "not_due" };
  const threadId = String(state.reviewThreadId || "");
  const closeResult = await closeReviewThreadById(client, threadId);
  if (!closeResult?.ok) return { skipped: true, reason: "thread_close_failed" };
  const saved = await setBotState(STATE_KEY, {
    ...state,
    reviewThreadClosedAt: new Date().toISOString(),
  });
  if (!saved) {
    if (!reviewThreadCloseLogOnce.has(`persist:${threadId}`)) {
      reviewThreadCloseLogOnce.add(`persist:${threadId}`);
      global.logger?.warn?.(
        "[MOVIE NIGHT ANNOUNCE] review thread closed on Discord but state persist failed:",
        threadId,
      );
    }
    return { ok: false, reason: "persist_failed", threadId };
  }
  return { ok: true, threadId, alreadyClosed: Boolean(closeResult.alreadyClosed) };
}

function scheduleMovieNightReviewThreadClose(client?, closeAt?) {
  if (movieNightReviewCloseTimer) clearTimeout(movieNightReviewCloseTimer);
  const dueAt = Number(closeAt || 0);
  if (!dueAt || dueAt <= Date.now()) {
        movieNightReviewCloseTimer = null;
    closeMovieNightReviewThreadIfDue(client, { force: true }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close timer failed:", err?.message || err);
    });
    return;
  }
  const delay = Math.max(1000, dueAt - Date.now());
  movieNightReviewCloseTimer = setTimeout(() => {
    movieNightReviewCloseTimer = null;
    closeMovieNightReviewThreadIfDue(client, { force: true }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close timer failed:", err?.message || err);
    });
  }, delay);
  movieNightReviewCloseTimer.unref?.();
}

function isMovieNightStageCloseMessage(message?, client?, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!message) return false;
  const botId = String(client?.user?.id || "");
  if (botId && String(message.author?.id || "") !== botId) return false;
  if (!String(message.content || "").includes(MOVIE_NIGHT_END_ANNOUNCE_MARKER)) return false;
  const age = Date.now() - Number(message.createdTimestamp || 0);
  return age >= 0 && age <= maxAgeMs;
}

async function findRecentMovieNightEndAnnouncementInChannel(channel?, client?, weekKey?, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!channel?.messages?.fetch) return null;
  const wk = String(weekKey || "").trim();
  const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!messages?.size) return null;
  for (const message of messages.values()) {
    if (!isMovieNightStageCloseMessage(message, client, maxAgeMs)) continue;
    if (wk && !isStageCloseMessageForWeekKey(message, wk)) continue;
    return message;
  }
  return null;
}

async function resolveReviewThreadFromMessage(message?) {
  if (!message) return null;
  if (message.thread?.isThread?.()) return message.thread;
  const fetched = await message.fetch?.().catch(() => null);
  if (fetched?.thread?.isThread?.()) return fetched.thread;
    const threadId = String(message.id || "").trim();
  const client = message.client;
  if (!threadId || !client?.channels?.fetch) return null;
  const byId =
    client.channels.cache.get(threadId) ||
    (await client.channels.fetch(threadId).catch(() => null));
  return byId?.isThread?.() ? byId : null;
}

async function createMovieNightReviewThread(message?) {
  if (!message?.startThread) return null;
  const existing = await resolveReviewThreadFromMessage(message);
  if (existing?.id) return existing;

  const attempts = [
    { autoArchiveDuration: 1440 },
    { autoArchiveDuration: 10080 },
    { autoArchiveDuration: 60 },
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    const opts = attempts[i];
    const thread = await message
      .startThread({
        name: REVIEW_THREAD_NAME,
        reason: "Thread automatico recensioni e suggerimenti Serata Film",
        ...opts,
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[MOVIE NIGHT ANNOUNCE] review thread create failed:",
          `archive=${opts.autoArchiveDuration}`,
          err?.code || "",
          err?.message || err,
        );
        return null;
      });
    if (thread?.id) return thread;
    if (i < attempts.length - 1) {
      await new Promise((resolve?) => setTimeout(resolve, 800));
    }
  }
  return null;
}

async function ensureReviewThreadForEndMessage(message?, {
  client,
  guild,
  weekKey,
  title,
  state,
  permissionsClosed = false,
}: any = {}) {
  if (!message?.id) return { thread: null, created: false };
  let thread = await resolveReviewThreadFromMessage(message);
  let created = false;
  if (!thread?.id) {
    thread = await createMovieNightReviewThread(message);
    created = Boolean(thread?.id);
  }
  if (!thread?.id) return { thread: null, created: false };

  const nextContent = withReviewThreadMentionInEndContent(message.content, thread.id);
  if (nextContent && nextContent !== String(message.content || "") && message.editable) {
    await message.edit({ content: nextContent }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread mention edit failed:", err?.message || err);
    });
  }

  const reviewThreadCloseAt = created
    ? resolveReviewThreadCloseAtFromStageCloseMessage(message, null)
    : resolveReviewThreadCloseAtFromStageCloseMessage(message, state);
  if (guild && weekKey) {
    await persistMovieNightStageCloseState({
      state,
      guild,
      weekKey,
      title: title || state?.stageCloseMovieTitle || "il film scelto",
      messageId: message.id,
      threadId: thread.id,
      reviewThreadCloseAt,
      permissionsClosed: permissionsClosed || Boolean(state?.stagePermissionsClosedAt),
    });
  }
  if (client) scheduleMovieNightReviewThreadClose(client, reviewThreadCloseAt);
  return { thread, created, reviewThreadCloseAt };
}

async function persistMovieNightStageCloseState({
  state,
  guild,
  weekKey,
  title,
  messageId,
  threadId,
  reviewThreadCloseAt,
  permissionsClosed,
}) {
  const saturdayKey = getRomeSaturdayKeyForWeek(new Date());
  const watchedMovieTitles = mergeWatchedTitleEntries(state?.watchedMovieTitles, {
    title,
    source: "stage_close",
    weekKey,
    saturdayKey,
    at: new Date().toISOString(),
  });
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    stageCloseMovieTitle: title,
    stageCloseMessageId: String(messageId || ""),
    reviewThreadId: String(threadId || ""),
    reviewThreadCloseAt,
    reviewThreadClosedAt: threadId ? "" : state?.reviewThreadClosedAt || "",
    stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
    stageClosedAt: new Date().toISOString(),
    watchedMovieTitles,
  });
}

export = { REVIEW_THREAD_CLOSE_AFTER_MS, pickOpenReviewThreadStateFields, ensureMovieNightReviewThreadTracking, closeMovieNightReviewThreadIfDue, findRecentMovieNightEndAnnouncementInChannel, ensureReviewThreadForEndMessage };
