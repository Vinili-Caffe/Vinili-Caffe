/**
 * Guess the planet — immagine + hint prima/ultima lettera (stile impiccato).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const {
  getStarWarsPlanetsBank,
  maskPlanetHint,
} = require("../../Utils/Eventi/starWarsMinigameBanks") as typeof import("../../Utils/Eventi/starWarsMinigameBanks");
const { normalizeRewardExp, buildRevealHint, compactNoSpaces } = require(__eventCoreVinili("Minigames/services/minigameText"));
const { normalizeCountryName, resolveMinigamePromptAttachment } = require(__eventCoreVinili("Minigames/services/minigameImages"));
const { MINIGAME_EMBED_COLOR, buildGuessPlanetEmbed } = require(__eventCoreVinili("Minigames/services/minigameEmbeds"));
const { getChannelCached } = require(__eventCoreVinili("Minigames/services/minigameUtils"));
const { activeGames, pickQuestionAvoidRecent } = require(__eventCoreVinili("Minigames/services/minigameState"));
const { sendMinigameRolePing } = require(__eventCoreVinili("Minigames/services/minigameRolePing"));
const { sendMinigameMessage } = require(__eventCoreVinili("Minigames/services/minigameDiscord"));
const {
  markSent,
  saveActiveGame,
  scheduleMinigameRoundTimeout,
  scheduleGenericHint,
} = require(__eventCoreVinili("Minigames/services/minigameRound"));

function buildPlanetAnswers(planet?) {
  const names = [planet?.name, ...(Array.isArray(planet?.aliases) ? planet.aliases : [])]
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  const out = new Set();
  for (const n of names) {
    const norm = normalizeCountryName(n);
    if (norm) out.add(norm);
    const compact = compactNoSpaces(norm || n);
    if (compact) out.add(compact);
  }
  return [...out];
}

function buildTimeoutPlanetEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Tempo scaduto")
    .setDescription(`Nessuno ha indovinato. Il pianeta era **${String(name || "?").trim()}**.`);
}

async function startStarWarsGuessPlanetGame(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const bank = getStarWarsPlanetsBank(true);
  if (!bank.length) return false;
  const pick =
    pickQuestionAvoidRecent(channelId, "starWarsGuessPlanet", bank, (p?) => p?.id || p?.name, 20) ||
    bank[Math.floor(Math.random() * bank.length)];
  if (!pick?.name || !pick?.imageUrl) return false;

  const rewardExp = normalizeRewardExp(cfg?.starWarsGuessPlanet?.rewardExp ?? cfg?.starWarsQuiz?.rewardExp ?? 50);
  const durationMs = Math.max(
    60000,
    Number(cfg?.starWarsGuessPlanet?.durationMs || cfg?.starWarsQuiz?.durationMs || 180000),
  );
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const hint = maskPlanetHint(pick.name);
  const answers = buildPlanetAnswers(pick);
  if (!answers.length) return false;

  await sendMinigameRolePing(channel, cfg);
  const { attachment, backgroundUrl } = await resolveMinigamePromptAttachment(
    cfg,
    "Indovina il pianeta",
    [hint ? `Hint: ${hint}` : "Osserva il pianeta", "Scrivi il nome in chat"],
    "guess_planet",
    client,
    { forceStarWars: true, heroImageUrl: pick.imageUrl },
  );
  const embed = buildGuessPlanetEmbed(rewardExp, durationMs, hint);
  if (attachment) embed.setImage(`attachment://${attachment.name}`);
  else if (pick.imageUrl) embed.setImage(String(pick.imageUrl));

  const gameMessage = await sendMinigameMessage(channel, {
    embeds: [embed],
    files: attachment ? [attachment] : [],
  }).catch(() => null);

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Pianeta: ${buildRevealHint(pick.name, 0.45, false)}`,
  );

  activeGames.set(channelId, {
    type: "starWarsGuessPlanet",
    planetId: pick.id,
    planetName: pick.name,
    answer: pick.name,
    answers,
    displayAnswer: pick.name,
    hint,
    imageUrl: pick.imageUrl,
    swBackgroundUrl: backgroundUrl || null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "starWarsGuessPlanet",
    target: JSON.stringify({
      planetId: pick.id,
      planetName: pick.name,
      answers,
      hint,
      imageUrl: pick.imageUrl,
      swBackgroundUrl: backgroundUrl || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

export = {
  startStarWarsGuessPlanetGame,
  buildGuessPlanetEmbed,
  buildTimeoutPlanetEmbed,
  buildPlanetAnswers,
};
