/** Minigiochi: risposte e sconfitta dell'impiccato. */
const { normalizeCountryName, buildHangmanBoardAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildHangmanEmbed, buildHangmanLossEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeCharForGuess, maskHangmanWord } = require("./minigameText") as typeof import("./minigameText");
const { blockMinigameRehydrate } = require("./minigameState") as typeof import("./minigameState");
const { MINIGAME_CORRECT_FALLBACK_EMOJI, reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { saveActiveGame, shouldRevealHangmanSolutionOnBoard, updateHangmanBoardMessage, sendMinigameTimeoutAndClose, handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const { isNearTextGuess, isHangmanFullWordMatch } = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
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
      const attachment = await buildHangmanBoardAttachment(
        game,
        [fullWordShown, `Errori: ${hmMax}/${hmMax}`],
        client,
        `loss_${Date.now()}`,
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

async function handleHangmanMessage(message?, client?, cfg?, game?, content?, contentForGuess?) {
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
      await message.react(E.VC_Flame).catch(() => { });
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
    const hangmanUpdateAttachment = await buildHangmanBoardAttachment(
      game,
      [maskedWord, `Errori: ${hmErrU}/${hmMaxU}`],
      client,
      `update_${Date.now()}`,
    );
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
  return null;
}

export = { handleHangmanMessage };
