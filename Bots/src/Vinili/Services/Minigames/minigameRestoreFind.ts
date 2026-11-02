/** Minigiochi: ripristino caccia al tesoro e trova il bot. */
const { buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed, buildTreasureHuntTimeoutEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { activeGames, clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { treasureHuntDisplayTexts, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { parseStateTarget, scheduleMinuteHint } = require("./minigameRound") as typeof import("./minigameRound");
const { mountTreasureHuntGame } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const { scheduleFindMinigameTimeout, joinFindBotVoiceChannel } = require("./minigameFindBot") as typeof import("./minigameFindBot");

async function restoreFindGames(client?, cfg?, channel?, state?, remainingMs?, endsAt?) {
  if (state.type === "treasureHunt") {
    const parsed = parseStateTarget(state.target);
    const decoy = String(parsed?.decoy || "");
    const winner = String(parsed?.winner || "");
    const winnerMessageId = parsed?.winnerMessageId ? String(parsed.winnerMessageId) : null;
    if (!decoy || !winner) {
      await clearActiveGame(client, cfg);
      return true;
    }
    if (winnerMessageId) {
      const winnerExists = await channel.messages.fetch(winnerMessageId).catch(() => null);
      if (!winnerExists) {
        const url = getTreasureHuntMessageUrl(channel.guildId || channel.guild?.id, channel.id, winnerMessageId);
        const labels = await treasureHuntDisplayTexts(channel.guild, decoy, winner);
        await sendMinigameMessage(channel, {
            embeds: [
              buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url),
            ],
          })
          .catch(() => {});
        await clearActiveGame(client, cfg);
        return true;
      }
    }
    await mountTreasureHuntGame(client, cfg, channel, state, remainingMs);
    return true;
  }
  if (state.type === "findBot" || state.type === "halloweenFindGhost") {
    const timeoutEmbedBuilder =
      state.type === "halloweenFindGhost"
        ? () => buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻")
        : buildTimeoutFindBotEmbed;
    const timeout = scheduleFindMinigameTimeout(client, cfg, cfg.channelId, channel, state.customId, remainingMs, timeoutEmbedBuilder);
    const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId,);
    const game = {
      type: state.type,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId,
    };
    activeGames.set(cfg.channelId, game);
    return true;
  }
  if (state.type === "findBotVoice") {
    const voiceChannelId = String(state.targetChannelId || "").trim();
    const guildId = String(channel.guild?.id || cfg.guildId || "");
    if (voiceChannelId && channel.guild) {
      const voiceChannel =
        channel.guild.channels.cache.get(voiceChannelId) ||
        (await channel.guild.channels.fetch(voiceChannelId).catch(() => null));
      if (voiceChannel?.isVoiceBased?.()) {
        await joinFindBotVoiceChannel(channel.guild, voiceChannel).catch(() => null);
      }
    }
    const sessionId = state.customId || `minigame_findbotvoice:restored:${Date.now()}`;
    const timeout = scheduleFindMinigameTimeout(
      client,
      cfg,
      cfg.channelId,
      channel,
      sessionId,
      remainingMs,
      buildTimeoutFindBotVoiceEmbed,
    );
    const hintTimeout = voiceChannelId
      ? await scheduleMinuteHint(client, voiceChannelId, remainingMs, cfg.channelId)
      : null;
    activeGames.set(cfg.channelId, {
      type: "findBotVoice",
      guildId,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: voiceChannelId,
      voiceChannelId,
      mainMessageId: state.mainMessageId || null,
      customId: sessionId,
    });
    return true;
  }
  return false;
}

export = { restoreFindGames };
