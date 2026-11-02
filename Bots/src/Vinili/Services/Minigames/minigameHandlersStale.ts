/** Minigiochi: partite scadute da chiudere. */
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { recordNoParticipationIfNeeded, clearMinigameRoundTimers } = require("./minigameState") as typeof import("./minigameState");
const { buildMinigameTimeoutEmbedForGame, sendMinigameTimeoutAndClose } = require("./minigameRound") as typeof import("./minigameRound");

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

export = { isStaleOrInvalidActiveGame, closeStaleActiveMinigameChannel };
