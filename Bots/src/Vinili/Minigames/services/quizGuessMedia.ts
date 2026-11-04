/** Minigiochi quiz: indovina bandiera, giocatore, canzone, squadra, cantante, album. */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { fetchSingerImageFallback, buildPromptImageAttachment, fetchRawImageAttachment, buildRemoteGuessImageCardAttachment, censorArtworkImage } = require("./minigameImages") as typeof import("./minigameImages");
const { buildGuessFlagEmbed, buildGuessPlayerEmbed, buildGuessSongEmbed, buildGuessTeamEmbed, buildGuessSingerEmbed, buildGuessAlbumEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { randomBetween, loadCountryList, loadFootballTeamsFromApi, loadSingersFromApi, loadAlbumsFromApi, normalizePlayerGuess, fetchPlayerFromRandomLetter, fetchFamousPlayer, fetchLeagueFamousPlayer, fetchRandomSong, fetchPopularSong } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp, buildPlayerAnswerAliases, buildPlainMaskedTextHint, buildRevealHint, buildCountryHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { translateToItalian } = require("./quizSources") as typeof import("./quizSources");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function resolveGuessPuzzleAttachment({
  imageUrl = null,
  title,
  fallbackLines = [],
  fileBaseName = "guess_image",
  client = null,
  channelId = null,
}) {
  const base = String(fileBaseName || "guess_image").replace(/[^\w.\-]+/g, "_");
  const fileName = `${base}.png`;
  if (imageUrl) {
    const card = await buildRemoteGuessImageCardAttachment(imageUrl, title, fileName);
    if (card) return card;
    const raw = await fetchRawImageAttachment(imageUrl, `${base}.jpg`);
    if (raw) return raw;
  }
  return buildPromptImageAttachment(
    title,
    fallbackLines,
    fileBaseName,
    "",
    client,
  );
}
const CENSOR_STEP_INTERVAL_MS = 60 * 1000;

function scheduleArtworkCensorSteps(params?) {
  const { channelId, channel, gameMessageId, originalArtworkUrl, durationMs, buildEmbed, rewardExp, attachmentName, gameType } = params;
  if (!channelId || !channel || !gameMessageId || !originalArtworkUrl || !buildEmbed) return [];
  const timeouts = [];
  const totalMinutes = Math.max(1, Math.floor(durationMs / CENSOR_STEP_INTERVAL_MS));
  for (let step = 1; step < totalMinutes; step++) {
    const delay = durationMs - step * CENSOR_STEP_INTERVAL_MS;
    if (delay < 8000) continue;
    const isLastStep = step === totalMinutes - 1;
    const alpha = isLastStep ? 0 : Math.max(0, 0.9 - (step * 0.9) / Math.max(1, totalMinutes - 1));
    const t = setTimeout(async () => {
      const game = activeGames.get(channelId);
      if (!game || (game.type !== "guessSong" && game.type !== "guessAlbum")) return;
      try {
        const msg = await channel.messages.fetch(gameMessageId).catch(() => null);
        if (!msg?.editable) return;
        if (alpha <= 0) {
          const embed = buildEmbed(rewardExp, durationMs, originalArtworkUrl);
          const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files: [] } : { embeds: [embed], files: [] };
          await msg.edit(payload).catch(() => {});
          return;
        }
        const censored = await censorArtworkImage(originalArtworkUrl, { attachmentName, overlayAlpha: alpha });
        if (!censored) return;
        const embed = buildEmbed(rewardExp, durationMs, `attachment://${censored.attachmentName}`);
        const files = [new AttachmentBuilder(censored.buffer, { name: censored.attachmentName })];
        const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files } : { embeds: [embed], files };
        await msg.edit(payload).catch(() => {});
      } catch (err) {
      warnMinigame(err);
    }
    }, delay);
    if (typeof t.unref === "function") t.unref();
    timeouts.push(t);
  }
  return timeouts;
}

async function startGuessFlagGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const countries = await loadCountryList(cfg);
  if (!countries.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessFlag?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessFlag?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = pickQuestionAvoidRecent(channelId, "guessFlag", countries, (c?) => c?.displayName || (Array.isArray(c?.names) ? c.names[0] : "") || "", 20) || countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);

  const flagEmbed = buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [flagEmbed] }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutFlagEmbed(game.displayName)); }, durationMs); timeout.unref?.();

  const countryHint = buildCountryHint(target);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    countryHint || `Nazione: ${buildRevealHint(target.displayName)}`,
  );

  activeGames.set(channelId, {
    type: "guessFlag",
    answers: target.names,
    displayName: target.displayName,
    hintData: target.region || target.populationLabel || target.languages ? { region: target.region, subregion: target.subregion, populationLabel: target.populationLabel, languages: target.languages } : null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessFlag",
    target: JSON.stringify({
      names: target.names,
      displayName: target.displayName,
      flagUrl: target.flagUrl,
      region: target.region,
      subregion: target.subregion,
      populationLabel: target.populationLabel,
      languages: target.languages,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessPlayerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessPlayer?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessPlayer?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const [infoFamous, infoLeague, infoLetter] = await Promise.all([
    fetchFamousPlayer(cfg),
    fetchLeagueFamousPlayer(cfg),
    fetchPlayerFromRandomLetter(cfg),
  ]);
  let info = infoFamous || infoLeague || infoLetter;
  if (!info) return false;

  if (cfg?.translateApiToItalian !== false) {
    const [name, team, nationality] = await Promise.all([translateToItalian(info.name, cfg), translateToItalian(info.team, cfg), translateToItalian(info.nationality, cfg),]);
    if (name) info = { ...info, name };
    if (team) info = { ...info, team };
    if (nationality) info = { ...info, nationality };
  }

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);
  const playerAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: info.image,
    title: "Indovina il calciatore",
    fallbackLines: [buildPlainMaskedTextHint(info.name) || "Chi è questo calciatore?"],
    fileBaseName: "guess_player",
    client,
    channelId,
  });
  const playerEmbed = buildGuessPlayerEmbed(
    rewardExp,
    durationMs,
    playerAttachment ? `attachment://${playerAttachment.name}` : null,
  );

  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [playerEmbed], ...(playerAttachment ? { files: [playerAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutPlayerEmbed(game.displayName)); }, durationMs); timeout.unref?.();

  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `${info.team} \u2022 ${info.nationality} \u2022 ${buildRevealHint(info.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessPlayer",
    answers: buildPlayerAnswerAliases(info.name, info.aliases),
    fullAnswer: normalizePlayerGuess(info.name),
    displayName: info.name,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessPlayer",
    target: JSON.stringify({
      name: info.name,
      team: info.team,
      nationality: info.nationality,
      image: info.image,
      aliases: buildPlayerAnswerAliases(info.name, info.aliases),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessSongGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessSong?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessSong?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const onlyFamous = cfg?.guessSong?.onlyFamous !== false;
  let info = await fetchPopularSong(cfg);
  if (!info && !onlyFamous) {
    info = await fetchRandomSong(cfg);
  }
  if (!info?.title || !info?.artist) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);

  const previewCustomId = `minigame_song_preview:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(previewCustomId).setLabel("Ascolta anteprima").setEmoji(E.VC_Preview).setStyle(ButtonStyle.Secondary).setDisabled(!info.previewUrl),);

  const songAttachmentName = "minigame_song.png";
  let songImageUrl = info.artwork;
  const songCensored = info.artwork ? await censorArtworkImage(info.artwork, { attachmentName: songAttachmentName, overlayAlpha: 0.98 }) : null;
  if (songCensored) {
    songImageUrl = `attachment://${songCensored.attachmentName}`;
  }
  const songFiles = songCensored ? [new AttachmentBuilder(songCensored.buffer, { name: songCensored.attachmentName })] : [];
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessSongEmbed(rewardExp, durationMs, songImageUrl)], components: [row], files: songFiles, }).catch(() => null);

  const censorRevealTimeouts = info.artwork && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: info.artwork,
        durationMs,
        buildEmbed: buildGuessSongEmbed,
        rewardExp,
        attachmentName: songAttachmentName,
        gameType: "guessSong",
      })
    : [];

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);

  const songHint = info.artistCountry || info.genre
    ? `${E.VC_Flame} Artista da **${info.artistCountry || "?"}**, genere **${info.genre || "?"}**. Il titolo: ${buildRevealHint(info.title)}`
    : `Canzone: ${buildRevealHint(info.title)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, songHint,
  );

  activeGames.set(channelId, {
    type: "guessSong",
    title: info.title,
    artist: info.artist,
    previewUrl: info.previewUrl || null,
    previewCustomId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    censorRevealTimeouts,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSong",
    target: JSON.stringify({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artwork: info.artwork,
      genre: info.genre,
      artistCountry: info.artistCountry,
      previewUrl: info.previewUrl,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
    customId: previewCustomId,
  });

  markSent(channelId);
  return true;
}

async function startGuessTeamGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const teams = await loadFootballTeamsFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessTeam", teams, (t?) => t?.team || t?.id || "", 15) || pickRandomItem(teams);
  if (!pick?.team || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessTeam?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessTeam?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const teamAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: pick.image,
    title: "Indovina la squadra",
    fallbackLines: [buildPlainMaskedTextHint(pick.team) || "Quale squadra è?"],
    fileBaseName: "guess_team",
    client,
    channelId,
  });
  const teamEmbed = buildGuessTeamEmbed(
    rewardExp,
    durationMs,
    teamAttachment ? `attachment://${teamAttachment.name}` : null,
  );
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [teamEmbed], ...(teamAttachment ? { files: [teamAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutTeamEmbed(game.team)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Squadra: ${buildRevealHint(pick.team)}`,
  );

  activeGames.set(channelId, {
    type: "guessTeam",
    team: pick.team,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessTeam",
    target: JSON.stringify({
      team: pick.team,
      answers: pick.answers,
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

async function startGuessSingerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const singers = await loadSingersFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessSinger", singers, (s?) => s?.name || "", 15) || pickRandomItem(singers);
  if (!pick?.name || !pick?.answers?.length) return false;
  const resolvedImage = pick.image || (await fetchSingerImageFallback(pick.name, cfg));

  const rewardExp = normalizeRewardExp(cfg?.guessSinger?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessSinger?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const singerAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: resolvedImage,
    title: "Indovina il cantante",
    fallbackLines: [buildPlainMaskedTextHint(pick.name) || "Chi è questo cantante?"],
    fileBaseName: "guess_singer",
    client,
    channelId,
  });
  const singerEmbed = buildGuessSingerEmbed(
    rewardExp,
    durationMs,
    singerAttachment ? `attachment://${singerAttachment.name}` : null,
  );
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [singerEmbed], ...(singerAttachment ? { files: [singerAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutSingerEmbed(game.name)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Cantante: ${buildRevealHint(pick.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessSinger",
    name: pick.name,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSinger",
    target: JSON.stringify({
      name: pick.name,
      answers: pick.answers,
      image: resolvedImage || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessAlbumGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const albums = await loadAlbumsFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessAlbum", albums, (a?) => `${a?.album || ""}|${a?.artist || ""}`, 15) || pickRandomItem(albums);
  if (!pick?.album || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessAlbum?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessAlbum?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);

  const albumAttachmentName = "minigame_album.png";
  let albumImageUrl = pick.image;
  const albumCensored = pick.image ? await censorArtworkImage(pick.image, { attachmentName: albumAttachmentName, overlayAlpha: 0.98 }) : null;
  if (albumCensored) {
    albumImageUrl = `attachment://${albumCensored.attachmentName}`;
  }
  const albumFallbackAttachment = !albumImageUrl ? buildPromptImageAttachment("Indovina l'album", [pick.album, pick.artist], "guess_album", "", client) : null;
  if (albumFallbackAttachment) albumImageUrl = `attachment://${albumFallbackAttachment.name}`;
  const albumFiles = albumCensored ? [new AttachmentBuilder(albumCensored.buffer, { name: albumCensored.attachmentName })] : (albumFallbackAttachment ? [albumFallbackAttachment] : []);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessAlbumEmbed(rewardExp, durationMs, albumImageUrl)], files: albumFiles, }).catch(() => null);

  const censorRevealTimeouts = pick.image && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: pick.image,
        durationMs,
        buildEmbed: buildGuessAlbumEmbed,
        rewardExp,
        attachmentName: albumAttachmentName,
        gameType: "guessAlbum",
      })
    : [];

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Artista: **${pick.artist}** \u2022 Album: ${buildRevealHint(pick.album)}`,
  );

  activeGames.set(channelId, {
    type: "guessAlbum",
    album: pick.album,
    artist: pick.artist,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    censorRevealTimeouts,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessAlbum",
    target: JSON.stringify({
      album: pick.album,
      artist: pick.artist,
      answers: pick.answers,
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

export = { startGuessFlagGame, startGuessPlayerGame, startGuessSongGame, startGuessTeamGame, startGuessSingerGame, startGuessAlbumGame };
