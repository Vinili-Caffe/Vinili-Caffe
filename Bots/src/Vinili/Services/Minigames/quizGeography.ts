/** Minigiochi quiz: capitali, capoluoghi e città. */
const { getGuessCityBank } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { normalizeCountryName, fetchWikiRegionImage, buildPromptImageAttachment, buildRegionNameImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildGuessCapitalEmbed, buildGuessRegionCapitalEmbed, buildGuessReverseCapitalEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildGuessCityEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { loadCapitalQuestionBank, loadReverseCapitalQuestionBank, loadRegionCapitalQuestionBank } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, normalizeRewardExp, buildRevealHint, buildCapitalHint, buildRegionCapitalHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");

async function startGuessCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessCapital", questions, (row?) => row?.country, 28,);
  if (!pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCapital?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const capitalAttachment = !pick.image ? buildPromptImageAttachment("Indovina la capitale", [pick.country], "guess_capital", "", client) : null;
  const capitalEmbed = buildGuessCapitalEmbed(pick.country, rewardExp, durationMs, pick.image || (capitalAttachment ? `attachment://${capitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [capitalEmbed], files: capitalAttachment ? [capitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutCapitalEmbed(game.country, game.displayAnswer)); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuta");
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessCapital",
    country: pick.country,
    answers: pick.answers,
    image: pick.image || null,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessCapital",
    target: JSON.stringify({
      country: pick.country,
      answers: pick.answers,
      image: pick.image || null,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessRegionCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadRegionCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessRegionCapital", questions, (row?) => row?.region, 20,);
  if (!pick?.region || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessRegionCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessRegionCapital?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const image = await fetchWikiRegionImage(pick.region);
  const regionNameAttachment = !image ? (buildRegionNameImageAttachment(pick.region) || buildPromptImageAttachment("Indovina il capoluogo", [pick.region], "guess_region_capital", "", client)) : null;
  const regionImageUrl = image || (regionNameAttachment ? `attachment://${regionNameAttachment.name}` : null);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessRegionCapitalEmbed(pick.region, rewardExp, durationMs, regionImageUrl, regionNameAttachment?.name || null,),], files: regionNameAttachment ? [regionNameAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuto");
  const regionHint = buildRegionCapitalHint(pick.region);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessRegionCapital",
    region: pick.region,
    answers: pick.answers,
    image,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessRegionCapital",
    target: JSON.stringify({
      region: pick.region,
      answers: pick.answers,
      image,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessReverseCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadReverseCapitalQuestionBank(cfg);
  if (!questions.length) return false;
  const pick = pickQuestionAvoidRecent(channelId, "guessReverseCapital", questions, (row?) => `${row?.capital ?? ""}\t${row?.country ?? ""}`, 28,);
  if (!pick?.capital || !pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessReverseCapital?.rewardExp ?? cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessReverseCapital?.durationMs ?? cfg?.guessCapital?.durationMs ?? 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const reverseCapitalAttachment = !pick.image ? buildPromptImageAttachment("Capitale inverso", [pick.capital], "guess_reverse_capital", "", client) : null;
  const reverseCapitalEmbed = buildGuessReverseCapitalEmbed(pick.capital, rewardExp, durationMs, pick.image || (reverseCapitalAttachment ? `attachment://${reverseCapitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [reverseCapitalEmbed], files: reverseCapitalAttachment ? [reverseCapitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.country);
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessReverseCapital",
    capital: pick.capital,
    country: pick.country,
    answers: pick.answers,
    displayAnswer,
    image: pick.image || null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessReverseCapital",
    target: JSON.stringify({
      capital: pick.capital,
      country: pick.country,
      answers: pick.answers,
      displayAnswer,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessCityGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessCityBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessCity", bank, (r?) => r.landmark, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessCity?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCity?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Indovina la città", [pick.landmark, pick.country ? `Paese: ${pick.country}` : ""].filter(Boolean), "guess_city", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessCityEmbed(pick.landmark, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Città: ${buildRevealHint(pick.city)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const cityNorm = normalizeCountryName(pick.city);
  const answers = [cityNorm, pick.city, compactNoSpaces(cityNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "guessCity",
    landmark: pick.landmark,
    city: pick.city,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "guessCity",
    target: JSON.stringify({ landmark: pick.landmark, city: pick.city }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

export = { startGuessCapitalGame, startGuessRegionCapitalGame, startGuessReverseCapitalGame, startGuessCityGame };
