/** Musica: punteggio dei risultati per scegliere la versione giusta (niente cover o karaoke). */
function sourceRank(sourceName?) {
  const s = String(sourceName || "").toLowerCase();
  if (s === "youtube" || s === "youtubemusic") return 1;
  if (s === "soundcloud") return 2;
  if (s === "spotify") return 9;
  return 3;
}

function normalizeMusicMatchText(value?) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|official|video|audio|lyrics|theme|hq|hd|4k|mv|visualizer)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function musicTokenSet(value?) {
  return new Set(
    normalizeMusicMatchText(value)
      .split(" ")
      .map((t?) => t.trim())
      .filter((t?) => t.length > 1),
  );
}

function jaccardTokenSimilarity(a?, b?) {
  const A = musicTokenSet(a);
  const B = musicTokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const COVER_BAIT_RE =
  /\b(cover|covers|karaoke|instrumental|nightcore|daycore|slowed|reverb|sped\s*up|speed\s*up|8d\s*audio|bass\s*boosted|mashup|bootleg|fan[\s-]?made|tribute|piano\s*version|guitar\s*version|violin|orchestra|reaction|live\s*performance|full\s*album|hour\s*version|1\s*hour|remix|bootleg|edit\s*audio|tiktok|shorts|meme|parody|chipmunk|female\s*version|male\s*version)\b/i;
const OFFICIAL_HINT_RE =
  /\b(official\s*(audio|video|music\s*video|mv)|topic|vevo|audio\s*oficial|lyric\s*video)\b/i;
const WANT_COVER_OK_RE = /\b(cover|karaoke|nightcore|slowed|sped\s*up|remix|instrumental)\b/i;

function rawMusicHaystack(candidate?) {
  const info = candidate && typeof candidate === "object" ? candidate : {};
  return `${info.title || ""} ${info.author || ""} ${info.uri || ""}`;
}

function isLikelyCoverBait(candidate?, wanted?) {
  const wantRaw = `${wanted?.title || ""} ${wanted?.author || ""}`;
  if (WANT_COVER_OK_RE.test(wantRaw)) return false;
  return COVER_BAIT_RE.test(rawMusicHaystack(candidate));
}

function officialTrackBonus(candidate?, wanted?) {
  const hay = rawMusicHaystack(candidate);
  let bonus = 0;
  if (OFFICIAL_HINT_RE.test(hay)) bonus += 0.18;
  const hasWantAuthor = Boolean(String(wanted?.author || "").trim());
  /* nameSearchOrig1: Topic/Vevo bonus solo se sappiamo l’artista — altrimenti
     “*- Topic” batte l’originale su title-only. */
  if (hasWantAuthor && (/\bvevo\b/i.test(hay) || /\btopic\b/i.test(String(candidate?.author || "")))) {
    bonus += 0.08;
  }
  return bonus;
}

function durationMatchPenalty(wanted?, candidate?) {
  const wantLen = Number(wanted?.length || wanted?.duration || 0);
  const candLen = Number(candidate?.length || candidate?.duration || 0);
  if (!(wantLen > 5_000) || !(candLen > 5_000)) return 0;
  const ratio = Math.min(wantLen, candLen) / Math.max(wantLen, candLen);
  if (ratio >= 0.88) return 0.06;
  if (ratio >= 0.75) return 0;
  if (ratio >= 0.55) return -0.18;
  return -0.45;
}

function normalizeIsrcCode(value?) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function scoreTrackMetaMatch(wanted?, candidate?) {
  const wantTitle = normalizeMusicMatchText(wanted?.title);
  const candTitle = normalizeMusicMatchText(candidate?.title);
  const wantIsrc = normalizeIsrcCode(wanted?.isrc);
  const candIsrc = normalizeIsrcCode(candidate?.isrc);
  /* isrcFirst1: match ISRC esatto = originale Spotify (anche se titolo YT differisce) */
  if (wantIsrc && candIsrc && wantIsrc === candIsrc) {
    return 1.2;
  }
  if (!wantTitle || !candTitle) return 0;

  const wantTokens = musicTokenSet(wantTitle);
  const candTokens = musicTokenSet(candTitle);
  let recall = 0;
  let precision = 0;
  if (wantTokens.size && candTokens.size) {
    let hitWant = 0;
    for (const t of wantTokens) if (candTokens.has(t)) hitWant += 1;
    recall = hitWant / wantTokens.size;
    let hitCand = 0;
    for (const t of candTokens) if (wantTokens.has(t)) hitCand += 1;
    precision = hitCand / candTokens.size;
  }

  let score = 0;
  if (wantTitle === candTitle) {
    score = 1;
  } else if (recall > 0 && precision > 0) {
    score = (2 * recall * precision) / (recall + precision);
  }

  if (candTitle.includes(wantTitle) || wantTitle.includes(candTitle)) {
    const lenRatio =
      Math.min(wantTitle.length, candTitle.length) /
      Math.max(wantTitle.length, candTitle.length);
    score = Math.max(score, 0.45 + 0.5 * lenRatio);
  }

  if (wantTokens.size && candTokens.size && candTokens.size >= wantTokens.size * 2 && precision < 0.5) {
    score = Math.min(score, 0.45);
  }

  const wantAuthor = normalizeMusicMatchText(String(wanted?.author || "").split(",")[0]);
  const candAuthor = normalizeMusicMatchText(String(candidate?.author || "").split(",")[0]);
  if (wantAuthor && candAuthor) {
    if (wantAuthor === candAuthor || candAuthor.includes(wantAuthor) || wantAuthor.includes(candAuthor)) {
      score += 0.18;
    } else if (jaccardTokenSimilarity(wantAuthor, candAuthor) >= 0.5) {
      score += 0.06;
    } else {
      /* nameSearchStrict1: artista sbagliato = quasi sempre scarta */
      score -= 0.65;
    }
  } else if (wantAuthor && !candAuthor) {
    score -= 0.12;
  }

  score += officialTrackBonus(candidate, wanted);
  score += durationMatchPenalty(wanted, candidate);
  if (isLikelyCoverBait(candidate, wanted)) score -= 0.7;
  /* isrcFirst1: query ISRC (ytsearch:CODE) senza isrc sul candidate → bonus leggero se titolo ok */
  if (wantIsrc && !candIsrc && score >= 0.7) score += 0.08;

  return Math.max(0, Math.min(1.25, score));
}

function authorMatchesWanted(wanted?, candidate?) {
  const wantAuthor = normalizeMusicMatchText(String(wanted?.author || "").split(",")[0]);
  if (!wantAuthor) return true;
  const candAuthor = normalizeMusicMatchText(String(candidate?.author || "").split(",")[0]);
  if (!candAuthor) return false;
  if (wantAuthor === candAuthor || candAuthor.includes(wantAuthor) || wantAuthor.includes(candAuthor)) {
    return true;
  }
  return jaccardTokenSimilarity(wantAuthor, candAuthor) >= 0.55;
}

function pickBestTrackMatch(tracks?, wanted?, { minScore = 0.55, requireAuthor = false, rejectCover = false } = {}) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const want = wanted && (wanted.title || wanted.author)
    ? wanted
    : { title: String(wanted || ""), author: "" };
  let best = null;
  let bestScore = -1;
  for (const t of tracks) {
    const info = t?.info || {};
    if (rejectCover && isLikelyCoverBait(info, want)) continue;
    if (requireAuthor && !authorMatchesWanted(want, info)) continue;
    const score = scoreTrackMetaMatch(want, info);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  if (bestScore < minScore) return null;
  return best;
}

function cloneTrackWithRequester(fromTrack?, pick?, fallbackInfo?, matchScore = 0) {
  const info = fallbackInfo || fromTrack?.info || {};
  const pickInfo = { ...(pick.info || {}) };
  const fromSrc = String(fromTrack?.info?.sourceName || info?.sourceName || "").toLowerCase();
  /* nameSearchOrig1: seed Spotify → SEMPRE tieni title/author/uri Spotify sull’embed
     (soglia 0.85 lasciava “Skye - Topic” sul label). */
  const preserveIdentity = fromSrc === "spotify" || Number(matchScore) >= 0.85;
  return {
    encoded: pick.encoded,
    info: {
      ...pickInfo,
      title: preserveIdentity && info.title ? info.title : pickInfo.title,
      author: preserveIdentity && info.author ? info.author : pickInfo.author,
      uri: preserveIdentity && info.uri ? info.uri : pickInfo.uri,
      artworkUrl: info.artworkUrl || pickInfo.artworkUrl,
      isrc: info.isrc || pickInfo.isrc,
      sourceName: pickInfo.sourceName || info.sourceName,
    },
    pluginInfo: pick.pluginInfo,
    userData: pick.userData,
    vcRequestedByUserId: fromTrack.vcRequestedByUserId,
    vcRequestedByUserTag: fromTrack.vcRequestedByUserTag,
  };
}

export = { sourceRank, normalizeIsrcCode, scoreTrackMetaMatch, pickBestTrackMatch, cloneTrackWithRequester };
