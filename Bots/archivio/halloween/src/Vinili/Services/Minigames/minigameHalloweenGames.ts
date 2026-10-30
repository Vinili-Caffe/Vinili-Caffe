const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

/** Halloween: quiz, trova il fantasma, emoji mancante e conta i pipistrelli. */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { getHalloweenQuizBank, buildHalloweenMissingEmojiRound, buildHalloweenCountBatsRound } = require("../../Utils/Minigames/halloweenMinigameHooks") as typeof import("../../Utils/Minigames/halloweenMinigameHooks");
const { buildHalloweenFindGhostFoundEmbed } = require("../../Utils/Minigames/halloweenFindGhostUi") as typeof import("../../Utils/Minigames/halloweenFindGhostUi");
const { formatItalianMinutesBold } = require(__eventCoreVinili("Utils/Text/italianDurationLabels"));
const { polishItalianQuestionText, buildPromptImageAttachment } = require(__eventCoreVinili("Services/Minigames/minigameImages"));
const { MINIGAME_EMBED_COLOR, buildItalianGkEmbed, buildFindBotEmbed, buildTimeoutFindBotEmbed } = require(__eventCoreVinili("Services/Minigames/minigameEmbeds"));
const { buildAliases } = require(__eventCoreVinili("Services/Minigames/minigameSources"));
const { getChannelCached } = require(__eventCoreVinili("Services/Minigames/minigameUtils"));
const { normalizeRewardExp, buildRevealHint } = require(__eventCoreVinili("Services/Minigames/minigameText"));
const { activeGames, pickQuestionAvoidRecent } = require(__eventCoreVinili("Services/Minigames/minigameState"));
const { sendMinigameRolePing } = require(__eventCoreVinili("Services/Minigames/minigameRolePing"));
const { sendMinigameMessage } = require(__eventCoreVinili("Services/Minigames/minigameDiscord"));
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, scheduleMinuteHint, scheduleGenericHint } = require(__eventCoreVinili("Services/Minigames/minigameRound"));
const { scheduleFindMinigameTimeout, pickRandomFindBotChannel } = require(__eventCoreVinili("Services/Minigames/minigameFindBot"));

async function startHalloweenQuizGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getHalloweenQuizBank();
  const localPick = pickQuestionAvoidRecent(channelId, "halloweenQuiz", bank, (q?) => q?.question, 20);
  if (!localPick?.question || !Array.isArray(localPick?.answers)) return false;
  const questionRow = {
    question: polishItalianQuestionText(String(localPick.question)),
    answers: buildAliases(localPick.answers),
  };
  if (!questionRow.answers.length) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenQuiz?.rewardExp ?? cfg?.italianGK?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.halloweenQuiz?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Quiz Halloween", [questionRow.question], "halloween_quiz", "", client);
  const embed = buildItalianGkEmbed(questionRow.question, rewardExp, durationMs).setTitle("Quiz Halloween 🎃");
  if (attachment) embed.setImage(`attachment://${attachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const displayAnswer = String(localPick.answers[0] || questionRow.answers[0] || "sconosciuta");
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Risposta: ${buildRevealHint(displayAnswer)}`);
  activeGames.set(channelId, {
    type: "halloweenQuiz",
    question: questionRow.question,
    answers: questionRow.answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenQuiz",
    target: JSON.stringify({ question: questionRow.question, answers: questionRow.answers, displayAnswer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startHalloweenFindGhostGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const durationMs = Math.max(60000, Number(cfg?.halloweenFindGhost?.durationMs || cfg?.findBot?.durationMs || 300000));
  const rewardExp = normalizeRewardExp(cfg?.halloweenFindGhost?.rewardExp ?? cfg?.findBot?.rewardExp ?? 200);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBot?.excludedChannelIds || null;
  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;
  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  if (!targetChannel) return false;
  await sendMinigameRolePing(mainChannel, cfg, cfg.roleId);
  const findBotAttachment = buildPromptImageAttachment("Trova il fantasma", ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"], "halloween_find_ghost", "", client);
  const findBotEmbed = buildFindBotEmbed(rewardExp, durationMs)
    .setTitle("Trova il fantasma 👻")
    .setDescription(
      [
        `<:VC_Halloween:1558964785113206824> Un fantasma si è nascosto in un canale del server!`,
        `<:VC_EXP:1482534670896730143> Chi lo trova vince **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(Math.max(1, Math.round(durationMs / 60000)))} per cercarlo.`,
      ].join("\n"),
    );
  if (findBotAttachment) findBotEmbed.setImage(`attachment://${findBotAttachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, { embeds: [findBotEmbed], files: findBotAttachment ? [findBotAttachment] : [] }).catch(() => null);
  const customId = `minigame_findghost:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji("<:VC_Halloween:1558964785113206824>")
      .setLabel("Ho trovato il fantasma!")
      .setStyle(ButtonStyle.Primary),
  );
  const gameMessage = await sendMinigameMessage(targetChannel, {
    embeds: [buildHalloweenFindGhostFoundEmbed(rewardExp, durationMs)],
    components: [row],
  }).catch(() => null);
  if (!gameMessage) return false;
  const timeout = scheduleFindMinigameTimeout(client, cfg, channelId, mainChannel, customId, durationMs, () =>
    buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻"),
  );
  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId);
  activeGames.set(channelId, {
    type: "halloweenFindGhost",
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenFindGhost",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });
  markSent(channelId);
  return true;
}

async function startHalloweenMissingEmojiGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const pick = buildHalloweenMissingEmojiRound();
  if (!pick?.missing) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenMissingEmoji?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.halloweenMissingEmoji?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const choices = Array.isArray(pick.choices) && pick.choices.length ? pick.choices : [pick.missing];
  const choicesLine = choices.map((e?, i?) => `**${i + 1}.** ${e}`).join("   ");
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Quale emoji manca? 🎃")
    .setDescription(
      [
        `<:VC_Halloween:1558964785113206824> Sequenza: **${pick.display}**`,
        "",
        `Scegli tra queste (scrivi l'emoji):`,
        choicesLine,
        "",
        `Chi indovina vince **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
      ].join("\n"),
    );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  activeGames.set(channelId, {
    type: "halloweenMissingEmoji",
    display: pick.display,
    missing: pick.missing,
    choices,
    answers: pick.answers,
    displayAnswer: pick.missing,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenMissingEmoji",
    target: JSON.stringify({ display: pick.display, missing: pick.missing, answers: pick.answers, choices }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startHalloweenCountBatsGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const pick = buildHalloweenCountBatsRound();
  if (!pick || !Number.isFinite(pick.count)) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenCountBats?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.halloweenCountBats?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Conta i pipistrelli 🦇")
    .setDescription(
      [
        `${pick.display}`,
        `Quanti 🦇 ci sono? Scrivi il numero per vincere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
      ].join("\n"),
    );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  activeGames.set(channelId, {
    type: "halloweenCountBats",
    display: pick.display,
    count: pick.count,
    answers: pick.answers,
    displayAnswer: String(pick.count),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenCountBats",
    target: JSON.stringify({ display: pick.display, count: pick.count, answers: pick.answers }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

export = { startHalloweenQuizGame, startHalloweenFindGhostGame, startHalloweenMissingEmojiGame, startHalloweenCountBatsGame };
