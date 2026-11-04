/** Minigiochi: indizi e aggiornamento della partita in corso. */
const { buildHangmanBoardAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildHangmanEmbed, buildMinuteHintEmbed, buildGenericHintEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");

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
  const hangmanSolvedAttachment = await buildHangmanBoardAttachment(
    game,
    [shownWord, `Errori: ${hmErr}/${hmMax}`],
    message.client,
    `solved_${Date.now()}`,
  );
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

export = {
  shouldRevealHangmanSolutionOnBoard,
  revealHangmanSolutionBoard,
  updateHangmanBoardMessage,
  scheduleMinuteHint,
  scheduleGenericHint,
};
