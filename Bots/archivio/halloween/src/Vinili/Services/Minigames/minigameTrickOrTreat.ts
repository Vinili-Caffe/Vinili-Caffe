const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

/** Halloween – dolcetto o scherzetto: slot a parte, bottone, timer e ripristino dopo un riavvio. */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { minigameStateFindOneLean, minigameStateDeleteOne } = require(__eventCoreVinili("Utils/BotState/domainStatesStore"));
const { ActivityUserProfile } = require(__eventCoreVinili("Schemas/Community/communitySchemas"));
const { addExpWithLevel, shouldIgnoreExpForMember, incrementMinigameWinCounters } = require(__eventCoreVinili("Services/Community/expService"));
const IDs = require(__eventCoreVinili("Utils/Config/ids"));
const { getGuildMemberCached } = require(__path.join(__path.resolve(__dirname, "../../../../../../src/shared/discord/interactionEntityCache")));
const { isWithinHalloweenCandyHours } = require("../../Utils/Minigames/halloweenMinigameHooks") as typeof import("../../Utils/Minigames/halloweenMinigameHooks");
const { addHalloweenCandyWithPassAlong, buildHalloweenCandyUnlockPayload, resolveEventKey: resolveHalloweenCandyEventKey } = require("../Community/halloweenCandyService") as typeof import("../Community/halloweenCandyService");
const { buildTrickOrTreatRoundEmbed, buildTrickOrTreatEndedEmbed, buildTrickReplyEmbed, buildAlreadyKnockedEmbed, buildTrickOrTreatJumpUrl, buildTrickOrTreatHintMessage } = require("../../Utils/Minigames/halloweenTrickOrTreatUi") as typeof import("../../Utils/Minigames/halloweenTrickOrTreatUi");
const { warnMinigame, logMinigameDebug } = require(__eventCoreVinili("Minigames/services/minigameLog"));
const { getChannelCached } = require(__eventCoreVinili("Minigames/services/minigameUtils"));
const { normalizeRewardExp } = require(__eventCoreVinili("Minigames/services/minigameText"));
const { nextGameHook, activeGames, clearMinigameRoundTimers } = require(__eventCoreVinili("Minigames/services/minigameState"));
const { sendMinigameRolePing } = require(__eventCoreVinili("Minigames/services/minigameRolePing"));
const { sendMinigameMessage } = require(__eventCoreVinili("Minigames/services/minigameDiscord"));
const { markSent, TOT_STATE_SUFFIX, saveActiveGame, parseStateTarget } = require(__eventCoreVinili("Minigames/services/minigameRound"));

/** ToT ≠ slot minigioco: chiave RAM + doc Mongo dedicati, così Impiccato/ecc. non li sovrascrivono. */
const TOT_MAP_SUFFIX = "::halloweenTrickOrTreat";

function trickOrTreatMapKey(channelId?) {
  return `${String(channelId || "").trim()}${TOT_MAP_SUFFIX}`;
}

function trickOrTreatStateChannelId(channelId?) {
  return `${String(channelId || "").trim()}${TOT_STATE_SUFFIX}`;
}

function isTrickOrTreatMapKey(key?) {
  return String(key || "").endsWith(TOT_MAP_SUFFIX);
}

function getTrickOrTreatGame(channelId?) {
  const ch = String(channelId || "").trim();
  if (!ch) return null;
  const side = activeGames.get(trickOrTreatMapKey(ch));
  if (side?.type === "halloweenTrickOrTreat") return side;
  const legacy = activeGames.get(ch);
  if (legacy?.type === "halloweenTrickOrTreat") return legacy;
  return null;
}

async function saveTrickOrTreatGame(client?, cfg?, payload?) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return;
  await saveActiveGame(client, { ...cfg, channelId: trickOrTreatStateChannelId(channelId) }, payload);
}

async function clearTrickOrTreatGame(client?, cfg?, gameHint = null) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return;
  const mapKey = trickOrTreatMapKey(channelId);
  const game = gameHint || activeGames.get(mapKey) || null;
  clearMinigameRoundTimers(game);
  activeGames.delete(mapKey);
  const legacy = activeGames.get(channelId);
  if (legacy?.type === "halloweenTrickOrTreat") {
    clearMinigameRoundTimers(legacy);
    activeGames.delete(channelId);
  }
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (!guildId) return;
  await minigameStateDeleteOne({ guildId, channelId: trickOrTreatStateChannelId(channelId) }).catch(() => {});
  // Migrazione legacy: ToT era sullo stesso doc del minigioco normale
  const main = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (main?.type === "halloweenTrickOrTreat") {
    await minigameStateDeleteOne({ guildId, channelId }).catch(() => {});
  }
}

function buildTrickOrTreatGameFromCustomId(wantId?, cfg?, messageId = null, messageCreatedTs = null) {
  const rawTs = String(wantId || "").split(":")[1] || "";
  let startedAt = Number(rawTs);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    startedAt = Number(messageCreatedTs) || 0;
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  const durationMs = Math.max(60_000, Number(cfg?.halloweenTrickOrTreat?.durationMs || 900_000));
  let endsAt = startedAt + durationMs;
  const ageMs = Date.now() - startedAt;
  // Troppo vecchio: messaggio orfano abbandonato
  if (ageMs > durationMs + 45 * 60_000) return null;
  // bug: qui un round già finito veniva riaperto per altri 10 minuti (e con la lista di chi aveva bussato vuota),
  // quindi si giocava a porta chiusa. Si recupera solo un round ancora dentro il suo tempo.
  if (endsAt <= Date.now()) return null;
  return {
    type: "halloweenTrickOrTreat",
    rewardExp: normalizeRewardExp(cfg?.halloweenTrickOrTreat?.rewardExp ?? 100),
    treatChancePercent: Math.max(0, Math.min(100, Number(cfg?.halloweenTrickOrTreat?.treatChancePercent ?? 80))),
    candyOnTreat: Math.max(0, Math.floor(Number(cfg?.halloweenTrickOrTreat?.candyOnTreat ?? 1))),
    claimedBy: {},
    customId: String(wantId),
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: true,
    gameMessageId: messageId || null,
    multiClaim: true,
    recovered: true,
  };
}

/** Fine round: via il bottone dal messaggio del round, così nessuno può più bussare a porta chiusa. */
async function removeTrickOrTreatButton(channel?, game?) {
  const msgId = String(game?.gameMessageId || "").trim();
  if (!msgId || typeof channel?.messages?.fetch !== "function") return;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (msg?.editable && msg.components?.length) await msg.edit({ components: [] }).catch(() => null);
}

function scheduleTrickOrTreatRoundTimers(client?, cfg?, channel?, game?) {
  const channelId = String(cfg?.channelId || channel?.id || "").trim();
  if (!channelId || !game || game.type !== "halloweenTrickOrTreat") return game;
  const mapKey = trickOrTreatMapKey(channelId);
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  const remainingMs = Math.max(0, Number(game.endsAt || 0) - Date.now());
  clearMinigameRoundTimers(game);
  if (remainingMs <= 0) return game;
  const timeout = setTimeout(async () => {
    const live = activeGames.get(mapKey);
    if (!live || live.type !== "halloweenTrickOrTreat" || live.customId !== game.customId) return;
    clearMinigameRoundTimers(live);
    activeGames.delete(mapKey);
    await clearTrickOrTreatGame(client, { ...cfg, channelId, guildId }, live).catch(() => {});
    const claimed = Object.keys(live.claimedBy || {}).length;
    if (channel) await removeTrickOrTreatButton(channel, live);
    if (channel) {
      await sendMinigameMessage(channel, {
        embeds: [buildTrickOrTreatEndedEmbed(claimed)],
      }).catch(() => {});
    }
    setTimeout(() => {
      void nextGameHook.start?.(client)?.catch((err?) => warnMinigame(err));
    }, 1500).unref?.();
  }, remainingMs);
  timeout.unref?.();
  game.timeout = timeout;
  return game;
}

async function mountRestoredTrickOrTreat(client?, cfg?, channel?, state?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  if (!channelId || !state || state.type !== "halloweenTrickOrTreat") return null;
  const mapKey = trickOrTreatMapKey(channelId);
  const parsed = parseStateTarget(state.target);
  const customId = state.customId || parsed?.customId || `minigame_trickortreat:restored:${Date.now()}`;
  const existing = activeGames.get(mapKey);
  if (existing?.type === "halloweenTrickOrTreat" && String(existing.customId || "") === String(customId)) {
    return existing;
  }
  const endsAt = new Date(state.endsAt).getTime();
  if (!Number.isFinite(endsAt) || endsAt <= Date.now()) {
    await clearTrickOrTreatGame(client, { ...cfg, channelId, guildId });
    return null;
  }
  const startedAt = new Date(state.startedAt).getTime();
  const game = {
    type: "halloweenTrickOrTreat",
    rewardExp: Number(state.rewardExp || 0),
    treatChancePercent: Number(parsed?.treatChancePercent ?? 80),
    candyOnTreat: Number(parsed?.candyOnTreat ?? 1),
    claimedBy: parsed?.claimedBy && typeof parsed.claimedBy === "object" ? { ...parsed.claimedBy } : {},
    customId,
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: true,
    gameMessageId: state.gameMessageId || null,
    multiClaim: true,
  };
  scheduleTrickOrTreatRoundTimers(client, { ...cfg, channelId, guildId }, channel, game);
  activeGames.set(mapKey, game);
  if (activeGames.get(channelId)?.type === "halloweenTrickOrTreat") {
    activeGames.delete(channelId);
  }
  await saveTrickOrTreatGame(client, { ...cfg, channelId, guildId }, {
    type: "halloweenTrickOrTreat",
    target: JSON.stringify({
      treatChancePercent: game.treatChancePercent,
      candyOnTreat: game.candyOnTreat,
      claimedBy: game.claimedBy,
      customId,
    }),
    rewardExp: game.rewardExp,
    startedAt: new Date(startedAt),
    endsAt: new Date(endsAt),
    gameMessageId: game.gameMessageId,
    customId,
  });
  if (guildId) {
    const main = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
    if (main?.type === "halloweenTrickOrTreat") {
      await minigameStateDeleteOne({ guildId, channelId }).catch(() => {});
    }
  }
  return game;
}

async function restoreTrickOrTreatSideSlot(client?, cfg?, channel?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(cfg?.guildId || "").trim();
  if (!channelId || !guildId || !channel) return;
  if (getTrickOrTreatGame(channelId)) return;
  const state = await minigameStateFindOneLean({
    guildId,
    channelId: trickOrTreatStateChannelId(channelId),
  }).catch(() => null);
  if (!state || state.type !== "halloweenTrickOrTreat") return;
  await mountRestoredTrickOrTreat(client, { ...cfg, channelId, guildId }, channel, state);
}

async function startHalloweenTrickOrTreatGame(client?, cfg?, options: Record<string, any> = {}) {
  const channelId = String(cfg?.channelId || "").trim();
  const mapKey = trickOrTreatMapKey(channelId);
  // Solo un ToT per canale; Impiccato/altri minigiochi possono restare attivi in parallelo.
  if (!channelId || activeGames.has(mapKey) || getTrickOrTreatGame(channelId)) return false;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  const guildId = String(cfg.guildId || channel.guild?.id || "").trim();
  const skipAlternate = Boolean(options.skipAlternate);
  if (!options.skipHourGate && !isWithinHalloweenCandyHours(Date.now())) {
    logMinigameDebug("skip: trick-or-treat outside candy hours 08-24", { channelId });
    return false;
  }

  // Alternanza con caccia emoji: se tocca hunt, spawn hunt al posto del TOT
  if (!skipAlternate && guildId) {
    try {
      const {
        peekNextCandyKind,
        KIND_HUNT,
      } = require("../../Utils/Minigames/halloweenCandyAlternate") as typeof import("../../Utils/Minigames/halloweenCandyAlternate");
      const next = await peekNextCandyKind(guildId);
      if (next === KIND_HUNT) {
        const hunt = require("../Community/halloweenEmojiHuntService") as typeof import("../Community/halloweenEmojiHuntService");
        const huntCfg = hunt.getHalloweenEmojiHuntConfig(client);
        const result = await hunt.spawnHunt(
          client,
          huntCfg,
          guildId,
          `tot-slot:${Date.now()}`,
          channelId,
          { skipAlternate: true },
        );
        return Boolean(result?.ok);
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  const rewardExp = normalizeRewardExp(cfg?.halloweenTrickOrTreat?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.halloweenTrickOrTreat?.durationMs || 900000));
  const treatChancePercent = Math.max(0, Math.min(100, Number(cfg?.halloweenTrickOrTreat?.treatChancePercent ?? 80)));
  const candyOnTreat = Math.max(0, Math.floor(Number(cfg?.halloweenTrickOrTreat?.candyOnTreat ?? 1)));
  await sendMinigameRolePing(channel, { ...cfg, guildId: guildId || cfg.guildId });
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const customId = `minigame_trickortreat:${Date.now()}`;
  const embed = buildTrickOrTreatRoundEmbed({ minutes });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji("<:VC_Halloween:1558964785113206824>")
      .setLabel("Trick or Treat!")
      .setStyle(ButtonStyle.Success),
  );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], components: [row] }).catch(() => null);
  if (!gameMessage) return false;
  const startedAt = Date.now();
  const endsAt = startedAt + durationMs;
  const game = {
    type: "halloweenTrickOrTreat",
    rewardExp,
    treatChancePercent,
    candyOnTreat,
    claimedBy: {},
    customId,
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: false,
    gameMessageId: gameMessage.id,
    multiClaim: true,
  };
  scheduleTrickOrTreatRoundTimers(client, { ...cfg, guildId: guildId || cfg.guildId, channelId }, channel, game);
  const midDelay = Math.max(5_000, Math.floor(durationMs / 2));
  const hintTimeout = setTimeout(async () => {
    const live = activeGames.get(mapKey);
    if (!live || live.type !== "halloweenTrickOrTreat" || live.hintSent) return;
    live.hintSent = true;
    const remainingMs = Math.max(0, Number(live.endsAt || 0) - Date.now());
    const claimed = Object.keys(live.claimedBy || {}).length;
    const roleId = String(cfg?.roleId || IDs.roles?.Minigames || "").trim();
    const jumpUrl = buildTrickOrTreatJumpUrl(guildId, channelId, live.gameMessageId || gameMessage.id);
    const hint = buildTrickOrTreatHintMessage({ remainingMs, claimedCount: claimed, jumpUrl });
    await channel
      .send({
        content: roleId ? `<@&${roleId}>` : undefined,
        ...hint,
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      })
      .catch(() => {});
  }, midDelay);
  hintTimeout.unref?.();
  game.hintTimeout = hintTimeout;
  activeGames.set(mapKey, game);
  // Pulisci eventuale ToT legacy sullo slot minigioco (non toccare hangman/altro).
  const legacy = activeGames.get(channelId);
  if (legacy?.type === "halloweenTrickOrTreat") activeGames.delete(channelId);
  await saveTrickOrTreatGame(client, { ...cfg, guildId: guildId || cfg.guildId, channelId }, {
    type: "halloweenTrickOrTreat",
    target: JSON.stringify({ treatChancePercent, candyOnTreat, claimedBy: {}, customId }),
    rewardExp,
    startedAt: new Date(startedAt),
    endsAt: new Date(endsAt),
    gameMessageId: gameMessage.id,
    customId,
  });
  if (guildId) {
    try {
      const { commitCandyKind, KIND_TOT } = require("../../Utils/Minigames/halloweenCandyAlternate") as typeof import("../../Utils/Minigames/halloweenCandyAlternate");
      await commitCandyKind(guildId, KIND_TOT);
    } catch (_) {}
  }
  // Dal loop caramelle: non resettare il cooldown minigames (ToT ≠ slot minigioco).
  if (!options.skipMarkSent) markSent(channelId);
  return true;
}

/** Usato dalla caccia emoji quando l’alternanza riserva un round TOT. */
async function startHalloweenTrickOrTreatGameForAlternate(client?, cfg?) {
  return startHalloweenTrickOrTreatGame(client, cfg, { skipAlternate: true, skipMarkSent: true });
}

async function handleHalloweenTrickOrTreatButton(interaction?, game?, cfg?) {
  const userId = String(interaction.user?.id || "");
  if (!userId) return true;
  // round finito (es. timer perso con un riavvio): la porta è chiusa, niente caramelle, e via il bottone
  if (Number(game.endsAt || 0) > 0 && Number(game.endsAt) <= Date.now()) {
    await interaction
      .reply({ content: "🎃 La porta è chiusa: questo round di Trick or Treat è finito. Aspetta il prossimo toc toc!", flags: 1 << 6 })
      .catch(() => {});
    await removeTrickOrTreatButton(interaction.channel, game);
    return true;
  }
  if (!game.claimedBy || typeof game.claimedBy !== "object") game.claimedBy = {};
  if (game.claimedBy[userId]) {
    await interaction
      .reply({ embeds: [buildAlreadyKnockedEmbed()], flags: 1 << 6 })
      .catch(() => {});
    return true;
  }
  game.claimedBy[userId] = true;
  // Persisti claimedBy sul doc ToT dedicato (non sovrascrivere Impiccato/slot minigioco)
  try {
    const chId = String(interaction.channelId || cfg?.channelId || "").trim();
    if (chId) {
      await saveTrickOrTreatGame(interaction.client, { ...cfg, channelId: chId, guildId: interaction.guildId || cfg?.guildId }, {
        type: "halloweenTrickOrTreat",
        target: JSON.stringify({
          treatChancePercent: game.treatChancePercent,
          candyOnTreat: game.candyOnTreat,
          claimedBy: game.claimedBy,
          customId: game.customId,
        }),
        rewardExp: game.rewardExp,
        startedAt: new Date(game.startedAt || Date.now()),
        endsAt: new Date(game.endsAt || Date.now()),
        gameMessageId: game.gameMessageId || null,
        customId: game.customId,
      });
    }
  } catch (_) {}
  const roll = Math.random() * 100;
  const treat = roll < Number(game.treatChancePercent ?? 80);
  if (!treat) {
    await interaction
      .reply({ embeds: [buildTrickReplyEmbed()], flags: 1 << 6 })
      .catch(() => {});
    return true;
  }
  let candyUnlock = null;
  let candyCompleteLine = "";
  let passAlongPublic = null;
  const candyAmt = Math.max(0, Math.floor(Number(game.candyOnTreat ?? 1)));
  let candyResult = null;
  if (candyAmt > 0) {
    candyResult = await addHalloweenCandyWithPassAlong({
      guildId: interaction.guild.id,
      userId,
      amount: candyAmt,
      eventKey: resolveHalloweenCandyEventKey(interaction.client),
      reason: "trick_or_treat",
      source: "halloweenTrickOrTreat",
      client: interaction.client,
    });
    if (candyResult?.code === "passed_along" && candyResult?.passedToUserId) {
      candyCompleteLine = `🎃 Sacchetto pieno — la caramella vola a <@${candyResult.passedToUserId}>!`;
      candyUnlock = buildHalloweenCandyUnlockPayload({
        candyResult,
        userId: candyResult.passedToUserId,
        expGained: 0,
      });
      passAlongPublic = {
        content: `🍬 <@${userId}> ha il sacchetto pieno — la caramella passa a <@${candyResult.passedToUserId}>!`,
        embeds: candyUnlock?.embeds,
        components: candyUnlock?.components,
        allowedMentions: { users: [userId, candyResult.passedToUserId] },
      };
    } else if (candyResult?.code === "collection_complete") {
      candyCompleteLine = `🎃 Sacchetto pieno — collezione **${candyResult.ownedCount}/${candyResult.total}**!`;
    }
  }
  const baseExp = normalizeRewardExp(game.rewardExp || 0);
  let effectiveExp = baseExp;
  try {
    const doc = await ActivityUserProfile.findOne({ guildId: interaction.guild.id, userId })
      .select("profile.totals.exp.minigame")
      .lean()
      .catch(() => null);
    const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
    const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
    const newStreak = prevStreak + 1;
    const bestStreak = Math.max(prevBest, newStreak);
    await incrementMinigameWinCounters(interaction.guild.id, userId, baseExp, newStreak, bestStreak);
    const member = await getGuildMemberCached(interaction.guild, userId, { ttlMs: 20_000 }).catch(() => null);
    const ignoreExp = await shouldIgnoreExpForMember({
      guildId: interaction.guild.id,
      member,
      channelId: cfg?.channelId || interaction.channelId || null,
    });
    if (!ignoreExp && baseExp > 0) {
      await addExpWithLevel(interaction.guild, userId, baseExp, false, true);
    }
    effectiveExp = baseExp;
  } catch (err) {
    warnMinigame(err);
  }
  if (candyResult?.ok && candyResult?.code !== "passed_along") {
    candyUnlock = buildHalloweenCandyUnlockPayload({
      candyResult,
      userId,
      expGained: effectiveExp,
    });
  }
  const replyPayload: Record<string, any> = { flags: 1 << 6 };
  if (candyResult?.code === "passed_along") {
    replyPayload.embeds = [
      new EmbedBuilder()
        .setColor(0xff7a18)
        .setTitle("Dolcetto!")
        .setDescription(
          [
            candyCompleteLine,
            effectiveExp > 0 ? `✨ +**${effectiveExp}** exp` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
    ];
  } else if (candyUnlock) {
    replyPayload.embeds = candyUnlock.embeds;
    replyPayload.components = candyUnlock.components;
  } else {
    replyPayload.embeds = [
      new EmbedBuilder()
        .setColor(0xff7a18)
        .setTitle("Dolcetto!")
        .setDescription(
          [
            candyCompleteLine || "🍬 La porta si apre… e trovi un premio!",
            effectiveExp > 0 ? `✨ +**${effectiveExp}** exp` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
    ];
  }
  await interaction.reply(replyPayload).catch(() => {});
  if (passAlongPublic) {
    await interaction.channel?.send?.(passAlongPublic).catch(() => {});
  }
  return true;
}

export = { TOT_MAP_SUFFIX, trickOrTreatMapKey, trickOrTreatStateChannelId, isTrickOrTreatMapKey, getTrickOrTreatGame, saveTrickOrTreatGame, clearTrickOrTreatGame, buildTrickOrTreatGameFromCustomId, removeTrickOrTreatButton, scheduleTrickOrTreatRoundTimers, mountRestoredTrickOrTreat, restoreTrickOrTreatSideSlot, startHalloweenTrickOrTreatGame, startHalloweenTrickOrTreatGameForAlternate, handleHalloweenTrickOrTreatButton };
