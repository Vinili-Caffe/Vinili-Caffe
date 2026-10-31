/** Musica: ricerca di una versione riproducibile quando il brano non parte (YouTube, yt-dlp). */
const { execFile } = require("child_process") as typeof import("child_process");
const { promisify } = require("util") as typeof import("util");
const { getMusicSearchMode, logMusic, normalizeLavalinkLoadType, tracksFromResolve, isPlainTextMusicQuery, isOpenSpotifyMusicUrlInput, filterOutSpotifyPodcastTracks, parsePlainMusicQueryHint, buildResolveAttempts, fetchSpotifyOembedMeta, buildStableRemirrorAttempts } = require("./musicSearch") as typeof import("./musicSearch");
const { sourceRank, normalizeIsrcCode, scoreTrackMetaMatch, pickBestTrackMatch, cloneTrackWithRequester } = require("./musicMatch") as typeof import("./musicMatch");
const { searchSpotifyTrackMetaForQuery } = require("./musicSpotifyLinks") as typeof import("./musicSpotifyLinks");

const execFileAsync = promisify(execFile);
const YT_DLP_BIN = String(process.env.YT_DLP_BIN || "/usr/local/bin/yt-dlp").trim() || "/usr/local/bin/yt-dlp";

let _ytOauthAccessCache = { token: "", expiresAtMs: 0 };

async function getYoutubeOauthAccessToken() {
  const now = Date.now();
  if (_ytOauthAccessCache.token && now < _ytOauthAccessCache.expiresAtMs - 60_000) {
    return _ytOauthAccessCache.token;
  }
  try {
    const { host, port } = parseLavalinkHost();
    const pass = String(process.env.LAVALINK_PASSWORD || "youshallnotpass").trim();
    const base = `http://${host}:${port}`;
    const ytInfo: any = await fetch(`${base}/youtube`, {
      headers: { Authorization: pass },
      signal: AbortSignal.timeout(8_000),
    }).then((r?) => (r.ok ? r.json() : null)).catch(() => null);
    const refresh = String(ytInfo?.refreshToken || "").trim();
    if (!refresh) return null;
    const tok: any = await fetch(`${base}/youtube/oauth/${encodeURIComponent(refresh)}`, {
      headers: { Authorization: pass },
      signal: AbortSignal.timeout(15_000),
    }).then((r?) => (r.ok ? r.json() : null)).catch(() => null);
    const access = String(tok?.access_token || tok?.accessToken || "").trim();
    const expiresIn = Number(tok?.expires_in || tok?.expiresIn || 3500);
    if (!access) return null;
    _ytOauthAccessCache = {
      token: access,
      expiresAtMs: now + Math.max(120, expiresIn) * 1000,
    };
    return access;
  } catch (err) {
    logMusic("yt oauth access fail", err?.message || err);
    return null;
  }
}

async function playEncodedFromStart(player?, encoded?, options: Record<string, any> = {}) {
  const enc = String(encoded || "").trim();
  if (!enc || typeof player?.playTrack !== "function") {
    throw new Error("playEncodedFromStart: argomenti non validi");
  }
  const position = Math.max(0, Math.floor(Number(options?.position) || 0));
  const access = await getYoutubeOauthAccessToken().catch(() => null);
  const track = access
    ? { encoded: enc, userData: { "oauth-token": access } }
    : { encoded: enc };
  if (access) logMusic("play with yt oauth-token", enc.slice(0, 24), position ? `@${position}ms` : "");
  else logMusic("playTrack", enc.slice(0, 24), position ? `@${position}ms` : "from start");
  await player.playTrack({ track, position });
}

function parseLavalinkHost() {
  /* perfP2: shared probe */
  return require("../../../shared/music/lavalinkProbe").parseLavalinkHost();
}
/* nameSearchStrict1: soglie ricerca per nome (prima 0.62 = troppa roba sbagliata) */
const NAME_SEARCH_MIN = 0.78;
const NAME_SEARCH_MIN_WITH_ARTIST = 0.84;
const NAME_SEARCH_FALLBACK_MIN = 0.72;

const MIRROR_MATCH_MIN = 0.78;
/* isrcFirst1: con ISRC Spotify soglia più alta sul solo titolo (evita cover/fake) */
const MIRROR_TITLE_MATCH_MIN = 0.86;

async function collectPlayableMirrorCandidates(node?, track?) {
  const info = track?.info || {};
  const src = String(info.sourceName || "").toLowerCase();
  const title = String(info.title || "").trim();
  const author = String(info.author || "").trim();
  const isrc = String(info.isrc || info?.pluginInfo?.isrc || track?.pluginInfo?.isrc || "").trim();
  const wanted = {
    title,
    author,
    isrc,
    length: Number(info.length || info.duration || 0) || 0,
  };
  const scored = [];
  const seen = new Set();
  const isrcClean = normalizeIsrcCode(isrc);
  const minForAttempt = (identifier?) => {
    const id = String(identifier || "");
    if (isrcClean && (id.includes(isrcClean) || /isrc/i.test(id))) return MIRROR_MATCH_MIN;
    return isrcClean ? MIRROR_TITLE_MATCH_MIN : MIRROR_MATCH_MIN;
  };

  function pushCand(cand?, matchScore?, baseBonus = 0) {
    const enc = String(cand?.encoded || "").trim();
    if (!enc || seen.has(enc)) return;
    const candSrc = String(cand?.info?.sourceName || "").toLowerCase();
    if (candSrc === "spotify") return;
    if (title && matchScore < MIRROR_MATCH_MIN) return;
    seen.add(enc);
    scored.push({
      track: cand,
      matchScore,
      sourceRank: sourceRank(candSrc),
      bonus: baseBonus,
    });
  }

  if (src && src !== "spotify") {
    pushCand(track, title ? scoreTrackMetaMatch(wanted, info) || 1 : 0, 0.05);
  }

  const attempts = buildStableRemirrorAttempts(title, author, isrc);

  async function resolveOne(identifier?) {
    try {
      const resolved = await node.rest.resolve(identifier);
      const found = tracksFromResolve(resolved);
      const floor = minForAttempt(identifier);
      return found
        .map((pick?) => ({
          pick,
          score: scoreTrackMetaMatch(wanted, {
            ...(pick?.info || {}),
            isrc: pick?.info?.isrc || (isrcClean && String(identifier).includes(isrcClean) ? isrcClean : ""),
          }),
          identifier,
        }))
        .filter((row?) => row.pick?.encoded && row.score >= floor)
        .sort((a?, b?) => b.score - a.score)
        .slice(0, 5);
    } catch (err) {
      logMusic("remirror:", identifier.slice(0, 50), err?.message || err);
      return [];
    }
  }

  /* isrcFirst1: risolvi ISRC prima; se hit forte salta fuzzy titolo */
  const isrcAttempts = isrcClean
    ? attempts.filter((a?) => String(a).includes(isrcClean))
    : [];
  const titleAttempts = attempts.filter((a?) => !isrcClean || !String(a).includes(isrcClean));
  if (isrcAttempts.length) {
    const isrcHits = (await Promise.all(isrcAttempts.map(resolveOne))).flat();
    for (const row of isrcHits) {
      pushCand(cloneTrackWithRequester(track, row.pick, info, row.score), row.score, 0.12);
    }
  }
  const hasStrongIsrc = scored.some((row?) => Number(row.matchScore) >= 0.95);
  if (!hasStrongIsrc && titleAttempts.length) {
    const firstBatch = titleAttempts.slice(0, 2);
    const rest = titleAttempts.slice(2);
    const early = (await Promise.all(firstBatch.map(resolveOne))).flat();
    for (const row of early) {
      pushCand(cloneTrackWithRequester(track, row.pick, info, row.score), row.score);
    }
    if (!scored.some((row?) => row.matchScore >= 0.88) && rest.length) {
      const later = (await Promise.all(rest.map(resolveOne))).flat();
      for (const row of later) {
        pushCand(cloneTrackWithRequester(track, row.pick, info, row.score), row.score);
      }
    }
  }

  scored.sort((a?, b?) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    return b.bonus - a.bonus;
  });
  const best = Number(scored[0]?.matchScore || 0);
    const nearBest = scored.filter((row?) => Number(row.matchScore) >= best - 0.08);
    const alt = scored.find((row?) => {
    const s = String(row.track?.info?.sourceName || "").toLowerCase();
    return s && s !== "youtube" && s !== "youtubemusic" && Number(row.matchScore) >= MIRROR_MATCH_MIN;
  });
  const out = [...nearBest];
  if (alt && !out.some((row?) => row.track?.encoded === alt.track?.encoded)) out.push(alt);
    const ytExtra = [];
  const seenIds = new Set(
    out.map((row?) => String(row.track?.info?.identifier || row.track?.encoded || "")),
  );
  for (const row of scored) {
    const s = String(row.track?.info?.sourceName || "").toLowerCase();
    if (s !== "youtube" && s !== "youtubemusic") continue;
    if (Number(row.matchScore) < MIRROR_MATCH_MIN) continue;
    const id = String(row.track?.info?.identifier || row.track?.encoded || "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    ytExtra.push(row);
    if (ytExtra.length >= 2) break;
  }
  for (const row of ytExtra) {
    if (!out.some((r?) => r.track?.encoded === row.track?.encoded)) out.push(row);
  }
  return out.slice(0, 5).map((row?) => row.track);
}

async function remirrorToStableAudio(node?, track?) {
  const candidates = await collectPlayableMirrorCandidates(node, track);
  if (!candidates.length) {
    const src = String(track?.info?.sourceName || "").toLowerCase();
        if (src === "spotify") return null;
    return track;
  }
  const pick = candidates[0];
  pick._mirrorCandidates = candidates;
  const from = String(track?.info?.sourceName || "").toLowerCase();
  const to = String(pick?.info?.sourceName || "").toLowerCase();
  if (pick.encoded !== track?.encoded) {
    logMusic("remirror ok", {
      from: `${from}:${track?.info?.title || ""}`.slice(0, 50),
      to: `${to}:${pick?.info?.title || ""}`.slice(0, 50),
    });
  }
  return pick;
}

function isYoutubeSourceName(sourceName?) {
  const s = String(sourceName || "").toLowerCase();
  return s === "youtube" || s === "youtubemusic";
}

function youtubeWatchUrlFromTrack(track?) {
  const info = track?.info || {};
  const uri = String(info.uri || "").trim();
  if (/youtube\.com\/watch|youtu\.be\//i.test(uri)) return uri;
  const id = String(info.identifier || "").trim();
  if (/^[\w-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  return "";
}

async function resolveYoutubeStreamUrlViaYtDlp(watchUrl?) {
  const url = String(watchUrl || "").trim();
  if (!url) return null;
  try {
    const { stdout, stderr } = await execFileAsync(
      YT_DLP_BIN,
      ["-g", "-f", "ba/bestaudio/best", "--no-playlist", "--no-warnings", url],
      { timeout: 55_000, maxBuffer: 2_000_000, windowsHide: true },
    );
    const line = String(stdout || "")
      .split(/\r?\n/)
      .map((l?) => l.trim())
      .find((l?) => /^https?:\/\//i.test(l));
    if (!line) {
      logMusic("yt-dlp no url", String(stderr || "").slice(0, 180));
      return null;
    }
    return line;
  } catch (err) {
    logMusic("yt-dlp fail", err?.message || err);
    return null;
  }
}

async function remirrorYoutubeViaHttp(node?, track?) {
  const watch = youtubeWatchUrlFromTrack(track);
  if (!watch || typeof node?.rest?.resolve !== "function") return null;
  const streamUrl = await resolveYoutubeStreamUrlViaYtDlp(watch);
  if (!streamUrl) return null;
  try {
    const resolved = await node.rest.resolve(streamUrl);
    const found = tracksFromResolve(resolved);
    const pick = found[0];
    if (!pick?.encoded) return null;
    const out = cloneTrackWithRequester(track, pick, track?.info || {}, 1);
        if (out?.info) {
      if (track?.info?.title) out.info.title = track.info.title;
      if (track?.info?.author) out.info.author = track.info.author;
      if (track?.info?.artworkUrl) out.info.artworkUrl = track.info.artworkUrl;
      if (track?.info?.uri) out.info.uri = track.info.uri;
      out.info.sourceName = "http";
    }
    logMusic("yt-dlp http remirror ok", String(track?.info?.identifier || "").slice(0, 12));
    return out;
  } catch (err) {
    logMusic("yt-dlp http resolve fail", err?.message || err);
    return null;
  }
}

async function playWithMirrorFallbacks(player?, session?, node?, track?) {
  /* playlistRaceFix1: durante probe l'handler end NON avanza la coda */
  if (session) session._mirrorProbing = true;
  try {
    let list = Array.isArray(track?._mirrorCandidates) ? track._mirrorCandidates : null;
    if (!list?.length) list = await collectPlayableMirrorCandidates(node, track);
    list = (Array.isArray(list) ? list : []).filter((cand?) => {
      const enc = String(cand?.encoded || "").trim();
      if (!enc) return false;
      const src = String(cand?.info?.sourceName || "").toLowerCase();
      return src !== "spotify";
    });
    if (!list.length) {
      const src = String(track?.info?.sourceName || "").toLowerCase();
      if (track?.encoded && src && src !== "spotify") list = [track];
    }
    const ytSeed =
      list.find((c?) => isYoutubeSourceName(c?.info?.sourceName)) ||
      (isYoutubeSourceName(track?.info?.sourceName) ? track : null);
    if (ytSeed) {
      const httpAlt = await remirrorYoutubeViaHttp(node, ytSeed).catch((err?) => {
        logMusic("yt-dlp remirror err", err?.message || err);
        return null;
      });
      if (httpAlt?.encoded) {
        list = [httpAlt, ...list.filter((c?) => String(c?.encoded) !== String(httpAlt.encoded))];
      }
    }
    const isYt = (cand?) => isYoutubeSourceName(cand?.info?.sourceName);
    const isHttp = (cand?) => String(cand?.info?.sourceName || "").toLowerCase() === "http";
    list = [
      ...list.filter(isHttp),
      ...list.filter((c?) => !isHttp(c) && isYt(c)),
      ...list.filter((c?) => !isHttp(c) && !isYt(c)),
    ].slice(0, 5);
    logMusic(
      "mirror try",
      list.map((c?) => `${c?.info?.sourceName}:${String(c?.info?.identifier || "").slice(0, 12)}`).join(","),
    );
    for (let i = 0; i < list.length; i++) {
      const cand = list[i];
      const playGen = markFreshPlayAttempt(session);
      session.nowPlaying = describeTrack(cand);
      session.playingEncoded = cand.encoded;
      session.playingPositionMs = 0;
      try {
        if (player.paused) await player.setPaused(false).catch(() => {});
        await playEncodedFromStart(player, cand.encoded);
      } catch (err) {
        logMusic("play mirror fail", cand?.info?.sourceName, err?.message || err);
        continue;
      }
      const probe = await probeMirrorPlayback(player, session, playGen, cand, 1800);
      if (probe === "interrupted") {
        return { ok: false, interrupted: true, track: cand };
      }
      if (probe === "ok") {
        return { ok: true, track: cand };
      }
      logMusic("mirror died early, next", {
        src: cand?.info?.sourceName,
        id: String(cand?.info?.identifier || "").slice(0, 16),
        left: list.length - i - 1,
        earlyPlayFailed: Boolean(session.earlyPlayFailed),
      });
    }
    return { ok: false, interrupted: false, track: null };
  } finally {
    if (session) session._mirrorProbing = false;
  }
}

async function probeMirrorPlayback(player?, session?, playGen?, cand?, maxMs = 1800) {
  const step = 200;
  let waited = 0;
  const wantEnc = String(cand?.encoded || "");
  while (waited < maxMs) {
    await delayMs(step);
    waited += step;
    if (Number(session.playGeneration || 0) !== playGen) return "interrupted";
    if (session.earlyPlayFailed) return "failed";
    const stillEncoded = encodedFromPlayerTrack(player.track);
    if (!stillEncoded || stillEncoded !== wantEnc) return "failed";
        if (waited >= 700) return "ok";
  }
  if (Number(session.playGeneration || 0) !== playGen) return "interrupted";
  if (session.earlyPlayFailed) return "failed";
  const stillEncoded = encodedFromPlayerTrack(player.track);
  if (!stillEncoded || stillEncoded !== wantEnc) return "failed";
  return "ok";
}

async function resolvePlayableTracks(node?, userQuery?, options: Record<string, any> = {}) {
  const mode = getMusicSearchMode();
  const preferNonSpotify =
    (mode === "spotify" || mode === "spotify_first") && isPlainTextMusicQuery(userQuery);
  let lastResolved = null;
  let metaHint = options?.metaHint && typeof options.metaHint === "object" ? options.metaHint : null;

  /* nameSearchOrig1: plain text → Spotify seed (URL+meta), poi remirror ISRC.
     Senza seed ytsearch:"Hey soul sister topic" pickava cover/Topic sbagliati. */
  if (
    isPlainTextMusicQuery(userQuery) &&
    !options?.skipSpotifySeed &&
    !(metaHint && metaHint.title)
  ) {
    const spMeta = await searchSpotifyTrackMetaForQuery(userQuery);
    if (spMeta?.url) {
      logMusic("name search spotify seed", {
        title: String(spMeta.title || "").slice(0, 60),
        author: String(spMeta.author || "").slice(0, 40),
      });
      const viaSp = await resolvePlayableTracks(node, spMeta.url, {
        ...options,
        metaHint: spMeta,
        skipSpotifySeed: true,
      });
      if (viaSp?.tracks?.length) return viaSp;
      metaHint = spMeta;
    }
  }

  let attempts = buildResolveAttempts(userQuery);

  if (isOpenSpotifyMusicUrlInput(userQuery)) {
    const probe = await node.rest.resolve(attempts[0]).catch(() => null);
    lastResolved = probe;
    if (!tracksFromResolve(probe).length) {
      let meta = await fetchSpotifyOembedMeta(userQuery);
      if (!meta?.title && metaHint?.title) {
        meta = {
          title: String(metaHint.title || "").trim(),
          author: String(metaHint.author || "").trim(),
        };
      }
      if (meta?.title) {
        const q = [meta.title, meta.author].filter(Boolean).join(" ").trim();
        logMusic("spotify url fallback meta", q.slice(0, 80));
        attempts = buildResolveAttempts(q);
      }
    }
  }

  const pooled = [];
  const seenEnc = new Set();
  const plainText = isPlainTextMusicQuery(userQuery);
  const plainHint = plainText ? parsePlainMusicQueryHint(userQuery) : null;
  const plainWanted = plainText
    ? {
        title: metaHint?.title || plainHint.title || userQuery,
        author: metaHint?.author || plainHint.author || "",
      }
    : null;

  async function remirrorAndReturn(tracks?, resolved?) {
    const musicOnly = filterOutSpotifyPodcastTracks(tracks);
    if (!musicOnly.length) return null;
    const remirrored = [];
    for (const t of musicOnly) {
      const mirrored = await remirrorToStableAudio(node, t);
      if (mirrored?.encoded) remirrored.push(mirrored);
    }
    if (!remirrored.length) return null;
    const src = String(remirrored[0]?.info?.sourceName || "").toLowerCase();
    if (preferNonSpotify && src === "spotify") return null;
    if (src === "spotify") return null;
    return { tracks: remirrored, resolved };
  }

  for (const identifier of attempts) {
    try {
      lastResolved = await node.rest.resolve(identifier);
    } catch (err) {
      logMusic("resolve attempt:", identifier, err?.message || err);
      continue;
    }
    logMusic("resolve ok", { loadType: lastResolved?.loadType, identifier: identifier.slice(0, 80) });
    let tracks = tracksFromResolve(lastResolved);
    const isSearch = normalizeLavalinkLoadType(lastResolved) === "search";
    let wanted;
    if (metaHint?.title) {
      wanted = metaHint;
    } else if (plainText) {
      wanted = plainWanted;
    } else {
      wanted = {
        title: tracks[0]?.info?.title || "",
        author: tracks[0]?.info?.author || "",
        length: tracks[0]?.info?.length || 0,
      };
    }

    if (isSearch) {
      /* nameSearchStrict1: pool da TUTTI gli attempt, pick solo a fine (niente primo hit cieco) */
      for (const t of tracks.slice(0, 10)) {
        const enc = String(t?.encoded || "");
        if (!enc || seenEnc.has(enc)) continue;
        seenEnc.add(enc);
        pooled.push(t);
      }
      if (plainText) continue;
      const best = pickBestTrackMatch(pooled.length ? pooled : tracks, wanted, {
        minScore: NAME_SEARCH_MIN,
        rejectCover: true,
      });
      if (!best?.encoded) continue;
      tracks = [best];
    } else if (!tracks.length) {
      continue;
    }

    if (!isSearch || !plainText) {
      const out = await remirrorAndReturn(tracks, lastResolved);
      if (out) return out;
    }
  }

  if (plainText && pooled.length) {
    const requireAuthor = Boolean(String(plainWanted?.author || "").trim());
    let best = pickBestTrackMatch(pooled, plainWanted, {
      minScore: requireAuthor ? NAME_SEARCH_MIN_WITH_ARTIST : NAME_SEARCH_MIN,
      requireAuthor,
      rejectCover: true,
    });
    if (!best?.encoded) {
      best = pickBestTrackMatch(pooled, plainWanted, {
        minScore: NAME_SEARCH_FALLBACK_MIN,
        requireAuthor: false,
        rejectCover: true,
      });
    }
    if (!best?.encoded) {
      logMusic("name search: nessun match sopra soglia", {
        q: String(userQuery || "").slice(0, 80),
        pool: pooled.length,
      });
      return { tracks: [], resolved: lastResolved };
    }
    logMusic("name search pick", {
      title: String(best?.info?.title || "").slice(0, 60),
      author: String(best?.info?.author || "").slice(0, 40),
      pool: pooled.length,
    });
    const out = await remirrorAndReturn([best], lastResolved);
    if (out) return out;
  }

  return { tracks: [], resolved: lastResolved };
}

function describeTrack(t?) {
  const info = t?.info;
  if (!info) return "Traccia sconosciuta";
  return `${info.title || "Senza titolo"} — ${info.author || "?"}`;
}

function markFreshPlayAttempt(session?) {
  if (!session) return 0;
    session.playGeneration = Number(session.playGeneration || 0) + 1;
  session._freshPlayAt = Date.now();
  session._suppressQueueEndedUntil = Date.now() + 4500;
  session.earlyPlayFailed = false;
  return session.playGeneration;
}

function delayMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function encodedFromPlayerTrack(track?) {
  if (typeof track === "string") return track;
  if (track?.encoded && typeof track.encoded === "string") return track.encoded;
  return null;
}

export = { playEncodedFromStart, playWithMirrorFallbacks, resolvePlayableTracks, describeTrack, encodedFromPlayerTrack };
