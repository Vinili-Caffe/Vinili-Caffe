/** Minigiochi: ciclo di un round (salvataggio, indizi, tempo scaduto, vittorie perse durante un riavvio, vittoria). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { minigameStateFindOneLean, minigameStateFindOneAndUpdate, minigameStateDeleteOne } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { buildTrickOrTreatEndedEmbed } = require("../../Utils/Minigames/halloweenTrickOrTreatUi") as typeof import("../../Utils/Minigames/halloweenTrickOrTreatUi");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, buildPromptImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { MINIGAME_EMBED_COLOR, buildHangmanEmbed, buildMinuteHintEmbed, buildGenericHintEmbed, buildWinEmbed, buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutSongEmbed, buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed, buildMemoryTimeoutEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutAlbumEmbed, buildTimeoutHangmanEmbed, buildTimeoutItalianGkEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildTimeoutGuessYearEmbed, buildTimeoutCompleteVerseEmbed, buildTimeoutGuessEmojiEmbed, buildTimeoutQuoteFilmEmbed, buildTimeoutCompleteProverbEmbed, buildTimeoutSynonymAntonymEmbed, buildTimeoutGuessCityEmbed, buildTreasureHuntTimeoutEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { normalizePlayerGuess } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, normalizeUserAnswerText, buildStrictBankAliases, isExplicitBankAnswerCorrect, parseMathGuess, extractWordGuessCandidates, buildPlayerAnswerAliases, normalizeMemorySequence, memoryEmojiMessageMatches } = require("./minigameText") as typeof import("./minigameText");
const { lastSentAtByChannel } = require("./minigameActivity") as typeof import("./minigameActivity");
const { activeGames, channelWinClosing, standbyChannels, recordNoParticipationIfNeeded, clearNoParticipationDelay, clearActiveGame, clearMinigameRoundTimers, beginMinigameWinClose, endMinigameWinClose, tryClaimMinigameChannelClose } = require("./minigameState") as typeof import("./minigameState");
const { clearPersistedRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage, reactMinigameWin } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleExpReward, mergeHalloweenCandyDropIntoMessage, awardMinigameWinToUser } = require("./minigameRewards") as typeof import("./minigameRewards");
const { treasureHuntDisplayTexts, removeTreasureHuntReactions, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");

async function resolveMinigameGuildIdAsync(cfg?, client?) {
  const sync = resolveMinigameGuildId(cfg, client);
  if (sync) return sync;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (!channelId || !client?.channels) return "";
  const cached = client.channels.cache?.get(channelId);
  if (cached?.guildId) return String(cached.guildId);
  const fetched = await client.channels.fetch(channelId).catch(() => null);
  if (fetched?.guildId) return String(fetched.guildId);
  return String(IDs.guilds?.main || "").trim();
}

function resolveMinigameGuildId(cfg?, client?) {
  const fromCfg = String(cfg?.guildId || "").trim();
  if (fromCfg) return fromCfg;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (channelId && client?.channels?.cache) {
    const ch = client.channels.cache.get(channelId);
    if (ch?.guildId) return String(ch.guildId);
  }
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (mainGuildId) return mainGuildId;
  return "";
}

function markSent(channelId?) {
  if (!channelId) return;
  lastSentAtByChannel.set(channelId, Date.now());
  standbyChannels.delete(channelId);
  void clearPersistedRolePing(channelId);
  try {
    const { recordChatHubBotPost, extendChatHubQuietForMs, CHAT_HUB_SOURCES } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
    recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI);
    extendChatHubQuietForMs(channelId, 45_000);
  } catch (_) {}
}
const TOT_STATE_SUFFIX = ":halloweenTrickOrTreat";

async function saveActiveGame(client?, cfg?, payload?) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await (minigameStateFindOneAndUpdate as any)(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[MINIGAMES] saveActiveGame failed", {
      channelId,
      guildId,
      type: payload?.type || null,
      err: err?.message || String(err),
    });
  });
  const endsAt = Number(payload?.endsAt || 0);
  if (Number.isFinite(endsAt) && endsAt > Date.now()) {
    try {
      const { extendChatHubQuietUntil } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
      // Quiet sul canale reale anche se lo state è sul doc ToT sintetico
      const quietCh = String(channelId).endsWith(TOT_STATE_SUFFIX)
        ? String(channelId).slice(0, -TOT_STATE_SUFFIX.length)
        : channelId;
      extendChatHubQuietUntil(quietCh, endsAt + 90_000);
    } catch (_) {}
  }
}

async function purgeExpiredMinigameDbState(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (!guildId) return;
  const state = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (!state) return;
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= Date.now()) {
    const channel = await getChannelCached(client, channelId);
    if (channel) {
      await closeExpiredMinigameState(client, { ...cfg, guildId }, channel, state);
    } else {
      await clearActiveGame(client, { ...cfg, guildId, channelId });
    }
    return;
  }
}

function shouldAbortMinigameTimeoutClose(game?, channelId?, options: Record<string, any> = {}) {
  const chId = String(channelId || "").trim();
  if (!game || game._roundClosed) return true;
  if (!chId) return true;
  if (options.allowPersistedClose) return false;
  return !activeGames.has(chId);
}

function parseStateTarget(rawTarget?, fallback: Record<string, any> = {}) {
  try {
    const parsed = JSON.parse(rawTarget || "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch (err) {
    warnMinigame(err);
  }
  return fallback;
}

function shouldRevealHangmanSolutionOnBoard(cfg?, game?, channelId = "") {
  if (!game || game.type !== "hangman") return false;
  return true;
}

async function revealHangmanSolutionBoard(channelOrMessage?, game?, cfg = null) {
  if (!game || game.type !== "hangman") return;
  const word = String(game.word || "").trim();
  if (!word) return;
  const fullWordShown = word.split("").join(" ");
  const messageLike =
    channelOrMessage?.channel
      ? channelOrMessage
      : { channel: channelOrMessage, client: channelOrMessage?.client || null };
  if (!messageLike.channel) return;
  if (cfg && !shouldRevealHangmanSolutionOnBoard(cfg, game, messageLike.channel.id)) return;
  await updateHangmanBoardMessage(messageLike, game, fullWordShown);
}

async function updateHangmanBoardMessage(message?, game?, shownWord?) {
  const channel = message.channel;
  const gameMsg = game.gameMessageId && channel
    ? await channel.messages.fetch(game.gameMessageId).catch(() => null)
    : null;
  if (!gameMsg) return;
  const hmMax = Number(game.maxMisses || 10);
  const hmErr = Math.min(hmMax, Number(game.misses || 0));
  const hangmanSolvedAttachment = buildPromptImageAttachment(
    "Impiccato",
    [shownWord, `Errori: ${hmErr}/${hmMax}`],
    "hangman",
    `solved_${Date.now()}`, message.client);
  const hangmanSolvedEmbed = buildHangmanEmbed(
    shownWord,
    game.rewardExp,
    Math.max(1000, game.endsAt - Date.now()),
  );
  if (hangmanSolvedAttachment) {
    hangmanSolvedEmbed.setImage(`attachment://${hangmanSolvedAttachment.name}`);
  }
  await gameMsg
    .edit({
      embeds: [hangmanSolvedEmbed],
      files: hangmanSolvedAttachment ? [hangmanSolvedAttachment] : [],
    })
    .catch(() => {});
}

function buildMinigameTimeoutEmbedForGame(game?) {
  if (!game || !game.type) return null;
  const type = String(game.type);
  switch (type) {
    case "guessNumber":
      return buildTimeoutNumberEmbed(Number(game.target));
    case "guessWord":
      return buildTimeoutWordEmbed(String(game.target || ""));
    case "guessFlag":
      return buildTimeoutFlagEmbed(String(game.displayName || "la bandiera"));
    case "guessPlayer":
      return buildTimeoutPlayerEmbed(String(game.displayName || game.name || "il calciatore"));
    case "guessSong":
      return buildTimeoutSongEmbed(String(game.title || "la canzone"), String(game.artist || ""));
    case "guessCapital":
      return buildTimeoutCapitalEmbed(String(game.country || "nazione sconosciuta"), String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "guessRegionCapital":
      return buildTimeoutRegionCapitalEmbed(String(game.region || "regione sconosciuta"), String(game.displayAnswer || game.answers?.[0] || "sconosciuto"));
    case "guessReverseCapital":
      return buildTimeoutReverseCapitalEmbed(String(game.capital || "capitale sconosciuta"), String(game.displayAnswer || game.country || game.answers?.[0] || "sconosciuto"));
    case "fastType":
      return buildTimeoutFastTypeEmbed(String(game.phrase || "frase sconosciuta"));
    case "guessTeam":
      return buildTimeoutTeamEmbed(String(game.team || "squadra sconosciuta"));
    case "guessSinger":
      return buildTimeoutSingerEmbed(String(game.name || "cantante sconosciuto"));
    case "guessAlbum":
      return buildTimeoutAlbumEmbed(String(game.album || "album sconosciuto"), String(game.artist || ""));
    case "hangman":
      return buildTimeoutHangmanEmbed(String(game.word || "parola sconosciuta"));
    case "italianGK":
      return buildTimeoutItalianGkEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "memoryEmoji":
      return buildMemoryTimeoutEmbed(String(game.sequence || ""));
    case "drivingQuiz":
      return buildTimeoutDrivingQuizEmbed(game);
    case "mathExpression":
      return buildTimeoutMathEmbed(String(game.answer ?? "0"));
    case "findBot":
      return buildTimeoutFindBotEmbed();
    case "halloweenFindGhost":
      return buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻");
    case "findBotVoice":
      return buildTimeoutFindBotVoiceEmbed();
    case "guessYear":
      return buildTimeoutGuessYearEmbed(String(game.title || "titolo"), String(game.subtitle || ""), Number(game.year) || 0);
    case "completeVerse":
      return buildTimeoutCompleteVerseEmbed(String(game.answer || "verso"), String(game.song || "canzone"), String(game.artist || "artista"));
    case "guessEmoji":
      return buildTimeoutGuessEmojiEmbed(String(game.emojis || ""), String(game.displayAnswer || game.answers?.[0] || ""));
    case "quoteFilm":
      return buildTimeoutQuoteFilmEmbed(String(game.quote || "citazione"), String(game.displayAnswer || game.answer || game.answers?.[0] || ""));
    case "completeProverb":
      return buildTimeoutCompleteProverbEmbed(String(game.start || ""), String(game.end || ""));
    case "synonymAntonym":
      return buildTimeoutSynonymAntonymEmbed(String(game.word || ""), String(game.answer ?? game.answers?.[0] ?? ""), String(game.kind || ""));
    case "guessCity":
      return buildTimeoutGuessCityEmbed(String(game.landmark || ""), String(game.city || game.answers?.[0] || ""));
    case "halloweenQuiz":
      return buildTimeoutItalianGkEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta")).setTitle("Tempo scaduto — Quiz Halloween");
    case "halloweenMissingEmoji":
      return new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle("Tempo scaduto 🎃")
        .setDescription(`L'emoji mancante era **${game.displayAnswer || game.missing || "?"}**.`);
    case "halloweenCountBats":
      return new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle("Tempo scaduto 🦇")
        .setDescription(`I pipistrelli erano **${game.displayAnswer || game.count || "?"}**.`);
    case "halloweenTrickOrTreat": {
      const claimed = Object.keys(game?.claimedBy || {}).length;
      return buildTrickOrTreatEndedEmbed(claimed);
    }
    default:
      return null;
  }
}

function buildGameSnapshotFromPersistedState(state?) {
  const type = String(state?.type || "").trim();
  const parsed = parseStateTarget(state.target);
  const game: Record<string, any> = { type, rewardExp: Number(state.rewardExp || 0) };
  switch (type) {
    case "guessNumber":
      game.target = Number(state.target);
      return game;
    case "guessWord":
      game.target = String(state.target || "");
      return game;
    case "guessFlag":
      game.displayName = parsed?.displayName || "la bandiera";
      return game;
    case "guessPlayer":
      game.displayName = parsed?.name || parsed?.displayName || "il calciatore";
      game.name = parsed?.name || game.displayName;
      return game;
    case "guessSong":
      game.title = parsed?.title || "la canzone";
      game.artist = parsed?.artist || "";
      return game;
    case "guessCapital":
      game.country = parsed?.country || "nazione sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      return game;
    case "guessRegionCapital":
      game.region = parsed?.region || "regione sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuto";
      return game;
    case "guessReverseCapital":
      game.capital = parsed?.capital || "capitale sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.country || parsed?.answers?.[0] || "sconosciuto";
      return game;
    case "fastType":
      game.phrase = parsed?.phrase || "frase sconosciuta";
      return game;
    case "guessTeam":
      game.team = parsed?.team || "squadra sconosciuta";
      return game;
    case "guessSinger":
      game.name = parsed?.name || "cantante sconosciuto";
      return game;
    case "guessAlbum":
      game.album = parsed?.album || "album sconosciuto";
      game.artist = parsed?.artist || "";
      return game;
    case "hangman":
      game.word = parsed?.word || String(state.target || "parola sconosciuta");
      return game;
    case "italianGK":
    case "halloweenQuiz":
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenMissingEmoji":
      game.display = parsed?.display || "";
      game.missing = parsed?.missing || "";
      game.choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
      game.displayAnswer = parsed?.missing || parsed?.answers?.[0] || "?";
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenCountBats":
      game.display = parsed?.display || "";
      game.count = Number(parsed?.count);
      game.displayAnswer = String(parsed?.count ?? parsed?.answers?.[0] ?? "?");
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenTrickOrTreat":
      game.treatChancePercent = Number(parsed?.treatChancePercent ?? 80);
      game.candyOnTreat = Number(parsed?.candyOnTreat ?? 1);
      game.claimedBy = parsed?.claimedBy && typeof parsed.claimedBy === "object" ? parsed.claimedBy : {};
      game.customId = parsed?.customId || state.customId || "";
      game.multiClaim = true;
      return game;
    case "memoryEmoji":
      game.sequence = parsed?.sequence || "";
      return game;
    case "drivingQuiz":
      if (Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex)) {
        return { ...game, questionType: "multiple", options: parsed.options, correctIndex: parsed.correctIndex };
      }
      return { ...game, answer: Boolean(parsed?.answer) };
    case "mathExpression":
      game.answer = parsed?.answer ?? "0";
      return game;
    case "guessYear":
      game.title = parsed?.title || "titolo";
      game.subtitle = parsed?.subtitle || "";
      game.year = Number(parsed?.year) || 0;
      return game;
    case "completeVerse":
      game.answer = parsed?.answer || "verso";
      game.song = parsed?.song || "canzone";
      game.artist = parsed?.artist || "artista";
      return game;
    case "guessEmoji":
      game.emojis = parsed?.emojis || "";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "";
      game.answers = parsed?.answers || [];
      return game;
    case "quoteFilm":
      game.quote = parsed?.quote || "citazione";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answer || parsed?.answers?.[0] || "";
      game.answer = parsed?.answer || game.displayAnswer;
      return game;
    case "completeProverb":
      game.start = parsed?.start || "";
      game.end = parsed?.end || "";
      return game;
    case "synonymAntonym":
      game.word = parsed?.word || "";
      game.answer = parsed?.answer || parsed?.answers?.[0] || "";
      game.kind = parsed?.kind || "";
      game.answers = parsed?.answers || [];
      return game;
    case "guessCity":
      game.landmark = parsed?.landmark || "";
      game.city = parsed?.city || parsed?.answers?.[0] || "";
      game.answers = parsed?.answers || [];
      return game;
    case "findBot":
    case "halloweenFindGhost":
    case "findBotVoice":
      return game;
    default:
      return { ...game, ...parsed };
  }
}

async function deleteFindMinigameRemoteMessage(guild?, gameOrState?) {
  const targetChannelId = String(gameOrState?.channelId || gameOrState?.targetChannelId || "").trim();
  const messageId = String(gameOrState?.messageId || gameOrState?.gameMessageId || "").trim();
  if (!guild || !targetChannelId || !messageId) return false;
  const targetChannel = guild.channels.cache.get(targetChannelId) || (await guild.channels.fetch(targetChannelId).catch(() => null));
  if (!targetChannel?.messages?.fetch) return false;
  const msg = await targetChannel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  await msg.delete().catch(() => {});
  return true;
}

async function closeExpiredMinigameState(client?, cfg?, channel?, state?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(channel?.guild?.id || cfg?.guildId || "").trim();
  const type = String(state?.type || "").trim();
  if (!channelId || !type) return;
    if (channel && (await tryAwardMissedMinigameWinFromHistory(client, cfg, channel, state))) {
    return;
  }
  if (type === "treasureHunt") {
    let decoy = "";
    let winner = "";
    let winnerMessageId = "";
    let candidateIds = [];
    try {
      const parsed = JSON.parse(state.target || "{}");
      decoy = String(parsed?.decoy || "");
      winner = String(parsed?.winner || "");
      winnerMessageId = String(parsed?.winnerMessageId || "");
      candidateIds = Array.isArray(parsed?.candidateIds) ? parsed.candidateIds.map(String) : [];
    } catch (err) {
      warnMinigame(err);
    }
    const url = getTreasureHuntMessageUrl(guildId, channel.id, winnerMessageId);
    const labels = await treasureHuntDisplayTexts(channel.guild, decoy, winner);
    await sendMinigameMessage(channel, {
      embeds: [buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url)],
    }).catch(() => { });
    if (candidateIds.length) removeTreasureHuntReactions(channel, candidateIds, decoy, winner).catch(() => { });
    await minigameStateDeleteOne({ guildId, channelId }).catch(() => { });
    return;
  }
  const game = buildGameSnapshotFromPersistedState(state);
  await sendMinigameTimeoutAndClose(
    client,
    cfg,
    channelId,
    channel,
    game,
    buildMinigameTimeoutEmbedForGame(game),
    { allowPersistedClose: true },
  );
  if (type === "findBot" || type === "halloweenFindGhost") {
    await deleteFindMinigameRemoteMessage(channel.guild, state);
  }
  if (type === "findBotVoice") {
    await leaveFindBotVoiceChannel(channel.guild?.id);
  }
}

function scheduleMinigameRoundTimeout(client?, cfg?, channelId?, channel?, durationMs?) {
  const timer = setTimeout(async () => {
    const chId = String(channelId || "").trim();
    if (!chId || channelWinClosing.has(chId)) return;
    const game = activeGames.get(chId);
    if (game && !shouldAbortMinigameTimeoutClose(game, chId)) {
      const won = await catchUpTextMinigameWinFromHistory(client, cfg, channel, game).catch(() => false);
      if (won || shouldAbortMinigameTimeoutClose(activeGames.get(chId), chId)) return;
      await sendMinigameTimeoutAndClose(client, cfg, chId, channel, game, buildMinigameTimeoutEmbedForGame(game));
      return;
    }
            try {
      let guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
      if (!guildId) guildId = await resolveMinigameGuildIdAsync({ ...cfg, channelId: chId }, client);
      await purgeExpiredMinigameDbState(client, { ...cfg, channelId: chId, guildId });
    } catch (err) {
      warnMinigame(err);
    }
  }, Math.max(0, Number(durationMs) || 0));
  timer.unref?.();
  return timer;
}

async function sendMinigameTimeoutAndClose(client?, cfg?, channelId?, channel?, game?, timeoutEmbed?, options: Record<string, any> = {}) {
  const chId = String(channelId || "").trim();
  if (shouldAbortMinigameTimeoutClose(game, chId, options)) return;
  if (!tryClaimMinigameChannelClose(chId)) return;
  try {
    recordNoParticipationIfNeeded(chId, game);
    clearMinigameRoundTimers(game);
    if (game?.type === "hangman") {
      const boardChannel = channel?.send ? channel : await getChannelCached(client, chId);
      if (boardChannel) await revealHangmanSolutionBoard(boardChannel, game).catch(() => { });
    }
    const embeds = [];
    if (timeoutEmbed) {
      embeds.push(timeoutEmbed);
    } else {
            embeds.push(
        new EmbedBuilder()
          .setColor(MINIGAME_EMBED_COLOR)
          .setDescription(
            "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha vinto questo minigioco.",
          ),
      );
    }
    activeGames.delete(chId);
    if (embeds.length) {
      let targetChannel = channel?.send ? channel : null;
      let sent = targetChannel ? await sendMinigameMessage(targetChannel, { embeds }) : null;
      if (!sent) {
        const fresh = await getChannelCached(client, chId);
        if (fresh?.send) sent = await sendMinigameMessage(fresh, { embeds });
      }
      if (!sent) {
                await new Promise((r?) => setTimeout(r, 750));
        const retryCh = await getChannelCached(client, chId);
        if (retryCh?.send) sent = await sendMinigameMessage(retryCh, { embeds });
      }
      if (!sent) {
        global.logger?.warn?.("[MINIGAMES] timeout embed send failed", {
          channelId: chId,
          type: game?.type || null,
        });
      }
    }
    let guildId = String(cfg?.guildId || "").trim();
    if (!guildId) guildId = String(channel?.guild?.id || "").trim();
    await clearActiveGame(client, { ...cfg, channelId: chId, guildId }, game);
  } finally {
    endMinigameWinClose(chId);
  }
}

async function scheduleMinuteHint(client?, hintChannelId?, durationMs?, channelId?, hintBeforeExpiryMs = 60 * 1000) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel) return null;
  const beforeMs = Math.max(60 * 1000, Math.min(durationMs - 30 * 1000, Math.floor(Number(hintBeforeExpiryMs) || 60 * 1000)));
  const delay = durationMs - beforeMs;
  if (delay < 5 * 1000) return null;
  const timer = setTimeout(async () => {
    await sendMinigameMessage(mainChannel, { embeds: [buildMinuteHintEmbed(hintChannelId)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

async function scheduleGenericHint(client?, channelId?, durationMs?, hintText?) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000 || !hintText)
    return null;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  const timer = setTimeout(async () => {
    await sendMinigameMessage(channel, { embeds: [buildGenericHintEmbed(hintText)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

const findBotVoiceSessionByGuild = new Map();

async function leaveFindBotVoiceChannel(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const row = findBotVoiceSessionByGuild.get(gid);
  if (row?.connection) {
    try {
      row.connection.destroy();
    } catch (_) {}
  }
  findBotVoiceSessionByGuild.delete(gid);
}

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
        content: "<:VC_Attention:1482534443632558151> Risposta registrata, ma non sono riuscito a completare i premi. Il round è comunque chiuso.",
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

export = { resolveMinigameGuildIdAsync, markSent, TOT_STATE_SUFFIX, saveActiveGame, purgeExpiredMinigameDbState, parseStateTarget, shouldRevealHangmanSolutionOnBoard, updateHangmanBoardMessage, buildMinigameTimeoutEmbedForGame, buildGameSnapshotFromPersistedState, deleteFindMinigameRemoteMessage, closeExpiredMinigameState, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleMinuteHint, scheduleGenericHint, findBotVoiceSessionByGuild, leaveFindBotVoiceChannel, catchUpMemoryEmojiWinFromHistory, handleMinigameWin };
