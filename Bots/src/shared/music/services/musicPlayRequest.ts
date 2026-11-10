/** Musica: richiesta di riproduzione (ricerca, coda, avvio). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../discord/guildDiscordIdentity") as typeof import("../../discord/guildDiscordIdentity");
const { getMusicSearchMode, isYoutubeLikeUrl, logMusic, lavalinkErrorHint, isPlainTextMusicQuery, normalizeOpenSpotifyHttpUrl, isSpotifyPodcastOnlyInput, isOpenSpotifyMusicUrlInput } = require("./musicSearch") as typeof import("./musicSearch");
const { safeDiscordLinkLabel, resolveSpotifyWebUrl, formatTrackTitleMarkdownLink } = require("./musicSpotifyLinks") as typeof import("./musicSpotifyLinks");
const { notifyBotPresenceVoiceActivity } = require("../../discord/botPresenceActivity") as typeof import("../../discord/botPresenceActivity");
const { playWithMirrorFallbacks, resolvePlayableTracks, describeTrack, encodedFromPlayerTrack } = require("./musicMirror") as typeof import("./musicMirror");
const { nativeVoiceChannelId, musicHooks, musicPurgeTts, endListeners, guildMusicSessionBlocksOtherVoiceChannels, persistMusicQueueSnapshotNow, getShardIdForGuild, musicJoinVoiceChannelErrorMessage, clearBlockingNativeVoiceForMusic, leaveMusicVoiceChannelMarked, destroyGhostMusicStateIfBotNotInVoice } = require("./musicVoice") as typeof import("./musicVoice");
const { resolveDefaultJoinGlobalVolume, musicStartCapture, trackForManualQueue, clearSessionCurrentRequester, getSession, isLavalinkUsable, cancelPendingQueueEndedEmbed, attachEndHandler, initLavalinkMusicIfEnabled } = require("./musicEngine") as typeof import("./musicEngine");
const { formatTrackDurationMs, formatEstimatedUntilPlayMs } = require("./musicQueueView") as typeof import("./musicQueueView");
const { getNowPlayingEmbedTitle, formatNowPlayingLead } = require("./musicQueueControls") as typeof import("./musicQueueControls");

function musicIsCaptureActive(guildId?) {
  const h = musicHooks();
  if (typeof h.isVoiceCaptureActive === "function") return (h.isVoiceCaptureActive as any)(guildId);
  try {
    const { isVoiceCaptureActive } = require("../../../Vinili/Community/services/voiceContinuousCaptureService") as typeof import("../../../Vinili/Community/services/voiceContinuousCaptureService");
    return isVoiceCaptureActive(guildId);
  } catch (_) {
    return false;
  }
}

function tagTracksWithRequester(tracks?, requesterUser?) {
  const uid = requesterUser?.id ? String(requesterUser.id) : "";
  const tag = requesterUser
    ? String(requesterUser.globalName || requesterUser.username || "").trim()
    : "";
  return tracks
    .map((t?) => {
      const base: any = trackForManualQueue(t);
      if (!base) return null;
      return {
        ...base,
        vcRequestedByUserId: uid || base.vcRequestedByUserId || null,
        vcRequestedByUserTag: tag || base.vcRequestedByUserTag || null,
      };
    })
    .filter(Boolean);
}

function setSessionCurrentRequesterFromUser(session?, requesterUser?) {
  if (!session) return;
  const uid = requesterUser?.id ? String(requesterUser.id) : "";
  const tag = requesterUser
    ? String(requesterUser.globalName || requesterUser.username || "").trim()
    : "";
  session.currentRequesterUserId = uid || null;
  session.currentRequesterUserTag = tag || null;
}

function isMusicPlayingNow(player?, session?) {
  const enc = encodedFromPlayerTrack(player?.track);
  const label = String(session?.nowPlaying || "").trim();
  return Boolean(enc && label);
}

async function playMusicRequest(ctx?, query?) {
  const client = ctx.client;
  const guild = ctx.guild;
  const member = ctx.member;
  const textChannelId = ctx.textChannelId ?? null;
  const requesterUser = ctx.requesterUser ?? null;
  if (!guild || !member) {
    return { ok: false, message: "Usa questo comando in un server." };
  }
  initLavalinkMusicIfEnabled(client);
  if (client._shoukakuInitPending && !isLavalinkUsable(client)) {
    const waitUntil = Date.now() + 20_000;
    while (client._shoukakuInitPending && Date.now() < waitUntil) {
      await new Promise((r?) => setTimeout(r, 400));
    }
  }
  if (!isLavalinkUsable(client)) {
    const sh = client?.shoukaku;
    const node =
      sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
      (sh?.nodes?.size ? sh.nodes.values().next().value : undefined);
    const state = node?.state;
    global.logger?.warn?.("[MUSIC] play bloccato: nodo Shoukaku non CONNECTED", {
      hasShoukaku: Boolean(sh),
      nodes: sh?.nodes?.size ?? 0,
      state: state != null ? String(state) : "no-node",
      initDone: Boolean(client._shoukakuInitDone),
      initPending: Boolean(client._shoukakuInitPending),
    });
    return {
      ok: false,
      message:
        "Musica non disponibile: Lavalink non è collegato. Controlla che il processo **lavalink** sia online (`pm2 list`) e che `LAVALINK_HOST` / `LAVALINK_PASSWORD` coincidano con `application.yml`.",
    };
  }
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel || voiceChannel.isVoiceBased?.() === false) {
    return { ok: false, message: "Entra in un canale vocale per riprodurre musica." };
  }

  const guildId = guild.id;
  const { isGuildClipRecording } = require("../../../Vinili/Community/services/voiceClipService") as typeof import("../../../Vinili/Community/services/voiceClipService");
  if (isGuildClipRecording(guildId)) {
    const musicDuringClip = guildMusicSessionBlocksOtherVoiceChannels(client, guildId);
    if (!musicDuringClip.blocked) {
      return {
        ok: false,
        message: "Registrazione clip in corso. Ferma la clip o attendi la fine, poi riprova.",
      };
    }
  }
  /* noVoiceSteal1: se il bot è in un ALTRO canale per il TTS, la musica non lo porta via */
  const ttsChannelId = nativeVoiceChannelId(guildId);
  if (ttsChannelId && ttsChannelId !== String(voiceChannel.id)) {
    return {
      ok: false,
      message: `Il bot è già in <#${ttsChannelId}> per il **TTS**. Entra in quel canale, oppure fai uscire il TTS con **leave**, poi riprova \`+play\`.`,
    };
  }
  if (await clearBlockingNativeVoiceForMusic(guildId, client)) {
    return {
      ok: false,
      message:
        "Il bot ha ancora una sessione **TTS** in vocale: la musica non può avviarsi insieme. Fai uscire il TTS con **leave**, poi riprova `+play`.",
    };
  }

  await destroyGhostMusicStateIfBotNotInVoice(client, guild);

  const shoukaku = client.shoukaku;
  const musicLock = guildMusicSessionBlocksOtherVoiceChannels(client, guildId);
  if (
    musicLock.blocked &&
    musicLock.channelId &&
    String(voiceChannel.id) !== musicLock.channelId
  ) {
    const channelMention = `<#${musicLock.channelId}>`;
    return {
      ok: false,
      message:
        `La musica è attiva in ${channelMention}. Non puoi usare la musica da un altro canale vocale.`,
    };
  }

  const existingConn = shoukaku.connections.get(guildId);
  if (
    !musicLock.blocked &&
    existingConn?.channelId &&
    existingConn.channelId !== voiceChannel.id
  ) {
    await leaveMusicVoiceChannelMarked(client, guildId);
    endListeners.delete(guildId);
  }

  const node =
    shoukaku.nodes.get(process.env.LAVALINK_NODE_NAME || "main") ||
    shoukaku.getIdealNode() ||
    shoukaku.nodes.values().next().value;
  if (!node?.rest) {
    return { ok: false, message: "Nessun nodo Lavalink disponibile." };
  }

  const trimmedInput = String(query || "").trim();
  if (!trimmedInput) {
    return { ok: false, message: "Indica un titolo o un link." };
  }
  const trimmed = normalizeOpenSpotifyHttpUrl(trimmedInput) || trimmedInput;
  if (isSpotifyPodcastOnlyInput(trimmed)) {
    return {
      ok: false,
      message:
        "Su Spotify sono supportati **brani**, **album** e **playlist**; i **podcast** (link *show* / *episode*) no.",
    };
  }
  if (getMusicSearchMode() === "spotify" && isYoutubeLikeUrl(trimmed)) {
    return {
      ok: false,
      message:
        "È attiva la modalità **solo Spotify** (`MUSIC_SEARCH_MODE=spotify`): i link YouTube non sono accettati. Usa link **open.spotify.com** / **spotify:** oppure cerca per titolo.",
    };
  }

  let resolved;
  let tracks;
  try {
    ({ tracks, resolved } = await resolvePlayableTracks(node, trimmed, {
      metaHint: ctx.metaHint || null,
    }));
  } catch (err) {
    global.logger?.warn?.("[MUSIC] resolve:", err?.message || err);
    return {
      ok: false,
      message: `Ricerca fallita: ${err?.message || "errore Lavalink"}`,
    };
  }

  if (!tracks.length) {
    const hint = lavalinkErrorHint(resolved);
    const noResultsEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription("**Nessun risultato** ⛔");
    let msg = hint
      ? `Nessun risultato. (${hint})`
      : "Nessun risultato per questa ricerca o URL.";
    if (!hint && isPlainTextMusicQuery(trimmed)) {
      msg += " Prova con **titolo e artista** o un link **open.spotify.com** / YouTube (se consentito dalla modalità).";
    }
    if (isOpenSpotifyMusicUrlInput(trimmed)) {
      const needsLavasrcHint =
        !hint || /unknown file format|file format/i.test(String(hint || ""));
      if (needsLavasrcHint) {
        msg +=
          " Per **Spotify** il nodo **Lavalink** deve avere il plugin **LavaSrc** con **clientId** e **clientSecret** in `application.yml` (altrimenti spesso nei log compare `Unknown file format`: viene scaricata la pagina web al posto dei brani). Poi riavvia Lavalink.";
      }
    }
    return {
      ok: false,
      message: msg,
      embeds: [noResultsEmbed],
    };
  }

  const session = getSession(guildId);
  session.textChannelId = textChannelId;
  session.voiceChannelId = voiceChannel.id;
  await musicPurgeTts(guildId, client).catch(() => {});

  let player = shoukaku.players.get(guildId);
  if (!player) {
    const joinOnce = () =>
      shoukaku.joinVoiceChannel({
        guildId,
        shardId: getShardIdForGuild(guild),
        channelId: voiceChannel.id,
        /* clipAllVoices3: undeaf obbligatorio per ricevere TUTTE le voci */
        deaf: false,
      });
    try {
      try {
        player = await joinOnce();
      } catch (firstErr) {
        /* joinRetry1: connessione rimasta appesa o Lavalink appena riavviato → pulisci, aspetta il nodo e riprova una volta */
        global.logger?.warn?.("[MUSIC] joinVoiceChannel (riprovo):", firstErr?.message || firstErr);
        await Promise.resolve(shoukaku.leaveVoiceChannel?.(guildId)).catch(() => {});
        await clearBlockingNativeVoiceForMusic(guildId, client).catch(() => false);
        const waitUntil = Date.now() + 20_000;
        while (!isLavalinkUsable(client) && Date.now() < waitUntil) {
          await new Promise((r?) => setTimeout(r, 500));
        }
        player = await joinOnce();
      }
      notifyBotPresenceVoiceActivity(client);
      await musicStartCapture({
        guildId,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch((err?) => {
        global.logger?.warn?.("[MUSIC] voice capture start:", err?.message || err);
      });
    } catch (err) {
      global.logger?.warn?.("[MUSIC] joinVoiceChannel:", err?.message || err);
      return { ok: false, message: musicJoinVoiceChannelErrorMessage(err) };
    }
    attachEndHandler(client, player, guildId);
    const volume = resolveDefaultJoinGlobalVolume();
    await player.setGlobalVolume(volume);
  } else {
    attachEndHandler(client, player, guildId);
    const volume = resolveDefaultJoinGlobalVolume();
    await player.setGlobalVolume(volume).catch(() => {});
    if (player.paused) await player.setPaused(false).catch(() => {});
    if (!musicIsCaptureActive(guildId)) {
      await musicStartCapture({
        guildId,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch((err?) => {
        global.logger?.warn?.("[MUSIC] voice capture resume:", err?.message || err);
      });
    }
  }

  const playing = isMusicPlayingNow(player, session);
  if (playing) {
    const beforeLen = session.tracks.length;
    let remainingCurrent = 0;
    const encoded = player.track;
    if (encoded && typeof node.rest.decode === "function") {
      try {
        const cur = await node.rest.decode(encoded);
        const len = Number(cur?.info?.length);
        if (Number.isFinite(len) && len > 0) {
          const pos = Number(player.position) || 0;
          remainingCurrent = Math.max(0, len - pos);
        }
      } catch (err) {
        logMusic("decode current:", err?.message || err);
      }
    }
    let queuedBeforeMs = 0;
    for (let i = 0; i < beforeLen; i += 1) {
      queuedBeforeMs += Number(session.tracks[i]?.info?.length || 0);
    }
    const estimatedMs = remainingCurrent + queuedBeforeMs;
    session.tracks.push(...tagTracksWithRequester(tracks, requesterUser));
    if (session.repeatQueue && Array.isArray(session.repeatQueueSnapshot)) {
      for (const t of tracks) {
        if (t?.encoded) {
          session.repeatQueueSnapshot.push({
            encoded: t.encoded,
            label: describeTrack(t),
          });
        }
      }
    }

    const t0 = tracks[0];
    const label0 = describeTrack(t0);
    const url0 = await resolveSpotifyWebUrl(node, t0);
    const safeLabel = safeDiscordLinkLabel(label0);
    const trackFieldValue = (url0 ? `[${safeLabel}](${url0})` : `**${safeLabel}**`).slice(0, 1024);

    const queueStart = beforeLen + 1;
    const queueEnd = session.tracks.length;
    const posInQueue = tracks.length > 1 ? `${queueStart}–${queueEnd}` : String(queueStart);
    const upcomingLabel = beforeLen === 0 ? "Prossimo" : `Dopo ${beforeLen} brani`;

    const embed = new EmbedBuilder()
      .setColor(0x6f4e37)
      .setTitle("Brano aggiunto")
      .addFields(
        { name: "Traccia", value: trackFieldValue, inline: false },
        {
          name: "Tempo stimato alla riproduzione",
          value: formatEstimatedUntilPlayMs(estimatedMs),
          inline: true,
        },
        { name: "Durata della traccia", value: formatTrackDurationMs(t0?.info?.length), inline: true },
        { name: "Tra i prossimi brani", value: upcomingLabel, inline: true },
        { name: "Posizione in coda", value: posInQueue, inline: true },
      );

    const art = String(t0?.info?.artworkUrl || "").trim();
    if (art.startsWith("http://") || art.startsWith("https://")) embed.setThumbnail(art);

    if (tracks.length > 1) {
      embed.setDescription(`*+ ${tracks.length - 1} altre tracce in coda.*`);
    }

    if (requesterUser && typeof requesterUser.displayAvatarURL === "function") {
      const nome = memberDisplayName(member || requesterUser) || "Utente";
      embed.setFooter({
        text: `Richiesto da ${nome}`.slice(0, 2048),
        iconURL: userAvatarUrlDynamic(member || requesterUser, { size: 64 }),
      });
    }

    return {
      ok: true,
      message: `Aggiunte **${tracks.length}** traccia/e in coda — ${label0}`,
      embeds: [embed],
    };
  }

  const normalized = tagTracksWithRequester(tracks, requesterUser);
  if (!normalized.length) {
    return { ok: false, message: "Nessun brano valido da riprodurre." };
  }
  const [first, ...rest] = normalized;
  session.tracks.push(...rest);
  session.nowPlaying = describeTrack(first);
  setSessionCurrentRequesterFromUser(session, requesterUser);
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.repeatQueue = false;
  session.repeatQueueSnapshot = null;
  session.history = [];
  cancelPendingQueueEndedEmbed(guildId);
  const started = await playWithMirrorFallbacks(player, session, node, first);
  if (started.interrupted) {
    return {
      ok: false,
      message: "Riproduzione interrotta da un altro comando.",
    };
  }
  if (!started.ok || !started.track) {
    session.tracks.length = 0;
    session.nowPlaying = null;
    session.playingEncoded = null;
    session.musicSessionOwnerId = null;
    clearSessionCurrentRequester(session);
    return {
      ok: false,
      message:
        "Lo stream non è partito. Riprova con titolo + artista o un link Spotify (metadati → mirror YouTube).",
    };
  }
  const playingTrack = started.track;
  session._suppressQueueEndedUntil = 0;
  persistMusicQueueSnapshotNow(client);
  session.musicSessionOwnerId = requesterUser?.id ? String(requesterUser.id) : null;
  const label = describeTrack(playingTrack);
  const spotifyUrl = await resolveSpotifyWebUrl(node, playingTrack);
  const linkMd = formatTrackTitleMarkdownLink(label, spotifyUrl);
  const tail = rest.length ? ` (+${rest.length} in coda)` : "";
  const embedDescription = `${linkMd}${tail}`;
  const embedBody = `${formatNowPlayingLead()} ${embedDescription}`;
  return {
    ok: true,
    message: `${formatNowPlayingLead(label)}${tail}`,
    embedTitle: getNowPlayingEmbedTitle(),
    embedDescription,
    embedBody,
  };
}

export = { playMusicRequest };
