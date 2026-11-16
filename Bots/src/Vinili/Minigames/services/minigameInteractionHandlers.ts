/** Reazioni, bottoni e voice state minigiochi. Estratto da minigameHandlers. */
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { buildWinEmbed, resolveWinEmbedImageUrl, buildTreasureHuntFoundEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { activeGames, blockMinigameRehydrate, clearNoParticipationDelay, clearActiveGame, beginMinigameWinClose, endMinigameWinClose } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { minigameDraftVars } = require("./minigameDraftSend") as typeof import("./minigameDraftSend");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  handleExpReward,
  awardMinigameWinToUser,
  mergeHalloweenCandyDropIntoMessage,
  mergeStarWarsQuizRewardIntoMessage,
} = require("./minigameRewards") as typeof import("./minigameRewards");
const { treasureEmojiMatches, botPlacedTreasureReaction, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");
const { ensureTreasureHuntGame, cleanupTreasureHuntReactions } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const {
  resolveFindBotVoiceBotChannelId,
  syncFindBotVoiceTargetChannel,
  getActiveFindBotVoiceGame,
  handleFindBotVoiceWin,
  findBotClaimEmojiMatches,
  handleFindBotClaimWin,
} = require("./minigameFindBot") as typeof import("./minigameFindBot");
const { fetchAudioAttachment } = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

async function handleMinigameReaction(client?, reaction?, user?) {
  let message: any = null;
  let cfg: any = null;
  try {
    if (!reaction || !user || user.bot) return false;
    let liveReaction = reaction;
    if (liveReaction.partial) {
      liveReaction = await liveReaction.fetch().catch(() => null);
      if (!liveReaction) return false;
    }
    message = liveReaction.message;
    if (message?.partial) {
      message = await message.fetch().catch(() => null);
      if (!message) return false;
    }
    if (!message?.guild) return false;
    cfg = getConfig(client || message.client);
    if (!cfg?.enabled || !cfg.channelId) return false;

    /* Trova il bot: claim via reazione sul messaggio nascosto (recuperabile al riavvio). */
    {
      let findGame = activeGames.get(cfg.channelId);
      if (!findGame || findGame.type !== "findBot") {
        for (const g of activeGames.values()) {
          if (g?.type === "findBot" && String(g.messageId || "") === String(message.id)) {
            findGame = g;
            break;
          }
        }
      }
      if (
        findGame?.type === "findBot" &&
        String(findGame.messageId || "") === String(message.id) &&
        findBotClaimEmojiMatches(liveReaction)
      ) {
        if (cfg.starWarsEventLive) {
          try {
            const {
              isStarWarsSortedParticipant,
              UNSORTED_MG_MSG,
            } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService");
            const ok = await isStarWarsSortedParticipant(client || message.client, message.guildId, user.id);
            if (!ok) {
              await liveReaction.users?.remove?.(user.id).catch(() => null);
              const ch = message.channel;
              if (ch?.send) {
                const tip = await ch
                  .send({ content: `<@${user.id}> ${UNSORTED_MG_MSG}`, allowedMentions: { users: [user.id] } })
                  .catch(() => null);
                if (tip) setTimeout(() => void tip.delete?.().catch?.(() => null), 10_000);
              }
              return true;
            }
          } catch (err) {
            global.logger?.warn?.("[MINIGAMES] Star Wars sort gate failed (findBot reaction); denying play", {
              guildId: message.guildId,
              userId: user.id,
              err: (err as any)?.message || String(err),
            });
            await liveReaction.users?.remove?.(user.id).catch(() => null);
            return true;
          }
        }
        if (findGame._claiming) return true;
        findGame._claiming = true;
        const mapKey = [...activeGames.entries()].find(([, g]) => g === findGame)?.[0] || cfg.channelId;
        const winCfg = { ...cfg, channelId: mapKey };
        try {
          const won = await handleFindBotClaimWin(client || message.client, message.guild, user, findGame, winCfg);
          if (!won) findGame._claiming = false;
        } catch (err) {
          findGame._claiming = false;
          throw err;
        }
        return true;
      }
    }

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
    clearNoParticipationDelay(cfg.channelId);
    const guildId = message.guild.id;
    const winCfg = { ...cfg, guildId };
    const closed = await beginMinigameWinClose(botClient, winCfg, game);
    if (!closed) {
      game._claiming = false;
      return true;
    }
    const channel = message.channel
      || (await getChannelCached(botClient, cfg.channelId));
    try {
      const award = await awardMinigameWinToUser({
        client: botClient,
        guild: message.guild,
        userId: user.id,
        cfg: winCfg,
        game,
        rewardExp: game.rewardExp,
        channelId: cfg.channelId || null,
      });
      const winEmbed = buildWinEmbed(
        user.id,
        award.effectiveExp,
        award.nextTotal,
        award.details,
        await resolveWinEmbedImageUrl(cfg, user.id),
      );
      const foundEmbed = buildTreasureHuntFoundEmbed(getTreasureHuntMessageUrl(guildId, cfg.channelId, game.winnerMessageId));
      if (channel?.send) {
        await sendMinigameMessage(
          channel,
          { embeds: [foundEmbed, winEmbed] },
          {
            type: "treasureHunt",
            kind: "win",
            vars: minigameDraftVars(channel, {
              user: `<@${user.id}>`,
              exp: award.effectiveExp,
              total: award.nextTotal,
              streak: award.details?.newStreak ?? (award as any).newStreak ?? 1,
            }),
            mentionUserId: user.id,
          },
        ).catch(() => {});
      }
      if (award.member) {
        await handleExpReward(botClient, award.member, award.nextTotal);
      }
      if (channel && Array.isArray(game.candidateIds) && game.candidateIds.length) {
        await cleanupTreasureHuntReactions(channel, game);
      }
      return true;
    } catch (err) {
      warnMinigame(err);
      return false;
    } finally {
      await clearActiveGame(botClient, winCfg, game).catch(() => {});
      endMinigameWinClose(cfg.channelId);
    }
  } catch (err) {
    warnMinigame(err);
    try {
      const chId = String(cfg?.channelId || message?.channelId || "");
      const gId = String(message?.guild?.id || cfg?.guildId || "");
      if (chId && gId) await clearActiveGame(client || message?.client, { ...cfg, channelId: chId, guildId: gId }).catch(() => {});
    } catch (_) {}
    return false;
  }
}

async function handleMinigameButtonWin(interaction?, game?, cfg?) {
  /* Legacy findBot a bottone: stesso percorso win della reazione. */
  if (game?.type === "findBot") {
    await handleFindBotClaimWin(interaction.client, interaction.guild, interaction.user, game, cfg, {
      ephemeralReply: async (content?) =>
        interaction.reply({ content, flags: 1 << 6 }).catch(() => null),
    });
    return;
  }
  clearNoParticipationDelay(cfg.channelId);
  const client = interaction.client;
  const winCfg = { ...cfg, guildId: interaction.guild.id };
  const channelId = String(winCfg.channelId || "");

  const closed = await beginMinigameWinClose(client, winCfg, game);
  if (!closed) {
    await interaction.reply({
      content: `${E.cancel} La partita è già stata conclusa.`,
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
    const winEmbed = buildWinEmbed(
      interaction.user.id,
      award.effectiveExp,
      award.nextTotal,
      award.details,
      await resolveWinEmbedImageUrl(winCfg, interaction.user.id),
    );
    const mainChannel = await getChannelCached(client, cfg.channelId);
    if (mainChannel) {
      await sendMinigameMessage(
        mainChannel,
        mergeStarWarsQuizRewardIntoMessage(
          mergeHalloweenCandyDropIntoMessage({ embeds: [winEmbed] }, award, interaction.user.id),
          award,
          interaction.user.id,
        ),
        {
          type: game.type,
          kind: "win",
          vars: minigameDraftVars(mainChannel, {
            user: `<@${interaction.user.id}>`,
            exp: award.effectiveExp,
            total: award.nextTotal,
            streak: award.details?.newStreak ?? (award as any).newStreak ?? 1,
          }),
          mentionUserId: interaction.user.id,
        },
      ).catch(() => { });
    }
    await interaction.reply({
      content: `${E.VC_Events} Hai vinto! Congratulazioni!`,
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
        .reply({ content: `${E.cancel} Anteprima non disponibile.`, flags: 1 << 6 })
        .catch(() => { });
      return true;
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
    if (!game.previewUrl) {
      await interaction
        .editReply({ content: `${E.cancel} Anteprima non disponibile.` })
        .catch(() => { });
      return true;
    }

    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction
        .editReply({
          content: `${E.cancel} Non riesco ad allegare il file, ascoltala qui:
${game.previewUrl}`,
        })
        .catch(() => { });
      return true;
    }

    await interaction
      .editReply({
        files: [new AttachmentBuilder(audio, { name: "anteprima.m4a" })],
      })
      .catch(() => { });
    return true;
  }

  if (String(interaction.customId || "").startsWith("minigame_trickortreat:")) {
    try {
      await interaction
        .reply({
          content: `${E.cancel} Trick or Treat è terminato.`,
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    } catch (err) {
      warnMinigame(err);
      await interaction
        .reply({
          content: `${E.cancel} Round Trick or Treat non attivo.`,
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
          content: `${E.cancel} La partita è già stata conclusa o non è più attiva.`,
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
          content: `${E.cancel} Questo pulsante non è più valido per questa partita.`,
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }

  if (cfg.starWarsEventLive) {
    try {
      const {
        isStarWarsSortedParticipant,
        UNSORTED_MG_MSG,
      } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService");
      const ok = await isStarWarsSortedParticipant(interaction.client, interaction.guildId, interaction.user?.id);
      if (!ok) {
        await interaction.reply({ content: UNSORTED_MG_MSG, flags: 1 << 6 }).catch(() => null);
        return true;
      }
    } catch (_) {}
  }

  const winCfg =
    liveMapKey && liveMapKey !== String(cfg.channelId || "")
      ? { ...cfg, channelId: liveMapKey }
      : cfg;
  await handleMinigameButtonWin(interaction, liveGame, winCfg);
  return true;
}

async function isMinigameFloodExemptChannel(message?) {
  const { isStaleOrInvalidActiveGame } = require("./minigameHandlers") as typeof import("./minigameHandlers");
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

export = {
  handleMinigameReaction,
  handleMinigameButton,
  isMinigameFloodExemptChannel,
  handleMinigameVoiceState,
};
