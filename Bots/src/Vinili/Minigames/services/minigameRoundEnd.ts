/** Minigiochi: tempo scaduto, chiusura round e stato persistito. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { minigameStateFindOneLean, minigameStateDeleteOne } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { MINIGAME_EMBED_COLOR, buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutSongEmbed, buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed, buildMemoryTimeoutEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutAlbumEmbed, buildTimeoutHangmanEmbed, buildTimeoutItalianGkEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildTimeoutGuessYearEmbed, buildTimeoutCompleteVerseEmbed, buildTimeoutGuessEmojiEmbed, buildTimeoutQuoteFilmEmbed, buildTimeoutCompleteProverbEmbed, buildTimeoutSynonymAntonymEmbed, buildTimeoutGuessCityEmbed, buildTreasureHuntTimeoutEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { activeGames, channelWinClosing, recordNoParticipationIfNeeded, clearActiveGame, clearMinigameRoundTimers, endMinigameWinClose, tryClaimMinigameChannelClose } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { treasureHuntDisplayTexts, removeTreasureHuntReactions, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { resolveMinigameGuildIdAsync } = require("./minigameRoundStart") as typeof import("./minigameRoundStart");
const { revealHangmanSolutionBoard } = require("./minigameRoundAdvance") as typeof import("./minigameRoundAdvance");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
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
    case "starWarsQuiz":
      return buildTimeoutItalianGkEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta")).setTitle("Tempo scaduto — Quiz Star Wars");
    case "starWarsGuessPlanet": {
      try {
        const { buildTimeoutPlanetEmbed } = require("../../../../archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsGuessPlanet");
        return buildTimeoutPlanetEmbed(String(game.planetName || game.displayAnswer || game.answer || "?"));
      } catch (_) {
        return buildTimeoutItalianGkEmbed(String(game.planetName || game.displayAnswer || "?")).setTitle("Tempo scaduto — Indovina il pianeta");
      }
    }
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
    case "halloweenTrickOrTreat":
      return new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle("Trick or Treat concluso")
        .setDescription("Il round Halloween non è più attivo.");
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
      game.guessedLetters = Array.isArray(parsed?.guessedLetters) ? parsed.guessedLetters : [];
      game.misses = Number(parsed?.misses || 0);
      game.maxMisses = Number(parsed?.maxMisses || 10);
      game.userMisses = parsed?.userMisses && typeof parsed.userMisses === "object" ? parsed.userMisses : {};
      game.swBackgroundUrl = parsed?.swBackgroundUrl || null;
      return game;
    case "italianGK":
    case "halloweenQuiz":
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      return game;
    case "starWarsQuiz":
      game.kind = parsed?.kind || "text";
      game.question = parsed?.question || "";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      game.answer = typeof parsed?.answer === "boolean" ? parsed.answer : game.answer;
      game.choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
      game.correctIndex = Number.isFinite(parsed?.correctIndex) ? parsed.correctIndex : -1;
      game.malusId = parsed?.malusId || null;
      game.frozenUserIds = Array.isArray(parsed?.frozenUserIds) ? parsed.frozenUserIds : [];
      game.geoFactionId = parsed?.geoFactionId || null;
      game.geonosianCorrectIds = Array.isArray(parsed?.geonosianCorrectIds) ? parsed.geonosianCorrectIds : [];
      return game;
    case "starWarsGuessPlanet":
      game.planetId = parsed?.planetId || "";
      game.planetName = parsed?.planetName || parsed?.displayAnswer || "pianeta";
      game.displayAnswer = parsed?.planetName || parsed?.displayAnswer || "pianeta";
      game.answer = game.planetName;
      game.answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
      game.hint = parsed?.hint || "";
      game.imageUrl = parsed?.imageUrl || "";
      game.swBackgroundUrl = parsed?.swBackgroundUrl || null;
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
      game.channelId = String(state.targetChannelId || state.channelId || "");
      game.messageId = String(state.gameMessageId || state.messageId || "");
      game.mainMessageId = String(state.mainMessageId || "");
      game.customId = String(state.customId || "");
      return game;
    case "findBotVoice":
      game.channelId = String(state.targetChannelId || state.channelId || "");
      game.voiceChannelId = game.channelId;
      game.customId = String(state.customId || "");
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
    const { tryAwardMissedMinigameWinFromHistory } = require("./minigameRoundScoring") as typeof import("./minigameRoundScoring");
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
  if (type === "findBot") {
    try {
      const { catchUpFindBotFromReactions } = require("./minigameFindBot") as typeof import("./minigameFindBot");
      const snap = buildGameSnapshotFromPersistedState(state);
      if (snap && (await catchUpFindBotFromReactions(client, cfg, snap).catch(() => false))) return;
    } catch (_) {}
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
      const { catchUpTextMinigameWinFromHistory } = require("./minigameRoundScoring") as typeof import("./minigameRoundScoring");
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
    let loseEmbed = timeoutEmbed;
    if (!loseEmbed) {
      loseEmbed = new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setDescription(`${E.VC_pixeltime} Tempo scaduto! Nessuno ha vinto questo minigioco.`);
    }
    try {
      const { resolveStarWarsClassicLoseImageUrl } = require("../utils/starWarsMinigameHooks") as typeof import("../utils/starWarsMinigameHooks");
      const loseImg = resolveStarWarsClassicLoseImageUrl(cfg);
      if (loseImg && loseEmbed && typeof loseEmbed.setImage === "function" && !loseEmbed.data?.image) {
        loseEmbed.setImage(String(loseImg));
      }
    } catch (_) {}
    const embeds = loseEmbed ? [loseEmbed] : [];
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
    try {
      const { consumeMalusAfterGame } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService");
      await consumeMalusAfterGame(game);
    } catch (_) {}
  } finally {
    endMinigameWinClose(chId);
  }
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

export = {
  purgeExpiredMinigameDbState,
  parseStateTarget,
  buildMinigameTimeoutEmbedForGame,
  buildGameSnapshotFromPersistedState,
  deleteFindMinigameRemoteMessage,
  closeExpiredMinigameState,
  scheduleMinigameRoundTimeout,
  sendMinigameTimeoutAndClose,
  findBotVoiceSessionByGuild,
  leaveFindBotVoiceChannel,
};
