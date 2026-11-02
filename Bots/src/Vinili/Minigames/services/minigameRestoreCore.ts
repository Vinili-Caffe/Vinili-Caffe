/** Minigiochi: avvio del ripristino e smistamento per tipo. */
const { minigameStateFindOneLean } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
const { resolveMinigameGuildIdAsync, closeExpiredMinigameState } = require("./minigameRound") as typeof import("./minigameRound");
const { getConfig, loadRotationState } = require("./minigameConfig") as typeof import("./minigameConfig");
const guess = require("./minigameRestoreGuess") as typeof import("./minigameRestoreGuess");
const quiz = require("./minigameRestoreQuiz") as typeof import("./minigameRestoreQuiz");
const find = require("./minigameRestoreFind") as typeof import("./minigameRestoreFind");

async function restoreActiveGames(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  let channel = await getChannelCached(client, cfg.channelId);
  let guildId = channel?.guild?.id || null;
  if (!guildId) guildId = await resolveMinigameGuildIdAsync(cfg, client);
  if (!guildId) return;
  if (!channel) channel = await getChannelCached(client, cfg.channelId);
  await loadRotationState(client, { ...cfg, guildId }, guildId);
  const restoreCfg = { ...cfg, guildId };
  const state = await minigameStateFindOneLean({ guildId, channelId: cfg.channelId, }).catch(() => null);
  if (!state) return;
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (channel) await closeExpiredMinigameState(client, restoreCfg, channel, state);
    else await clearActiveGame(client, restoreCfg);
    return;
  }
  if (!channel?.guild) return;
  const remainingMs = endsAt - now;
  if (await guess.restoreGuessGames(client, cfg, channel, state, remainingMs, endsAt)) return;
  if (await quiz.restoreQuizGames(client, cfg, channel, restoreCfg, state, remainingMs, endsAt)) return;
  if (await find.restoreFindGames(client, cfg, channel, state, remainingMs, endsAt)) return;
}

export = { restoreActiveGames };
