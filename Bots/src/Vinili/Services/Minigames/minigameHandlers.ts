/** Minigiochi: gestione di messaggi, bottoni, reazioni e voce (risposte giuste, quasi giuste e sbagliate). */
const axios = require("axios") as typeof import("axios").default;
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { minigameStateFindOneLean } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService") as typeof import("../Community/expService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, buildPromptImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildHangmanEmbed, DRIVING_QUIZ_LETTERS, buildHintEmbed, buildYearHintEmbed, buildWinEmbed, buildHangmanLossEmbed, buildTreasureHuntFoundEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { normalizePlayerGuess, buildCompactAlias } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, normalizeUserAnswerText, normalizeTruthValue, parseMathGuess, normalizeCharForGuess, maskHangmanWord, isStrictAliasGuessCorrect, extractWordGuessCandidates, normalizeMemorySequence, memoryEmojiMessageMatches } = require("./minigameText") as typeof import("./minigameText");
const { getActivityWindowMs, getActivityScopeKey, recordActivity, canCountMessageForActivity } = require("./minigameActivity") as typeof import("./minigameActivity");
const { activeGames, channelWinClosing, blockMinigameRehydrate, isMinigameRehydrateBlocked, recordNoParticipationIfNeeded, clearNoParticipationDelay, clearActiveGame, clearMinigameRoundTimers, beginMinigameWinClose, endMinigameWinClose } = require("./minigameState") as typeof import("./minigameState");
const { MINIGAME_CORRECT_FALLBACK_EMOJI, MINIGAME_WRONG_EMOJI, sendMinigameMessage, reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleExpReward, computeMinigameAwardForUser, mergeHalloweenCandyDropIntoMessage, awardMinigameWinToUser } = require("./minigameRewards") as typeof import("./minigameRewards");
const { treasureEmojiMatches, botPlacedTreasureReaction, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { saveActiveGame, purgeExpiredMinigameDbState, parseStateTarget, shouldRevealHangmanSolutionOnBoard, updateHangmanBoardMessage, buildMinigameTimeoutEmbedForGame, sendMinigameTimeoutAndClose, handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");
const { ensureTreasureHuntGame, handleTreasureHuntIncomingMessage, cleanupTreasureHuntReactions } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const { resolveFindBotVoiceBotChannelId, syncFindBotVoiceTargetChannel, getActiveFindBotVoiceGame, handleFindBotVoiceWin } = require("./minigameFindBot") as typeof import("./minigameFindBot");

const MINIGAME_COOLDOWN_EMOJI = "<a:VC_Loading:1482526818278969578>";
const DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS = 5000;

function isStaleOrInvalidActiveGame(game?, nowMs = Date.now()) {
  if (!game || typeof game !== "object") return true;
  const endsAt = Number(game.endsAt || 0);
  if (!Number.isFinite(endsAt) || endsAt <= 0) return true;
  return nowMs >= endsAt;
}

async function closeStaleActiveMinigameChannel(client?, cfg?, channelId?, game?, channel = null) {
  if (!game || !isStaleOrInvalidActiveGame(game)) return false;
  const chId = String(channelId || cfg?.channelId || "").trim();
  if (!chId) return false;
  clearMinigameRoundTimers(game);
  recordNoParticipationIfNeeded(chId, game);
  const targetChannel = channel || (await getChannelCached(client, chId));
  const closeCfg = { ...cfg, channelId: chId };
  if (!closeCfg.guildId && targetChannel?.guild?.id) {
    closeCfg.guildId = String(targetChannel.guild.id);
  }
  await sendMinigameTimeoutAndClose(
    client,
    closeCfg,
    chId,
    targetChannel,
    game,
    buildMinigameTimeoutEmbedForGame(game),
    { allowPersistedClose: true },
  ).catch((err?) => warnMinigame(err));
  return true;
}

function countNonEmptyUserGuessLines(raw?) {
  return String(raw || "")
    .split(/\r?\n+/)
    .map((l?) => l.trim())
    .filter(Boolean).length;
}

function isMultiLineListingShotgunGuess(raw?) {
  return countNonEmptyUserGuessLines(raw) > 1;
}

function looksLikeInlineAnswerDump(raw?) {
  const single = String(raw || "").trim().replace(/\r?\n+/g, " ").trim();
  if (!single) return false;
  const pipeParts = single.split(/\s*\|\s*/).map((p?) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) return true;
  const slashParts = single.split(/\s+\/\s+/).map((p?) => p.trim()).filter(Boolean);
  if (slashParts.length >= 3) return true;
  return false;
}

function isSongAlbumListingShotgunGuess(raw?) {
  return isMultiLineListingShotgunGuess(raw) || looksLikeInlineAnswerDump(raw);
}

async function rejectMinigameShotgunListingGuess(message?, rawContent?, mode?) {
  const hit =
    mode === "songAlbum"
      ? isSongAlbumListingShotgunGuess(rawContent)
      : isMultiLineListingShotgunGuess(rawContent);
  if (!hit) return false;
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
  return true;
}

const CASUAL_MINIGAME_PHRASES = new Set([
  "non e giusto", "non e vero", "non ho amici", "s e buggato", "s e buggata",
  "che schifo", "ma perche", "assurdo", "imbrogliato", "buggato", "buggata", "che casino",
]);

function shouldReactToMinigameWrongAttempt(contentForGuess?, game?) {
  const raw = String(contentForGuess || "").trim();
  if (!raw) return false;
  const norm = normalizeCountryName(raw);
  if (!norm) return false;
  if (CASUAL_MINIGAME_PHRASES.has(norm)) return false;
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (game?.type === "fastType") return norm.length >= 4;
  if (game?.type === "memoryEmoji") {
    return Boolean(normalizeMemorySequence(raw));
  }
  if (tokens.length === 1 && tokens[0].length < 3) return false;
  return true;
}

async function reactMinigameNearOrWrong(message?, contentForGuess?, game?, answerPool?, nearOptions: Record<string, any> = {}) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  if (isNearTextGuess(contentForGuess, answerPool, nearOptions)) {
    await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
  } else {
    await reactMinigameWrongEmoji(message, game);
  }
}

async function reactMinigameWrongIfAttempt(message?, contentForGuess?, game?) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  await reactMinigameWrongEmoji(message, game);
}

function normalizeSongGuess(raw?) {
  return normalizeCountryName(raw);
}

function buildSongAnswerAliases(rawTitle?) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return [];

  const aliases = new Set();
  const add = (value?) => { const normalized = normalizeSongGuess(value); if (normalized) aliases.add(normalized); const compact = buildCompactAlias(value); if (compact) aliases.add(compact); };

  add(raw);

  const withoutBrackets = raw.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ").replace(/\s+/g, " ").trim();
  add(withoutBrackets);

  const withoutFeat = raw.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, "").trim();
  add(withoutFeat);
  add(
    withoutFeat
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const dashParts = raw.split(/\s(?:-|–|—)\s/).map((p?) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    const left = dashParts[0];
    const right = dashParts.slice(1).join(" ");
    if (
      /(remaster|version|edit|mix|live|acoustic|karaoke|instrumental|bonus|mono|stereo|radio|explicit|clean|sped|slowed|rework|demo|deluxe|anniversary|session|soundtrack|from)\b/i.test(
        right,
      )
    ) {
      add(left);
    }
  }

  for (const part of raw
    .split(/[\/|]/g)
    .map((p?) => p.trim())
    .filter(Boolean)) {
    add(part);
  }

  return Array.from(aliases.values());
}

function isSongGuessCorrect(rawGuess?, rawAnswers?) {
  return isLooseAliasGuessCorrect(rawGuess, rawAnswers, normalizeSongGuess, {
    minGuessLength: 4,
    minTokenLength: 3,
    singleTokenMinLength: 6,
  });
}

function isSingerGuessCorrect(rawGuess?, rawAnswers?) {
  // Solo match completo (niente solo cognome).
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizeCountryName);
}

function levenshteinDistance(aRaw?, bRaw?) {
  const a = String(aRaw || "");
  const b = String(bRaw || "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function isNearTextGuess(rawGuess?, rawAnswers?, options: Record<string, any> = {}) {
  const guess = normalizeCountryName(rawGuess);
  if (!guess || guess.length < Number(options?.minGuessLength || 3))
    return false;
  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((x?) => normalizeCountryName(x)).filter(Boolean) : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const compactGuess = compactNoSpaces(guess);
  for (const answer of answers) {
    if (!answer) continue;
    if (guess === answer || (compactGuess && compactGuess === compactNoSpaces(answer))) return true;
  }

  const maxAbs = Number(options?.maxDistance || 2);
  const maxRatio = Number(options?.maxRatio || 0.28);
  for (const answer of answers) {
    if (!answer || guess === answer) continue;
    const dist = levenshteinDistance(guess, answer);
    const base = Math.max(guess.length, answer.length);
    if (dist <= maxAbs && dist / Math.max(1, base) <= maxRatio) return true;
  }
  return false;
}

/** Win solo se la risposta è intera (alias normalizzato / senza spazi). Niente substring né token. */
function isLooseAliasGuessCorrect(
  rawGuess?,
  rawAnswers?,
  normalizer = normalizeCountryName,
  _options: Record<string, any> = {},
) {
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizer);
}

async function fetchAudioAttachment(url?) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

function isHangmanFullWordMatch(guessText?, wordNorm?) {
  if (!guessText || !wordNorm) return false;
  return guessText === wordNorm || compactNoSpaces(guessText) === compactNoSpaces(wordNorm);
}

async function finalizeHangmanLoss(message?, client?, cfg?, game?) {
  if (!game || game._lossFinalized) return;
  game._lossFinalized = true;
  game._claiming = true;

  const channelId = String(cfg?.channelId || message?.channel?.id || "").trim();
  const channel = message?.channel || (await getChannelCached(client, channelId));
  const hmMax = Number(game.maxMisses || 10);
  const word = String(game.word || "");
  const fullWordShown = word.split("").join(" ");

  if (channel?.messages?.fetch && game.gameMessageId) {
    const gameMsg = await channel.messages.fetch(game.gameMessageId).catch(() => null);
    if (gameMsg?.edit) {
      const attachment = buildPromptImageAttachment(
        "Impiccato",
        [fullWordShown, `Errori: ${hmMax}/${hmMax}`],
        "hangman",
        `loss_${Date.now()}`,
        client
      );
      const embed = buildHangmanEmbed(fullWordShown, game.rewardExp, 0);
      embed.setColor("#ED4245");
      if (attachment) embed.setImage(`attachment://${attachment.name}`);
      await gameMsg
        .edit({
          embeds: [embed],
          files: attachment ? [attachment] : [],
        })
        .catch(() => {});
    }
  }

  blockMinigameRehydrate(channelId);
  await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildHangmanLossEmbed(word));
}

async function handleMinigameReaction(client?, reaction?, user?) {
  try {
    if (!reaction || !user || user.bot) return false;
    let liveReaction = reaction;
    if (liveReaction.partial) {
      liveReaction = await liveReaction.fetch().catch(() => null);
      if (!liveReaction) return false;
    }
    let message = liveReaction.message;
    if (message?.partial) {
      message = await message.fetch().catch(() => null);
      if (!message) return false;
    }
    if (!message?.guild) return false;
    const cfg = getConfig(client || message.client);
    if (!cfg?.enabled || !cfg.channelId) return false;
    let game = activeGames.get(cfg.channelId);
    if (!game || game.type !== "treasureHunt") {
      game = await ensureTreasureHuntGame(client || message.client, cfg);
    }
    if (!game || game.type !== "treasureHunt") return false;
    if (String(message.channelId || message.channel?.id || "") !== String(cfg.channelId)) return false;
    if (!game.winnerMessageId) return false;
    if (String(message.id) !== String(game.winnerMessageId)) return false;
    if (!treasureEmojiMatches(liveReaction.emoji, game.winner)) return false;
    const botClient = client || message.client;
    const botPlaced =
      Boolean(game.botWinnerReactionReady) ||
      (await botPlacedTreasureReaction(message, game.winner, botClient));
    if (!botPlaced) {
      await liveReaction.users.remove(user.id).catch(() => {});
      return false;
    }
    if (game._claiming) return true;
    game.hadParticipation = true;
    game._claiming = true;
    blockMinigameRehydrate(cfg.channelId);
    if (game.timeout) clearTimeout(game.timeout);
    activeGames.delete(cfg.channelId);
    clearNoParticipationDelay(cfg.channelId);
    const guildId = message.guild.id;
    const channel = message.channel
      || (await getChannelCached(client || message.client, cfg.channelId));
    let award;
    try {
      award = await computeMinigameAwardForUser({
        guildId,
        userId: user.id,
        cfg,
        baseExp: game.rewardExp,
        startedAt: game.startedAt,
        client: botClient,
        gameType: "treasureHunt",
      });
    } catch (err) {
      warnMinigame(err);
      activeGames.delete(cfg.channelId);
      return true;
    }
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    const ignoreExp = await shouldIgnoreExpForMember({
      guildId,
      member,
      channelId: cfg.channelId,
    });
    if (!ignoreExp) {
      try {
        await addExpWithLevel(message.guild, user.id, award.effectiveExp, false, true);
      } catch (err) {
        warnMinigame(err);
      }
    }
    const winEmbed = buildWinEmbed(user.id, award.effectiveExp, award.nextTotal, award.details);
    const foundEmbed = buildTreasureHuntFoundEmbed(getTreasureHuntMessageUrl(guildId, cfg.channelId, game.winnerMessageId));
    if (channel?.send) {
      await sendMinigameMessage(channel, { embeds: [foundEmbed, winEmbed] }).catch(() => {});
    }
    if (member) {
      await handleExpReward(client || message.client, member, award.nextTotal);
    }
    if (channel && Array.isArray(game.candidateIds) && game.candidateIds.length) {
      await cleanupTreasureHuntReactions(channel, game);
    }
    await clearActiveGame(client || message.client, { ...cfg, guildId });
    return true;
  } catch (err) {
    warnMinigame(err);
    return false;
  }
}

async function handleMinigameButtonWin(interaction?, game?, cfg?) {
  clearNoParticipationDelay(cfg.channelId);
  const client = interaction.client;
  const winCfg = { ...cfg, guildId: interaction.guild.id };
  const channelId = String(winCfg.channelId || "");

  const closed = await beginMinigameWinClose(client, winCfg, game);
  if (!closed) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Partita già conclusa.",
      flags: 1 << 6,
    }).catch(() => { });
    return;
  }
  try {
    const award = await awardMinigameWinToUser({
      client,
      guild: interaction.guild,
      userId: interaction.user.id,
      cfg,
      game,
      rewardExp: game.rewardExp,
      channelId: cfg.channelId || null,
    });
    const winEmbed = buildWinEmbed(interaction.user.id, award.effectiveExp, award.nextTotal, award.details);
    const mainChannel = await getChannelCached(client, cfg.channelId);
    if (mainChannel) {
      await sendMinigameMessage(
        mainChannel,
        mergeHalloweenCandyDropIntoMessage({ embeds: [winEmbed] }, award, interaction.user.id),
      ).catch(() => { });
    }
    await interaction.reply({
      content: "<a:VC_Events:1482706144953897223> Hai vinto!",
      flags: 1 << 6,
    }).catch(() => { });
    if (award.member) {
      await handleExpReward(client, award.member, award.nextTotal);
    }
    try {
      const channel = interaction.channel;
      const msg = await channel.messages.fetch(game.messageId).catch(() => null);
      if (msg) await msg.delete().catch(() => { });
    } catch (err) {
      warnMinigame(err);
    }
  } finally {
    await clearActiveGame(client, winCfg).catch(() => { });
    endMinigameWinClose(channelId);
  }
}

async function handleMinigameMessage(message?, client?) {
  const baseCfg = getConfig(client);
  if (!baseCfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  const chId = String(message.channelId || "");
  if (channelWinClosing.has(chId)) return true;
  let cfg = baseCfg;
  cfg.guildId = String(message.guild.id || "");
  const chatId = String(cfg.channelId || "");
  const mediaId = String(IDs.channels.media || "").trim();
  const gameBucket = activeGames.get(chatId);
  if (
    !gameBucket &&
    canCountMessageForActivity(message) &&
    (chId === chatId || (mediaId && chId === mediaId))
  ) {
    recordActivity(getActivityScopeKey(cfg), getActivityWindowMs(cfg), message.author?.id);
  }
  if (chId !== chatId) return false;
  let game = activeGames.get(chId);
  if (!game) {
    game = await ensureTreasureHuntGame(client, cfg);
  }
  if (game?.type === "treasureHunt") {
    if (isStaleOrInvalidActiveGame(game)) {
      await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game, message.channel);
      return false;
    }
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
    return handleTreasureHuntIncomingMessage(message, client, cfg);
  }
  if (!game) {
    if (isMinigameRehydrateBlocked(chatId)) {
      await clearActiveGame(client, { ...cfg, guildId: message.guild.id }).catch(() => { });
    } else {
      await purgeExpiredMinigameDbState(client, { ...cfg, guildId: message.guild.id });
    }
    return false;
  }
  if (game && isStaleOrInvalidActiveGame(game)) {
    await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game, message.channel);
    return false;
  }
  if (game) {
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
  }
  if (!game) return false;

  const content = String(message.content || "").trim();
  const contentForGuess = normalizeUserAnswerText(content);

  if (game.type === "guessNumber") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    const range = Math.max(1, Number(game.max || 100) - Number(game.min || 1));
    const nearThreshold = Math.max(2, Math.round(range * 0.05));
    if (Math.abs(guess - game.target) <= nearThreshold) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    await message
      .reply({ embeds: [buildHintEmbed(guess < game.target)] })
      .catch(() => { });
    return true;
  }

  if (game.type === "guessWord") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessCandidates = extractWordGuessCandidates(contentForGuess);
    if (!guessCandidates.length) {
      return false;
    }
    const targetNorm = normalizeCountryName(game.target || "");
    const targetCompact = targetNorm ? compactNoSpaces(targetNorm) : "";
    const match = guessCandidates.some((c?) => {
      const cNorm = normalizeCountryName(c);
      return (
        cNorm === targetNorm ||
        (targetCompact && cNorm && compactNoSpaces(cNorm) === targetCompact)
      );
    });
    if (match) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      guessCandidates.some((candidate?) =>
        isNearTextGuess(candidate, [game.target], {
          maxDistance: 1,
          maxRatio: 0.25,
        }),
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
      return false;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "guessFlag") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 4,
        minTokenLength: 3,
        singleTokenMinLength: 5,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessPlayer") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizePlayerGuess, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSong") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    const songAnswers = buildSongAnswerAliases(game.title);
    if (
      isSongGuessCorrect(contentForGuess, songAnswers.length ? songAnswers : game.title)
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(
        contentForGuess,
        songAnswers.length ? songAnswers : [game.title],
        { maxDistance: 3, maxRatio: 0.25 },
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessReverseCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessRegionCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "fastType") {
    const normalizedContent = normalizeCountryName(contentForGuess);
    const phraseNorm = game.normalizedPhrase || normalizeCountryName(game.phrase || "");
    if (
      normalizedContent === phraseNorm ||
      (compactNoSpaces(normalizedContent) && compactNoSpaces(normalizedContent) === compactNoSpaces(phraseNorm))
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, normalizedContent, game, [game.normalizedPhrase], {
      maxDistance: 2,
      maxRatio: 0.2,
      minGuessLength: 6,
    });
    return false;
  }

  if (game.type === "memoryEmoji") {
    if (!game.promptMessageId || Date.now() < Number(game.acceptsAt || 0)) {
      await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
      return false;
    }
    if (memoryEmojiMessageMatches(content, game.normalizedSequence)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongIfAttempt(message, content, game);
    return false;
  }

  if (game.type === "guessTeam") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSinger") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (isSingerGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessAlbum") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    if (isSongGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 3, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "italianGK" || game.type === "halloweenQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 2,
    });
    return false;
  }

  if (game.type === "halloweenMissingEmoji") {
    const guess = String(content || "").trim();
    const choices = Array.isArray(game.choices) ? game.choices : [];
    const asIndex = Number.parseInt(guess, 10);
    const fromNumber =
      Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= choices.length ? choices[asIndex - 1] : null;
    const matched =
      (guess && game.answers?.some((a?) => String(a) === guess)) ||
      (fromNumber && game.answers?.some((a?) => String(a) === String(fromNumber)));
    if (matched) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "halloweenCountBats") {
    const n = Number.parseInt(String(contentForGuess || "").replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n === Number(game.count)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "drivingQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const isMultiple = game.questionType === "multiple" && Array.isArray(game.options) && Number.isFinite(game.correctIndex);
    let interpretable = false;
    let correct = false;
    if (isMultiple) {
      const norm = normalizeCountryName(contentForGuess);
      const letter = norm.charAt(0);
      const num = Number.parseInt(norm, 10);
      if (Number.isFinite(num) && num >= 1 && num <= game.options.length) {
        interpretable = true;
        if (num - 1 === game.correctIndex) correct = true;
      } else if (DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase()) >= 0) {
        const idx = DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase());
        if (idx < game.options.length) {
          interpretable = true;
          if (idx === game.correctIndex) correct = true;
        }
      } else if (norm) {
        const correctText = normalizeCountryName(game.options[game.correctIndex] || "");
        if (
          correctText &&
          (norm === correctText || (compactNoSpaces(norm) && compactNoSpaces(norm) === compactNoSpaces(correctText)))
        ) {
          interpretable = true;
          correct = true;
        } else {
          const matchesAnyOption = game.options.some((opt?) => {
            const optNorm = normalizeCountryName(opt || "");
            if (!optNorm) return false;
            if (norm === optNorm) return true;
            const cn = compactNoSpaces(norm);
            const co = compactNoSpaces(optNorm);
            return Boolean(cn && co && cn === co);
          });
          if (matchesAnyOption) interpretable = true;
        }
      }
    } else {
      const guess = normalizeTruthValue(contentForGuess);
      if (guess !== null) {
        interpretable = true;
        if (guess === game.answer) correct = true;
      }
    }
    if (interpretable) {
      const userId = String(message.author?.id || "");
      const cooldownMs = Math.max(0, Number(cfg?.drivingQuiz?.userAnswerCooldownMs ?? DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS));
      if (userId && cooldownMs > 0) {
        if (!game.userLastAnswerAt || typeof game.userLastAnswerAt !== "object") {
          game.userLastAnswerAt = {};
        }
        const last = Number(game.userLastAnswerAt[userId] || 0);
        const nowMs = Date.now();
        if (last && nowMs - last < cooldownMs) {
          await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
          return false;
        }
        game.userLastAnswerAt[userId] = nowMs;
      }
    }
    if (correct) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (interpretable) {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
    if (!Number.isFinite(guessNum)) return false;
    const answerNum = Number(String(game.answer).replace(",", "."));
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 0.01
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 1
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "hangman") {
    if (game._claiming) return true;
    const maxMisses = Number(game.maxMisses || 10);
    const normalized = normalizeCountryName(contentForGuess);
    if (!normalized) return false;
    const guessParts = normalized.split(" ").filter(Boolean);
    if (guessParts.length !== 1) return false;
    const guessText = guessParts[0];
    const wordNorm = normalizeCountryName(String(game.word || ""));
    const userId = String(message.author?.id || "");
    if (!userId) return false;

    if (isHangmanFullWordMatch(guessText, wordNorm)) {
      if (shouldRevealHangmanSolutionOnBoard(cfg, game, message.channelId || message.channel?.id)) {
        const fullWordShown = String(game.word || "").split("").join(" ");
        await updateHangmanBoardMessage(message, game, fullWordShown);
      }
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    if (game._lossFinalized) return true;

    const userMisses = game.userMisses && typeof game.userMisses === "object" ? game.userMisses : {};
    game.userMisses = userMisses;
    const currentUserMisses = Number(userMisses[userId] || 0);
    if (currentUserMisses >= maxMisses) {
      await reactMinigameWrongEmoji(message, game);
      return true;
    }

    if (
      guessText.length > 1 &&
      isNearTextGuess(guessText, [game.word], {
        maxDistance: 2,
        maxRatio: 0.28,
        minGuessLength: 4,
      })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
      return true;
    }

    const guessed = new Set(
      (Array.isArray(game.guessedLetters) ? game.guessedLetters : [])
        .map((ch?) => normalizeCharForGuess(ch))
        .filter((ch?) => /^[a-z0-9]$/.test(ch)),
    );
    let guessHandled = false;
    if (guessText.length === 1 && /^[a-z0-9]$/.test(guessText)) {
      const letter = guessText;
      guessHandled = true;
      if (guessed.has(letter)) {
        await message.delete().catch(() => {});
        return true;
      }
      guessed.add(letter);
      game.guessedLetters = Array.from(guessed.values());
      const isCorrectLetter = wordNorm && wordNorm.includes(letter);
      if (!isCorrectLetter) {
        userMisses[userId] = currentUserMisses + 1;
        game.misses = Math.max(Number(game.misses || 0), Number(userMisses[userId] || 0));
        await reactMinigameWrongEmoji(message, game);
      } else {
        await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => { });
      }
    } else if (guessText.length > 1) {
      guessHandled = true;
      userMisses[userId] = currentUserMisses + 1;
      game.misses = Math.max(Number(game.misses || 0), Number(userMisses[userId] || 0));
      await reactMinigameWrongEmoji(message, game);
    }
    if (!guessHandled) return false;

    const solved = wordNorm && wordNorm.split("").every((ch?) => guessed.has(normalizeCharForGuess(ch)));
    if (solved) {
      if (shouldRevealHangmanSolutionOnBoard(cfg, game, message.channelId || message.channel?.id)) {
        const fullWordShown = String(game.word || "").split("").join(" ");
        await updateHangmanBoardMessage(message, game, fullWordShown);
      }
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    if (Number(game.misses || 0) >= maxMisses) {
      await finalizeHangmanLoss(message, client, cfg, game);
      return true;
    }

    await saveActiveGame(client, cfg, {
      type: "hangman",
      target: JSON.stringify({
        word: game.word,
        guessedLetters: game.guessedLetters,
        misses: Number(game.misses || 0),
        maxMisses: Number(game.maxMisses || 10),
        userMisses: game.userMisses && typeof game.userMisses === "object" ? game.userMisses : {},
      }),
      rewardExp: Number(game.rewardExp || 0),
      startedAt: new Date(game.startedAt || Date.now()),
      endsAt: new Date(game.endsAt || Date.now()),
      gameMessageId: game.gameMessageId || null,
    });

    const maskedWord = maskHangmanWord(game.word, guessed);
    const hmMaxU = Number(game.maxMisses || 10);
    const hmErrU = Math.min(hmMaxU, Number(game.misses || 0));
    const hangmanUpdateAttachment = buildPromptImageAttachment("Impiccato", [
      maskedWord,
      `Errori: ${hmErrU}/${hmMaxU}`,
    ],
      "hangman",
      `update_${Date.now()}`, client);
    const hangmanUpdateEmbed = buildHangmanEmbed(maskedWord, game.rewardExp, Math.max(1000, game.endsAt - Date.now()));
    if (hangmanUpdateAttachment) {
      hangmanUpdateEmbed.setImage(`attachment://${hangmanUpdateAttachment.name}`);
    }
    const channel = message.channel;
    const gameMsg = game.gameMessageId && channel ? await channel.messages.fetch(game.gameMessageId).catch(() => null) : null;
    if (gameMsg) {
      await gameMsg
        .edit({
          embeds: [hangmanUpdateEmbed],
          files: hangmanUpdateAttachment ? [hangmanUpdateAttachment] : [],
        })
        .catch(() => { });
    }
    return true;
  }

  if (game.type === "guessYear") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessNum = parseInt(content.replace(/\D/g, ""), 10);
    if (!Number.isFinite(guessNum)) return false;
    if (guessNum === game.year) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    const diff = Math.abs(guessNum - game.year);
    if (diff <= 2) await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    else await reactMinigameWrongEmoji(message, game);
    await message
      .reply({ embeds: [buildYearHintEmbed(guessNum < game.year)] })
      .catch(() => {});
    return true;
  }

  if (game.type === "completeVerse") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessEmoji") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "quoteFilm") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "completeProverb") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 1,
        minTokenLength: 1,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.35 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "synonymAntonym") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 1, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCity") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  return false;
}

async function handleMinigameButton(interaction?, client?) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;

  if (interaction.customId.startsWith("minigame_song_preview:")) {
    const clickedCustomId = String(interaction.customId || "");
    const clickedMessageId = String(interaction.message?.id || "");
    const clickedChannelId = String(interaction.channelId || "");

    let game = null;
    for (const [channelId, state] of activeGames.entries()) {
      if (!state || state.type !== "guessSong") continue;
      if (String(state.previewCustomId || "") === clickedCustomId) {
        game = state;
        break;
      }
      if (
        clickedMessageId &&
        clickedChannelId &&
        String(channelId || "") === clickedChannelId &&
        String(state.gameMessageId || "") === clickedMessageId
      ) {
        game = state;
      }
    }

    if (!game) {
      await interaction
        .reply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile.", flags: 1 << 6 })
        .catch(() => { });
      return true;
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
    if (!game.previewUrl) {
      await interaction
        .editReply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile." })
        .catch(() => { });
      return true;
    }

    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction
        .editReply({
          content: `<:cancel:1461730653677551691> Non riesco ad allegare il file, ascoltala qui:
${game.previewUrl}`,
        })
        .catch(() => { });
      return true;
    }

    const fallbackText = "<:link:1470064815899803668> Se su telefono non si riproduce, apri questo link per ascoltare: " + game.previewUrl;
    await interaction
      .editReply({
        content: fallbackText,
        files: [new AttachmentBuilder(audio, { name: "anteprima.m4a" })],
      })
      .catch(() => { });
    return true;
  }

  if (String(interaction.customId || "").startsWith("minigame_trickortreat:")) {
    try {
      const {
        handleHalloweenTrickOrTreatButton,
        getTrickOrTreatGame,
        trickOrTreatMapKey,
      } = require("./minigameTrickOrTreat") as typeof import("./minigameTrickOrTreat");
      const winCfg = getConfig(client) || {};
      const channelId = String(interaction.channelId || winCfg.channelId || "").trim();
      const wantId = String(interaction.customId || "");
      let game =
        (channelId && getTrickOrTreatGame(channelId)) ||
        activeGames.get(trickOrTreatMapKey(channelId)) ||
        null;
      if (!game || game.type !== "halloweenTrickOrTreat" || String(game.customId || "") !== wantId) {
        game = null;
        for (const [, g] of activeGames.entries()) {
          if (g?.type === "halloweenTrickOrTreat" && String(g.customId || "") === wantId) {
            game = g;
            break;
          }
        }
      }
      if (!game) {
        await interaction
          .reply({
            content: "<:cancel:1461730653677551691> Round Trick or Treat non attivo.",
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }
      await handleHalloweenTrickOrTreatButton(interaction, game, {
        ...winCfg,
        channelId: channelId || winCfg.channelId,
        guildId: interaction.guildId || winCfg.guildId,
      });
    } catch (err) {
      warnMinigame(err);
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Round Trick or Treat non attivo.",
          flags: 1 << 6,
        })
        .catch(() => {});
    }
    return true;
  }

  const game = activeGames.get(cfg.channelId);
  const isFindBotButton =
    String(interaction.customId || "").startsWith("minigame_findbot:");
  const isFindGhostButton =
    String(interaction.customId || "").startsWith("minigame_findghost:");
  const isFindHiddenButton = isFindBotButton || isFindGhostButton;
  const expectedType = isFindGhostButton ? "halloweenFindGhost" : "findBot";
  let liveGame = game && game.type === expectedType ? game : null;
  let liveMapKey = liveGame ? String(cfg.channelId || "") : "";
    if (!liveGame && isFindHiddenButton) {
    const wantId = String(interaction.customId || "");
    for (const [key, g] of activeGames.entries()) {
      if (g && g.type === expectedType && String(g.customId || "") === wantId) {
        liveGame = g;
        liveMapKey = String(key);
        break;
      }
    }
  }
  if (!liveGame) {
    if (isFindHiddenButton) {
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Partita già conclusa o non attiva.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }
  if (interaction.customId !== liveGame.customId) {
    if (isFindHiddenButton) {
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Questo pulsante non è più valido.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }

  const winCfg =
    liveMapKey && liveMapKey !== String(cfg.channelId || "")
      ? { ...cfg, channelId: liveMapKey }
      : cfg;
  await handleMinigameButtonWin(interaction, liveGame, winCfg);
  return true;
}

async function isMinigameFloodExemptChannel(message?) {
  const cfg = getConfig(message?.client);
  if (!cfg || cfg.enabled === false) return false;
  const msgChId = String(message?.channelId || "");
  if (!msgChId) return false;
  const game = activeGames.get(msgChId);

  if (game && typeof game === "object" && !isStaleOrInvalidActiveGame(game)) {

    const mainChId = String(cfg.channelId || "");
    if (mainChId && msgChId === mainChId) return true;
    if ((game.type === "findBot" || game.type === "halloweenFindGhost") && String(game.channelId || "") === msgChId) {
      return true;
    }
  }

  return false;
}

async function handleMinigameVoiceState(oldState?, newState?, client?) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild) return false;

  const botId = String(client?.user?.id || "");
  const stateUserId = String(newState?.id || oldState?.id || "");
  const active = getActiveFindBotVoiceGame(client);

  if (active && botId && stateUserId === botId) {
    const nextChannelId = String(newState?.channelId || "").trim();
    if (nextChannelId) {
      syncFindBotVoiceTargetChannel(guild, active.game, nextChannelId);
    }
  }

  const member = newState?.member || oldState?.member;
  if (!member?.user || member.user.bot) return false;
  const joinedChannelId = String(newState?.channelId || "");
  const previousChannelId = String(oldState?.channelId || "");
  if (!joinedChannelId || joinedChannelId === previousChannelId) return false;

  if (!active) return false;
  if (String(guild.id) !== String(active.game.guildId || guild.id)) return false;

  const botVoiceId = resolveFindBotVoiceBotChannelId(guild, active.game);
  if (!botVoiceId || botVoiceId !== joinedChannelId) return false;

  const botMember = guild.members.me || guild.members.cache.get(client?.user?.id);
  if (!botMember?.voice?.channelId || String(botMember.voice.channelId) !== botVoiceId) return false;

  return handleFindBotVoiceWin(client, guild, member, active.game, active.cfg);
}

export = { isStaleOrInvalidActiveGame, closeStaleActiveMinigameChannel, handleMinigameReaction, handleMinigameMessage, handleMinigameButton, isMinigameFloodExemptChannel, handleMinigameVoiceState };
