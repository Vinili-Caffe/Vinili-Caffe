/** Serata film: votazione nel thread, spareggio e film vincitore. */
const { MOVIE_NIGHT_DISPLAY_TIME, getRomeParts, getRomeWeekKey, getHarryPotterMovieNightScheduleForWeek, getExtraFixedMovieNight, getFixedMovieTitleForWeek, getFixedMovieTitleForDate, getMovieNightEventStartDate } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_NAME, fetchMovieNightEventById, findCurrentWeekMovieNightEvent, resolveTitleFromMovieNightEvent } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const { EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID, buildTieBreakerAnnouncementMessage } = require("./movieNightMessages") as typeof import("./movieNightMessages");
const { resolveCanonicalMovieTitle } = require("./movieNightDescriptions") as typeof import("./movieNightDescriptions");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { extractMovieNightProposalTitle, movieNightTitleCompareKey } = require("../../Utils/Community/movieNightProposal") as typeof import("../../Utils/Community/movieNightProposal");

const MOVIE_NIGHT_VOTE_EMOJI_ID = "1482535223001485473";
const MOVIE_NIGHT_TIE_POLL_DURATION_HOURS = 4;
const DISCORD_POLL_MAX_ANSWERS = 10;
const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";

async function fetchAllThreadMessages(thread?, limit = 1000) {
  const messages = [];
  let before;
  while (messages.length < limit) {
    const batch = await thread.messages.fetch({ limit: Math.min(100, limit - messages.length), ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return messages;
}

function getMovieVoteReaction(message?) {
  return message.reactions?.cache?.find((reaction?) => {
    const emojiId = String(reaction?.emoji?.id || "");
    const emojiName = String(reaction?.emoji?.name || "");
    return emojiId === MOVIE_NIGHT_VOTE_EMOJI_ID || emojiName === "VC_Vote";
  }) || null;
}

async function countReactionVotes(reaction?, botUserId?) {
  if (!reaction) return 0;
  const voterIds = new Set();
  let after;
  while (true) {
    const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) }).catch(() => null);
    if (!users?.size) break;
    for (const user of users.values()) {
      if (!user?.bot && String(user.id || "") !== String(botUserId || "")) voterIds.add(String(user.id));
    }
    after = users.last()?.id;
    if (users.size < 100) break;
  }
  return voterIds.size;
}

async function collectMovieNightVoteResults(thread?, client?) {
  const messages = await fetchAllThreadMessages(thread);
  const proposals = messages
    .filter((message?) => !message.author?.bot && !message.webhookId && !message.system)
    .filter((message?) => extractMovieNightProposalTitle(message.content))
    .sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
  const results = [];
  for (const message of proposals) {
    const title = extractMovieNightProposalTitle(message.content);
    if (!title) continue;
    const key = movieNightTitleCompareKey(title);
    const votes = await countReactionVotes(getMovieVoteReaction(message), client?.user?.id);
    /* movieNightProposalTitleSmart1: stessi film con testo diverso → un solo risultato (voti sommati) */
    const existing = results.find((r?) => r._key === key);
    if (existing) {
      existing.votes += votes;
      continue;
    }
    results.push({ messageId: String(message.id || ""), title, votes, _key: key });
  }
  return results.map(({ _key, ...rest }) => rest);
}

async function maybePublishTieBreakerPoll(client?, thread?, state?) {
  if (state?.tieBreakerPollMessageId) return { skipped: true, reason: "tie_poll_already_sent" };
  const results = await collectMovieNightVoteResults(thread, client);
  if (!results.length) return { skipped: true, reason: "no_movie_proposals", voteResults: [] };

  const topVotes = Math.max(...results.map((result?) => result.votes));
  const tied = results.filter((result?) => result.votes === topVotes);
  if (tied.length < 2) {
    return { skipped: true, reason: "no_tie", topVotes, winner: tied[0]?.title || null, voteResults: results };
  }

  const options = tied.slice(0, DISCORD_POLL_MAX_ANSWERS);
  const channel = thread.guild?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(thread.guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable" };
  }

  const pollMessage = await channel.send({
    content: buildTieBreakerAnnouncementMessage(thread.id, options.map((option?) => option.title)),
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    __skipNoticeEmbed: true,
    poll: {
      question: { text: `Quale film guardiamo domani alle ${MOVIE_NIGHT_DISPLAY_TIME}?` },
      answers: options.map((option?) => ({ text: option.title })),
      duration: MOVIE_NIGHT_TIE_POLL_DURATION_HOURS,
      allowMultiselect: false,
    },
  });
  return {
    ok: true,
    tieBreakerPollMessageId: String(pollMessage.id || ""),
    tiedMovieTitles: options.map((option?) => option.title),
    voteResults: results,
    topVotes,
    truncated: tied.length > options.length,
  };
}

function resolveWinnerFromVoteResults(voteResults?) {
  const results = Array.isArray(voteResults) ? voteResults : [];
  if (!results.length) return null;
  return [...results]
    .filter((result?) => String(result?.title || "").trim())
    .sort((a?, b?) => Number(b.votes || 0) - Number(a.votes || 0))[0]?.title || null;
}

async function resolveTieBreakerPollWinner(client?, state?) {
  const pollMessageId = String(state?.tieBreakerPollMessageId || "");
  if (!pollMessageId) return null;
  const channel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  const message = await channel?.messages?.fetch?.(pollMessageId).catch(() => null);
  const answers = [...(message?.poll?.answers?.values?.() || [])]
    .filter((answer?) => String(answer?.text || "").trim())
    .sort((a?, b?) => Number(b.voteCount || 0) - Number(a.voteCount || 0) || Number(a.id || 0) - Number(b.id || 0));
  return answers[0]?.text || null;
}

async function resolveAnnouncementChannel(client?) {
  return (
    client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

function isMovieNightVoteThread(thread?, weekKey?) {
  if (!thread?.isThread?.()) return false;
  const threadName = String(thread.name || "").trim().toUpperCase();
  if (threadName !== MOVIE_NIGHT_NAME) return false;
  const createdAt = Number(thread.createdTimestamp || 0);
  if (!createdAt) return false;
  return getRomeWeekKey(new Date(createdAt)) === weekKey;
}

async function discoverMovieNightVoteThread(client?, weekKey?) {
  const key = String(weekKey || "").trim();
  if (!key) return null;
  const channel = await resolveAnnouncementChannel(client);
  if (!channel?.isTextBased?.()) return null;

  const candidates = [];
  if (channel.threads?.fetchActive) {
    const active = await channel.threads.fetchActive().catch(() => null);
    if (active?.threads?.size) candidates.push(...active.threads.values());
  }
  if (channel.threads?.fetchArchived) {
    let before;
    for (let page = 0; page < 4; page += 1) {
      const archived = await channel.threads
        .fetchArchived({ limit: 25, ...(before ? { before } : {}) })
        .catch(() => null);
      if (!archived?.threads?.size) break;
      candidates.push(...archived.threads.values());
      before = archived.threads.last()?.id;
      if (archived.threads.size < 25) break;
    }
  }

  const fromThreads = candidates.filter((thread?) => isMovieNightVoteThread(thread, key));
  if (fromThreads.length) {
    return [...fromThreads].sort((a?, b?) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0))[0];
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return null;
  const sorted = [...messages.values()].sort(
    (a?, b?) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0),
  );
  for (const message of sorted) {
    if (getRomeWeekKey(new Date(Number(message.createdTimestamp || 0))) !== key) continue;
    if (!message.hasThread) continue;
    const thread = message.thread || (await message.fetchThread?.().catch(() => null));
    if (isMovieNightVoteThread(thread, key)) return thread;
  }
  return null;
}

async function hydrateMovieNightStateForWeek(client?, state?, weekKey?) {
  const key = String(weekKey || "").trim();
  const base = state && typeof state === "object" ? { ...state } : {};
  if (!key) return base;
  if (base.threadId && base.weekKey === key) return base;
  const thread = await discoverMovieNightVoteThread(client, key);
  if (!thread?.id) return base;
  return {
    ...base,
    weekKey: key,
    threadId: String(thread.id),
    guildId: String(thread.guildId || base.guildId || IDs.guilds?.main || ""),
  };
}

async function resolveMovieNightThread(client?, threadId?) {
  const id = String(threadId || "");
  if (!id) return null;
  return client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
}

async function resolveMovieTitleFromVoteThread(client?, state?, weekKey = "") {
  const key = String(weekKey || state?.weekKey || "").trim();
  let thread = null;
  const threadId = String(state?.threadId || "");
  if (threadId) thread = await resolveMovieNightThread(client, threadId);
  if (!thread?.isThread?.() && key) {
    thread = await discoverMovieNightVoteThread(client, key);
  }
  if (!thread?.isThread?.()) return null;
  const voteResults = await collectMovieNightVoteResults(thread, client).catch(() => []);
  const fromVotes = resolveWinnerFromVoteResults(voteResults);
  if (fromVotes) return fromVotes;
  const topVotes = voteResults.length ? Math.max(...voteResults.map((r?) => Number(r.votes || 0))) : 0;
  if (topVotes > 0) {
    const leader = voteResults.find((r?) => Number(r.votes || 0) === topVotes);
    if (leader?.title) return leader.title;
  }
  return null;
}

async function resolveFinalMovieTitle(client?, state?, now = new Date()) {
  const weekKey = getRomeWeekKey(now);
  if (getHarryPotterMovieNightScheduleForWeek(now)?.skip && !getExtraFixedMovieNight(now)) return null;
  const fromSchedule = getFixedMovieTitleForDate(now);
  if (fromSchedule) return fromSchedule;
  const savedTitle = String(state?.finalMovieTitle || "").trim();
  if (savedTitle && String(state?.weekKey || "") === weekKey) return savedTitle;
  const hydrated = await hydrateMovieNightStateForWeek(client, state, weekKey);
  let raw =
    (await resolveTieBreakerPollWinner(client, hydrated)) ||
    resolveWinnerFromVoteResults(hydrated?.voteResults) ||
    (await resolveMovieTitleFromVoteThread(client, hydrated, weekKey).catch(() => null));
  if (!raw) {
    const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = guildId
      ? await getClientGuildCached(client, guildId).catch(() => null)
      : null;
    if (guild) {
      const event = await findCurrentWeekMovieNightEvent(guild, now);
      raw = resolveTitleFromMovieNightEvent(event);
      if (!raw) {
        const storedEventId = String(hydrated?.eventId || state?.eventId || event?.id || "").trim();
        if (storedEventId) {
          const storedEvent = await fetchMovieNightEventById(guild, storedEventId);
          raw = resolveTitleFromMovieNightEvent(storedEvent);
        }
      }
    }
  }
  if (!raw) return null;
  const cleaned = extractMovieNightProposalTitle(raw) || String(raw).trim();
  if (!cleaned) return null;
  return (await resolveCanonicalMovieTitle(cleaned)) || cleaned;
}

async function describeFinalMovieTitleMiss(client?, state?, now = new Date()) {
  const bits = [];
  if (getFixedMovieTitleForWeek(now)) bits.push("schedule_ok");
  else bits.push("no_schedule");
  const voteCount = Array.isArray(state?.voteResults) ? state.voteResults.length : 0;
  bits.push(`voteResults=${voteCount}`);
  bits.push(state?.tieBreakerPollMessageId ? "tie_poll=yes" : "tie_poll=no");
  bits.push(state?.threadId ? `thread=${state.threadId}` : "thread=none");
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  if (!guild) {
    bits.push("guild=missing");
    return bits.join(" ");
  }
  const event = await findCurrentWeekMovieNightEvent(guild, now);
  if (!event) {
    bits.push("event=not_found");
    return bits.join(" ");
  }
  const startDate = getMovieNightEventStartDate(event);
  const parts = startDate ? getRomeParts(startDate) : null;
  bits.push(`event=${event.id}`);
  bits.push(parts ? `eventStart=${parts.hour}:${String(parts.minute).padStart(2, "0")}` : "eventStart=?");
  const title = resolveTitleFromMovieNightEvent(event);
  bits.push(`eventName=${String(event.name || "").slice(0, 60)}`);
  bits.push(title ? `eventTitle=${title.slice(0, 40)}` : "eventTitle=unparsed");
  const discovered = await discoverMovieNightVoteThread(client, getRomeWeekKey(now)).catch(() => null);
  bits.push(discovered?.id ? `discoveredThread=${discovered.id}` : "discoveredThread=none");
  return bits.join(" ");
}

export = { ANNOUNCEMENT_CHANNEL_ID, maybePublishTieBreakerPoll, hydrateMovieNightStateForWeek, resolveMovieNightThread, resolveFinalMovieTitle, describeFinalMovieTitleMiss };
