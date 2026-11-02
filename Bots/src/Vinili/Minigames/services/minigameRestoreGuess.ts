/** Minigiochi: ripristino dei guess classici dopo un riavvio. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutSongEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutAlbumEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { normalizePlayerGuess, buildAliases } = require("./minigameSources") as typeof import("./minigameSources");
const { buildPlayerAnswerAliases, buildRevealHint, buildCountryHint, buildCapitalHint, buildRegionCapitalHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames } = require("./minigameState") as typeof import("./minigameState");
const { parseStateTarget, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");

async function restoreGuessGames(client?, cfg?, channel?, state?, remainingMs?, endsAt?) {
  if (state.type === "guessNumber") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutNumberEmbed(game.target)); }, remainingMs); timeout.unref?.();
    const game = {
      type: "guessNumber",
      target: Number(state.target),
      min: Number(state.min),
      max: Number(state.max),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    };
    activeGames.set(cfg.channelId, game);
    return true;
  }
  if (state.type === "guessWord") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutWordEmbed(game.target)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessWord",
      target: String(state.target || "").toLowerCase(),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.names) ? parsed.names : [];
    const displayName = parsed?.displayName || "la bandiera";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFlagEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const countryHint = buildCountryHint(parsed);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      countryHint || `Nazione: ${buildRevealHint(displayName)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessFlag",
      answers,
      displayName,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessPlayer") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "il calciatore";
    const team = parsed?.team || "Squadra sconosciuta";
    const nationality = parsed?.nationality || "Nazionalità sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutPlayerEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${team} \u2022 ${nationality} \u2022 ${buildRevealHint(name)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessPlayer",
      answers: buildPlayerAnswerAliases(name, parsed?.aliases),
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessSong") {
    const parsed = parseStateTarget(state.target);
    const title = parsed?.title || "la canzone";
    const artist = parsed?.artist || "";
    const artistCountry = parsed?.artistCountry || "Nazionalità sconosciuta";
    const genre = parsed?.genre || "Genere sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSongEmbed(game.title, game.artist)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${artistCountry} \u2022 ${genre} \u2022 Canzone: ${buildRevealHint(title)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessSong",
      title,
      artist,
      previewUrl: parsed?.previewUrl || null,
      previewCustomId: state.customId || null,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessCapital") {
    const parsed = parseStateTarget(state.target);
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCapitalEmbed(game.country, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessCapital",
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessReverseCapital") {
    const parsed = parseStateTarget(state.target);
    const capital = parsed?.capital || "capitale sconosciuta";
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || country || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessReverseCapital",
      capital,
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessRegionCapital") {
    const parsed = parseStateTarget(state.target);
    const region = parsed?.region || "regione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),); }, remainingMs); timeout.unref?.();
    const regionHint = buildRegionCapitalHint(region);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessRegionCapital",
      region,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "fastType") {
    const parsed = parseStateTarget(state.target);
    const phrase = parsed?.phrase || "";
    const normalizedPhrase = parsed?.normalizedPhrase || normalizeCountryName(phrase);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFastTypeEmbed(game.phrase)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "fastType",
      phrase,
      normalizedPhrase,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessTeam") {
    const parsed = parseStateTarget(state.target);
    const team = parsed?.team || "squadra sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([team]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutTeamEmbed(game.team)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessTeam",
      team,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessSinger") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "cantante sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([name]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSingerEmbed(game.name)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessSinger",
      name,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessAlbum") {
    const parsed = parseStateTarget(state.target);
    const album = parsed?.album || "album sconosciuto";
    const artist = parsed?.artist || "artista sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([album]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutAlbumEmbed(game.album, game.artist)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessAlbum",
      album,
      artist,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  return false;
}

export = { restoreGuessGames };
