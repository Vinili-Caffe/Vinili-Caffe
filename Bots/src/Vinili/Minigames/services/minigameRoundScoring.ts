/** Minigiochi: controllo risposte e assegnazione della vittoria. */
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildWinEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { normalizePlayerGuess } = require("./minigameSources") as typeof import("./minigameSources");
const { compactNoSpaces, normalizeUserAnswerText, buildStrictBankAliases, isExplicitBankAnswerCorrect, parseMathGuess, extractWordGuessCandidates, buildPlayerAnswerAliases, normalizeMemorySequence, memoryEmojiMessageMatches } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, channelWinClosing, clearNoParticipationDelay, clearActiveGame, beginMinigameWinClose, endMinigameWinClose } = require("./minigameState") as typeof import("./minigameState");
const { reactMinigameWin } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleExpReward, mergeHalloweenCandyDropIntoMessage, awardMinigameWinToUser } = require("./minigameRewards") as typeof import("./minigameRewards");
const { parseStateTarget, buildGameSnapshotFromPersistedState } = require("./minigameRoundEnd") as typeof import("./minigameRoundEnd");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function catchUpMemoryEmojiWinFromHistory(client?, cfg?, channel?, game?) {
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!client || !channel?.messages?.fetch || !game?.normalizedSequence || !chId) return false;
  if (!game.promptMessageId) return false;
  if (Date.now() < Number(game.acceptsAt || 0)) return false;
  if (activeGames.get(chId) !== game) return false;

  const batch = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!batch?.size) return false;

  const promptId = String(game.promptMessageId || "");
  const candidates = [...batch.values()]
    .filter((m?) => {
      if (!m || m.author?.bot || m.system || m.webhookId) return false;
      if (!promptId) return true;
            try {
        if (BigInt(String(m.id)) <= BigInt(promptId)) return false;
      } catch (_) {
        if (String(m.id) === promptId) return false;
      }
      return true;
    })
    .sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));

  for (const msg of candidates) {
    if (activeGames.get(chId) !== game) return false;
    if (!memoryEmojiMessageMatches(msg.content, game.normalizedSequence)) continue;
    await handleMinigameWin(msg, game, cfg);
    return true;
  }
  return false;
}

function messageContentMatchesMinigameWin(content?, game?) {
  if (!game?.type) return false;
  const raw = String(content || "").trim();
  if (!raw) return false;
  const contentForGuess = normalizeUserAnswerText(raw);
  if (!contentForGuess) return false;
  const type = String(game.type);

  if (type === "guessWord") {
    const target = String(game.target || "").toLowerCase();
    if (!target) return false;
    return extractWordGuessCandidates(contentForGuess).some((g?) => g === target);
  }
  if (type === "fastType") {
    const phrase = normalizeUserAnswerText(String(game.phrase || ""));
    return Boolean(phrase) && contentForGuess === phrase;
  }
  if (type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
    const answerNum = Number(game.answer);
    return Number.isFinite(guessNum) && Number.isFinite(answerNum) && Math.abs(guessNum - answerNum) < 1e-6;
  }
  if (type === "guessYear") {
    const year = Number(game.year);
    const guess = Number(String(contentForGuess).replace(/[^\d]/g, ""));
    return Number.isFinite(year) && year > 0 && guess === year;
  }
  if (type === "completeProverb") {
    const end = normalizeCountryName(String(game.end || ""));
    const guess = normalizeCountryName(contentForGuess);
    return Boolean(end) && (guess === end || compactNoSpaces(guess) === compactNoSpaces(end));
  }
  if (type === "completeVerse" || type === "synonymAntonym") {
    const answers = [
      game.answer,
      ...(Array.isArray(game.answers) ? game.answers : []),
    ]
      .map((a?) => String(a || "").trim())
      .filter(Boolean);
    return isExplicitBankAnswerCorrect(contentForGuess, answers, normalizeCountryName, 1);
  }
  if ((type === "italianGK" || type === "guessCapital" || type === "guessRegionCapital" || type === "guessReverseCapital" || type === "guessEmoji" || type === "quoteFilm" || type === "guessCity" || type === "guessFlag" || type === "guessPlayer") || type === "guessTeam" || type === "guessSinger" || type === "guessAlbum") {
    const answers = [
      ...(Array.isArray(game.answers) ? game.answers : []),
      game.displayAnswer,
      game.answer,
      game.displayName,
      game.name,
      game.team,
      game.city,
      game.target,
    ]
      .map((a?) => String(a || "").trim())
      .filter(Boolean);
    if (!answers.length) return false;
    return isExplicitBankAnswerCorrect(contentForGuess, answers, normalizeCountryName, 1);
  }
  if (Array.isArray(game.answers) && game.answers.length) {
    return isExplicitBankAnswerCorrect(contentForGuess, game.answers, normalizeCountryName, 1);
  }
  return false;
}

function buildCatchUpGameFromPersistedState(state?, cfg = null) {
  const type = String(state?.type || "").trim();
  if (!type) return null;
  if (type === "memoryEmoji") {
    const parsed = parseStateTarget(state.target);
    const sequence = parsed?.sequence || "";
    return ({
        type,
        sequence,
        normalizedSequence: parsed?.normalizedSequence || normalizeMemorySequence(sequence),
        promptMessageId: parsed?.promptMessageId || (state.gameMessageId && String(state.gameMessageId) !== String(parsed?.sequenceMessageId || "") ? state.gameMessageId : null),
        acceptsAt: Math.min(Number(parsed?.acceptsAt || Date.now()) || Date.now(), Date.now()),
        rewardExp: Number(state.rewardExp || 0),
        startedAt: new Date(state.startedAt || Date.now()).getTime(),
        endsAt: new Date(state.endsAt || Date.now()).getTime(),
        gameMessageId: state.gameMessageId || null,
      });
  }
  const snap = buildGameSnapshotFromPersistedState(state);
  if (!snap?.type) return null;
  snap.startedAt = new Date(state.startedAt || Date.now()).getTime();
  snap.endsAt = new Date(state.endsAt || Date.now()).getTime();
  snap.gameMessageId = state.gameMessageId || null;
  if (type === "guessWord") snap.target = String(state.target || "").toLowerCase();
  if (type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    snap.answers = Array.isArray(parsed?.names) ? parsed.names : [];
    snap.displayName = parsed?.displayName || snap.displayName;
  }
  if (type === "guessPlayer") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || snap.displayName;
    snap.answers =
      type === "guessPlayer"
        ? buildPlayerAnswerAliases(name, parsed?.aliases)
        : buildStrictBankAliases(
            [name, ...(Array.isArray(parsed?.aliases) ? parsed.aliases : [])],
            normalizePlayerGuess,
          );
    snap.displayName = name;
    snap.sourceAliases = Array.isArray(parsed?.aliases) ? parsed.aliases : [];
  }
  return snap;
}

async function catchUpTextMinigameWinFromHistory(client?, cfg?, channel?, game?) {
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!client || !channel?.messages?.fetch || !game || !chId) return false;
  if (activeGames.get(chId) !== game) return false;
  if (game.type === "memoryEmoji") {
    return catchUpMemoryEmojiWinFromHistory(client, cfg, channel, game);
  }

  const afterId = String(game.gameMessageId || "").trim();
  const endsAt = Number(game.endsAt) || Date.now();
  const startedAt = Number(game.startedAt) || 0;
  const batch = await channel.messages.fetch({ limit: 80 }).catch(() => null);
  if (!batch?.size) return false;

  const candidates = [...batch.values()]
    .filter((m?) => {
      if (!m || m.author?.bot || m.system || m.webhookId) return false;
      const ts = Number(m.createdTimestamp || 0);
      if (ts && endsAt && ts > endsAt + 1500) return false;
      if (startedAt && ts && ts < startedAt - 2000) return false;
      if (!afterId) return true;
      try {
        if (BigInt(String(m.id)) <= BigInt(afterId)) return false;
      } catch (_) {
        if (String(m.id) === afterId) return false;
      }
      return true;
    })
    .sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0) || String(a.id).localeCompare(String(b.id)));

  for (const msg of candidates) {
    if (activeGames.get(chId) !== game) return false;
    if (!messageContentMatchesMinigameWin(msg.content, game)) continue;
    await handleMinigameWin(msg, game, cfg);
    return true;
  }
  return false;
}

async function tryAwardMissedMinigameWinFromHistory(client?, cfg?, channel?, state?) {
  const type = String(state?.type || "").trim();
  if (((!type || type === "treasureHunt") || type === "findBot" || type === "halloweenFindGhost" || type === "findBotVoice") || type === "hangman" || type === "halloweenTrickOrTreat") {
    return false;
  }
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!chId || !channel?.messages?.fetch) return false;
  if (channelWinClosing.has(chId)) return false;

  const game = buildCatchUpGameFromPersistedState(state, cfg);
  if (!game) return false;
  activeGames.set(chId, game);
  try {
    const won = await catchUpTextMinigameWinFromHistory(client, cfg, channel, game);
    if (won) return true;
  } catch (err) {
    warnMinigame(err);
  }
  if (activeGames.get(chId) === game) activeGames.delete(chId);
  return false;
}

async function handleMinigameWin(message?, game?, cfg?) {
  clearNoParticipationDelay(message.channelId);
  const client = message.client;
  const clearCfg = { ...cfg, guildId: message.guild.id };
  const channelId = String(clearCfg.channelId || "");

  try {

    const closed = await beginMinigameWinClose(client, clearCfg, game);
    if (!closed) return;
    try {
      const award = await awardMinigameWinToUser({
        client,
        guild: message.guild,
        userId: message.author.id,
        cfg,
        game,
        rewardExp: game.rewardExp,
        channelId: message.channel?.id || message.channelId || null,
      });
      await reactMinigameWin(message);
      await message
        .reply(
          mergeHalloweenCandyDropIntoMessage(
            {
              embeds: [buildWinEmbed(message.author.id, award.effectiveExp, award.nextTotal, award.details)],
            },
            award,
            message.author.id,
          ),
        )
        .catch(() => { });
      if (award.member) {
        await handleExpReward(client, award.member, award.nextTotal);
      }
    } catch (err) {
      warnMinigame(err);
      await reactMinigameWin(message).catch(() => { });
      await message.reply({
        content: `${E.VC_Attention} Risposta registrata, ma non sono riuscito a completare i premi. Il round è comunque chiuso.`,
      }).catch((replyErr?) => warnMinigame(replyErr));
    } finally {
      if (channelId) {
        await clearActiveGame(client, clearCfg).catch(() => { });
        endMinigameWinClose(channelId);
      }
    }
  } finally {
  }
}

export = {
  catchUpMemoryEmojiWinFromHistory,
  catchUpTextMinigameWinFromHistory,
  tryAwardMissedMinigameWinFromHistory,
  handleMinigameWin,
};
