const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../shared/utils/ephemeralMessageTtl");
const {
  normalizeMovieNightProposalForCompare,
  movieNightTitlesMatch,
  extractMovieNightProposalTitle,
} = require("../utils/movieNightProposal") as typeof import("../utils/movieNightProposal");
const {
  ensureWatchedMovieNightTitlesReady,
  isProposedMovieNightTitleAlreadyWatched,
} = require("../utils/movieNightWatchedTitles") as typeof import("../utils/movieNightWatchedTitles");
const { validateMovieNightProposalContent } = require("../utils/movieNightProposalRules") as typeof import("../utils/movieNightProposalRules");
const { getBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const MOVIE_NIGHT_STATE_KEY = "movieNightAnnouncement.v1";
const DEFAULT_VOTE_REACTION_FALLBACK = "👍";
const MOVIE_NIGHT_THREAD_PARENT_ID = String(IDs.channels?.eventAnnouncements || "1481660281032675510");
const MOVIE_NIGHT_THREAD_NAME = "SERATA FILM";
const MOVIE_NIGHT_THREAD_REACTION = "<a:VC_Vote:1482535223001485473>";
const MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX = 500;

function normalizePlainVoteText(raw?) {
  return String(raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMovieNightThreadName(raw?) {
  return String(raw || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isMovieNightVoteThread(message?) {
  if (!message?.channel?.isThread?.()) return false;
  const parentId = String(message.channel?.parentId || "");
  if (parentId !== MOVIE_NIGHT_THREAD_PARENT_ID) return false;
  const threadName = normalizeMovieNightThreadName(message.channel?.name || "");
  return threadName === MOVIE_NIGHT_THREAD_NAME || threadName.includes(MOVIE_NIGHT_THREAD_NAME);
}

function movieNightProposalTextsMatch(leftRaw?, rightRaw?) {
  /* threadDupEpisode1: confronta titoli estratti — "Kung Fu Panda 1" ≡ "Kung Fu Panda" */
  const leftExtracted = extractMovieNightProposalTitle(leftRaw) || String(leftRaw || "").trim();
  const rightExtracted = extractMovieNightProposalTitle(rightRaw) || String(rightRaw || "").trim();
  if (leftExtracted && rightExtracted && movieNightTitlesMatch(leftExtracted, rightExtracted)) return true;
  if (movieNightTitlesMatch(leftRaw, rightRaw)) return true;
  const leftTitle = normalizeMovieNightProposalForCompare(leftRaw);
  const rightTitle = normalizeMovieNightProposalForCompare(rightRaw);
  if (leftTitle && rightTitle && leftTitle === rightTitle) return true;
  if (leftTitle && rightTitle && movieNightTitlesMatch(leftTitle, rightTitle)) return true;
  const leftText = normalizePlainVoteText(leftRaw);
  const rightText = normalizePlainVoteText(rightRaw);
  return Boolean(leftText && rightText && leftText === rightText);
}

function messageHasMovieNightProposalContent(raw?) {
  return Boolean(normalizeMovieNightProposalForCompare(raw) || normalizePlainVoteText(raw));
}

async function fetchMovieNightThreadMessages(thread?, max = MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX) {
  if (!thread?.messages?.fetch) return [];
  const cap = Math.max(20, Math.min(500, Number(max) || MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX));
  const collected = [];
  let before;
  while (collected.length < cap) {
    const limit = Math.min(100, cap - collected.length);
    const batch = await thread.messages.fetch({ limit, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    const rows = [...batch.values()];
    collected.push(...rows);
    if (rows.length < limit) break;
    before = rows[rows.length - 1]?.id;
  }
  return collected;
}

async function findDuplicateMovieNightProposal(thread?, message?) {
  if (!thread || !message || !messageHasMovieNightProposalContent(message.content)) return null;
  const rows = await fetchMovieNightThreadMessages(thread);
  return (
    rows.find((msg?) => {
      if (!msg || String(msg.id) === String(message.id)) return false;
      if (msg.author?.bot || msg.webhookId || msg.system) return false;
      return movieNightProposalTextsMatch(message.content, msg.content);
    }) || null
  );
}

async function rejectMovieNightProposal(message?, reasonText?) {
  await message.delete().catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT VOTE] reject delete failed:", err?.message || err);
  });
  const warning = await message.channel
    .send({ content: `${message.author} ${reasonText}` })
    .catch(() => null);
  if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
  return true;
}

async function movieNightStrictProposalRulesEnabled(message?) {
  const state = await getBotState(MOVIE_NIGHT_STATE_KEY, null).catch(() => null);
  if (!state || state.strictProposalRules !== true) return false;
  const stateThreadId = String(state.threadId || "").trim();
  const channelId = String(message?.channel?.id || "").trim();
  if (stateThreadId && channelId && stateThreadId === channelId) return true;
  /* se lo state punta a un thread nuovo, non applicare strict su thread vecchi */
  return false;
}

async function handleMovieNightVoteMessage(message?) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;
  if (!isMovieNightVoteThread(message)) return false;

  if (!messageHasMovieNightProposalContent(message.content)) return false;

  await ensureWatchedMovieNightTitlesReady(message.client).catch(() => null);

  /* movieNightStrictProposal1: anno/durata solo se lo state del thread corrente ha strictProposalRules */
  if (await movieNightStrictProposalRulesEnabled(message)) {
    const validation: any = await validateMovieNightProposalContent(message.content, { enforceMeta: true }).catch(
      () => ({ ok: true }),
    );
    if (validation && validation.ok === false) {
      return rejectMovieNightProposal(message, validation.message || "proposta non valida.");
    }
  }

  const proposalTitle = extractMovieNightProposalTitle(message.content) || String(message.content || "").trim();
  if (proposalTitle && (await isProposedMovieNightTitleAlreadyWatched(proposalTitle))) {
    return rejectMovieNightProposal(message, "questo film è già stato visto in una serata precedente.");
  }

  const duplicate = await findDuplicateMovieNightProposal(message.channel, message);
  if (duplicate) {
    return rejectMovieNightProposal(message, "questo film è già stato suggerito nel thread.");
  }

  const reacted = await message.react(MOVIE_NIGHT_THREAD_REACTION).then(() => true).catch(() => false);
  if (!reacted && (MOVIE_NIGHT_THREAD_REACTION as any) !== DEFAULT_VOTE_REACTION_FALLBACK) {
    await message.react(DEFAULT_VOTE_REACTION_FALLBACK).catch(() => {});
  }
  return false;
}

export = { handleMovieNightVoteMessage };
