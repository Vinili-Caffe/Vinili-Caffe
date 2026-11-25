/** Music Quiz: catalogo Deezer + sessioni solo (scoring server-side). */
const crypto = require("crypto") as typeof import("crypto");
const { musicQuizViewer } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const deezer = require("./siteMusicQuizDeezer") as typeof import("./siteMusicQuizDeezer");
const { buildMusicQuizHub } = require("./siteMusicQuizHub") as typeof import("./siteMusicQuizHub");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

const {
  ROUNDS,
  ANSWER_MS,
  DIFF_MS,
  buildRounds,
  buildRoundsWithArtists,
  refreshPreviews,
  pointsFor,
  parseDifficulty,
} = require("./siteMusicQuizRounds") as typeof import("./siteMusicQuizRounds");
type DiffKey = import("./siteMusicQuizRounds").DiffKey;
type SessionRound = import("./siteMusicQuizRounds").QuizRound;

type Session = {
  id: string;
  userId: string;
  packSlug: string;
  difficulty: DiffKey;
  mode: string;
  rounds: SessionRound[];
  answers: Array<{ index: number; choice: number; correct: boolean; points: number; ms: number }>;
  /** quando il server ha mandato ogni domanda: il tempo dichiarato dal browser non può superarlo */
  servedAt: number[];
  createdAt: number;
  expiresAt: number;
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 45 * 60_000;

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
  if (sessions.size > 800) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, 200);
    for (const [id] of oldest) sessions.delete(id);
  }
}

function publicRound(r: SessionRound, total: number) {
  return {
    index: r.index,
    total,
    previewUrl: r.previewUrl,
    options: r.options,
    start: r.start || 0,
  };
}

async function loadPackTracks(slug: string) {
  const pack = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
    boardSlug: String(slug || "").trim(),
  }).lean();
  if (!pack) return null;
  const payload = (pack as any).payload || {};
  let tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  if (!tracks.length && payload.source === "artist" && payload.deezerId) {
    tracks = await deezer.artistTopTracks(payload.deezerId, 50);
  } else if (!tracks.length && payload.source === "playlist" && payload.deezerId) {
    tracks = await deezer.playlistTracks(payload.deezerId, 80);
  }
  tracks = tracks.filter((t?) => t?.previewUrl && t?.title);
  return { pack, tracks, payload };
}

async function ensureDeezerPack(source: "artist" | "playlist", deezerId: string) {
  const slug = `${source}-${deezerId}`;
  let pack = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
    boardSlug: slug,
  });
  if (pack) return pack;
  const info =
    source === "artist" ? await deezer.artistInfo(deezerId) : await deezer.playlistInfo(deezerId);
  const tracks =
    source === "artist"
      ? await deezer.artistTopTracks(deezerId, 50)
      : await deezer.playlistTracks(deezerId, 80);
  if (!info || tracks.length < 4) {
    global.logger?.warn?.(`[music-quiz] ${slug}: info=${Boolean(info)} brani=${tracks.length}`);
    return null;
  }
  pack = await SiteDocument.create({
    docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
    boardSlug: slug,
    title: String(info.name || slug).slice(0, 120),
    boardIconUrl: String(info.cover || ""),
    createdBy: "deezer",
    payload: {
      source,
      deezerId: String(deezerId),
      kind: source,
      cover: info.cover,
      tracks,
      plays: 0,
      community: false,
    },
  });
  return pack;
}

/** Quiz da una playlist pubblica di Spotify: i brani si cercano su Deezer (stesso codice del brano) per l'anteprima. */
async function ensureSpotifyPack(spotifyId: string) {
  const id = String(spotifyId || "").trim();
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return null;
  const slug = `spotify-${id}`;
  const found = await SiteDocument.findOne({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug });
  if (found) return found;
  const pending = spotifyPending.get(id);
  if (pending) return pending;
  const job = (async () => {
    try {
      const { importPlaylist } = require("./siteMusicQuizSpotify") as typeof import("./siteMusicQuizSpotify");
      const r = await importPlaylist(`https://open.spotify.com/playlist/${id}`, 40);
      if (!r?.tracks || r.tracks.length < 4) {
        global.logger?.warn?.(`[music-quiz] ${slug}: brani trovati su Deezer=${r?.tracks?.length || 0}`);
        return null;
      }
      return await SiteDocument.create({
        docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
        boardSlug: slug,
        title: String(r.playlist?.name || "Playlist").slice(0, 120),
        boardIconUrl: String(r.playlist?.cover || ""),
        createdBy: "spotify",
        payload: {
          source: "spotify",
          spotifyId: id,
          kind: "playlist",
          cover: r.playlist?.cover || "",
          tracks: r.tracks,
          plays: 0,
          community: false,
        },
      });
    } catch (err: any) {
      global.logger?.warn?.(`[music-quiz] ${slug}:`, err?.message || err);
      return null;
    } finally {
      spotifyPending.delete(id);
    }
  })();
  spotifyPending.set(id, job);
  return job;
}
const spotifyPending = new Map<string, Promise<any>>();

/** stesso nome senza accenti, maiuscole e simboli */
function plain(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function handleMusicQuizSearchGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const q = String(req.query?.q || "").trim();
    if (!q) return res.json({ ok: true, artists: [], playlists: [], tracks: [] });
    /* il testo cercato va preso alla lettera, non come espressione regolare */
    const rx = new RegExp(q.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const { searchSpotifyPlaylists } = require("./siteMusicQuizSpotify") as typeof import("./siteMusicQuizSpotify");
    const [artists, playlists, tracks, quizzes, spotify] = await Promise.all([
      deezer.searchArtists(q, 16),
      deezer.searchPlaylists(q, 30),
      deezer.searchTracks(q, 16),
      /* quiz della community: solo quelli pubblici, per nome, tag o categoria */
      SiteDocument.find({
        docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
        "payload.community": true,
        "payload.visibility": { $ne: "unlisted" },
        $or: [{ title: rx }, { "payload.tags": rx }, { "payload.category": rx }],
      })
        .select("boardSlug title boardIconUrl authorName userId payload.plays payload.anonymous payload.category payload.tracks.id")
        .sort({ "payload.plays": -1 })
        .limit(10)
        .lean()
        .catch(() => []),
      searchSpotifyPlaylists(q, 30),
    ]);
    /* playlist: prima quelle col nome cercato nel titolo, poi le più grandi; Spotify e Deezer mescolate */
    const want = plain(q);
    const score = (p: { name: string; trackCount: number; fans?: number; kind: string }) => {
      const title = plain(p.name);
      let s = 0;
      if (want && title.includes(want)) s += 100;
      if (want && title.startsWith(want)) s += 20;
      if (/\b(best|migliori|meglio|essential|hits?|greatest|top|100)\b/.test(title)) s += 15;
      s += Math.min(30, Math.log10(1 + (p.fans || 0)) * 6);
      s += Math.min(15, (p.trackCount || 0) / 10);
      return s;
    };
    const seen = new Set<string>();
    const mixed = [...(spotify || []), ...(playlists || []).filter((p: any) => (p.trackCount || 0) >= 10)]
      .filter((p: any) => {
        const key = plain(p.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a: any, b: any) => score(b) - score(a))
      .slice(0, 24);
    const quizCards = (quizzes || []).map((p: any) => ({
      slug: p.boardSlug,
      title: p.title,
      cover: p.boardIconUrl || "",
      plays: Number(p.payload?.plays || 0),
      trackCount: Array.isArray(p.payload?.tracks) ? p.payload.tracks.length : 0,
      category: String(p.payload?.category || ""),
      authorName: p.payload?.anonymous ? "" : String(p.authorName || ""),
      kind: "community",
      ...(String(p.userId || "") === String((auth as any).userId || "") ? { mine: true } : {}),
    }));
    return res.json({ ok: true, artists, playlists: mixed, tracks, quizzes: quizCards });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] search:", err?.message || err);
    return res.status(502).json({ ok: false, error: "deezer_error", message: "Deezer non disponibile." });
  }
}

async function handleMusicQuizHubGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const hub = await buildMusicQuizHub((auth as any).userId);
    return res.json({ ok: true, ...hub, community: hub.communityNew });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] hub:", err?.message || err);
    return res.status(500).json({ ok: false, error: "hub_error" });
  }
}

async function handleMusicQuizArtistGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const id = String(req.params?.id || "").trim();
    const pack = await ensureDeezerPack("artist", id);
    if (!pack) return res.status(404).json({ ok: false, error: "not_found", message: "Deezer non ha abbastanza brani con l'anteprima per questo quiz." });
    const payload = (pack as any).payload || {};
    return res.json({
      ok: true,
      pack: {
        slug: (pack as any).boardSlug,
        title: (pack as any).title,
        cover: (pack as any).boardIconUrl || payload.cover || "",
        kind: "artist",
        deezerId: id,
        trackCount: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
        plays: Number(payload.plays || 0),
      },
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: "deezer_error", message: String(err?.message || "") });
  }
}

/** Quiz simili da mostrare sotto un quiz. */
async function handleMusicQuizSimilarGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const slug = String(req.params?.slug || "").trim();
    if (!slug || slug.length > 120) return res.status(400).json({ ok: false, error: "bad_slug" });
    const { buildSimilar } = require("./siteMusicQuizHub") as typeof import("./siteMusicQuizHub");
    const { withMine } = require("./siteMusicQuizHub") as typeof import("./siteMusicQuizHub");
    return res.json({ ok: true, items: withMine(await buildSimilar(slug), (auth as any).userId) });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] similar:", err?.message || err);
    return res.json({ ok: true, items: [] });
  }
}

/** Titoli dei brani più ascoltati di un artista: per riempire le risposte sbagliate quando si crea un quiz. */
async function handleMusicQuizArtistTitlesGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const id = String(req.params?.id || "").trim();
    if (!/^\d{1,15}$/.test(id)) return res.status(400).json({ ok: false, error: "bad_id" });
    const tracks = await deezer.artistTopTracks(id, 50);
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const t of tracks) {
      /* «Titolo (Live)» e «Titolo» sono lo stesso brano */
      const k = String(t.title || "").toLowerCase().replace(/\s*[([].*?[)\]]/g, "").trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      titles.push(String(t.title));
    }
    return res.json({ ok: true, titles });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: "deezer_error", message: "Deezer non risponde, riprova." });
  }
}

async function handleMusicQuizPlaylistGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const id = String(req.params?.id || "").trim();
    const pack = await ensureDeezerPack("playlist", id);
    if (!pack) return res.status(404).json({ ok: false, error: "not_found", message: "Deezer non ha abbastanza brani con l'anteprima per questo quiz." });
    const payload = (pack as any).payload || {};
    return res.json({
      ok: true,
      pack: {
        slug: (pack as any).boardSlug,
        title: (pack as any).title,
        cover: (pack as any).boardIconUrl || payload.cover || "",
        kind: "playlist",
        deezerId: id,
        trackCount: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
        plays: Number(payload.plays || 0),
      },
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: "deezer_error", message: String(err?.message || "") });
  }
}

async function handleMusicQuizSessionStartPost(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    pruneSessions();
    const body = req.body || {};
    let slug = String(body.slug || body.packSlug || "").trim();
    const source = String(body.source || "").trim();
    const deezerId = String(body.deezerId || "").trim();
    if (!slug && (source === "artist" || source === "playlist") && deezerId) {
      const pack = await ensureDeezerPack(source, deezerId);
      if (!pack) return res.status(404).json({ ok: false, error: "not_found", message: "Deezer non ha abbastanza brani con l'anteprima per questo quiz." });
      slug = String((pack as any).boardSlug);
    }
    const difficulty = parseDifficulty(body.difficulty);
    const mode = String(body.mode || "solo").trim() || "solo";
    const loaded = await loadPackTracks(slug);
    if (!loaded) return res.status(404).json({ ok: false, error: "not_found", message: "Quiz non trovato." });
    const built = await buildRoundsWithArtists(loaded.tracks);
    const rounds = built ? await refreshPreviews(built) : null;
    if (!rounds || rounds.length < 4) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: "Servono almeno 4 brani con l'anteprima disponibile." });
    }
    const id = crypto.randomBytes(16).toString("hex");
    const session: Session = {
      id,
      userId: auth.userId || "guest",
      packSlug: slug,
      difficulty,
      mode,
      rounds,
      answers: [],
      servedAt: [Date.now()],
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(id, session);
    await SiteDocument.updateOne(
      { docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug },
      { $inc: { "payload.plays": 1 } },
    ).catch(() => {});
    return res.json({
      ok: true,
      sessionId: id,
      difficulty,
      mode,
      packSlug: slug,
      packTitle: (loaded.pack as any).title || slug,
      packCover: (loaded.pack as any).boardIconUrl || loaded.payload?.cover || "",
      round: publicRound(rounds[0]!, rounds.length),
      /* tutti i brani della partita: il browser li scarica in anticipo e la domanda parte subito */
      upcoming: rounds.map((r) => r.previewUrl),
      clipMs: DIFF_MS[difficulty],
      answerMs: ANSWER_MS,
    });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] start:", err?.message || err);
    return res.status(500).json({ ok: false, error: "start_error" });
  }
}

async function handleMusicQuizSessionAnswerPost(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const body = req.body || {};
    const sessionId = String(body.sessionId || "").trim();
    const session = sessions.get(sessionId);
    if (!session || session.userId !== (auth.userId || "guest")) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }
    if (session.expiresAt < Date.now()) {
      sessions.delete(sessionId);
      return res.status(410).json({ ok: false, error: "session_expired" });
    }
    const index = Number(body.index);
    /* -1 = tempo scaduto senza risposta */
    const choice = Number.isInteger(Number(body.choice)) ? Number(body.choice) : -1;
    if (!Number.isInteger(index) || index !== session.answers.length || index >= session.rounds.length) {
      return res.status(400).json({ ok: false, error: "bad_index" });
    }
    /* il tempo lo misura il browser da quando parte il brano, ma non può essere più lungo di quanto è passato davvero */
    const served = session.servedAt[index] || Date.now();
    const ms = Math.min(Math.max(0, Number(body.ms) || 0), Date.now() - served, ANSWER_MS);
    const round = session.rounds[index]!;
    const correct = choice === round.correctIndex;
    const points = correct ? pointsFor(ms) : 0;
    session.answers.push({ index, choice, correct, points, ms });
    const score = session.answers.reduce((s, a) => s + a.points, 0);
    const next = session.rounds[index + 1];
    if (next) session.servedAt[index + 1] = Date.now();
    return res.json({
      ok: true,
      correct,
      points,
      score,
      correctIndex: round.correctIndex,
      title: round.title,
      artist: round.artist,
      cover: round.cover,
      nextRound: next ? publicRound(next, session.rounds.length) : null,
      done: !next,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "answer_error" });
  }
}

async function handleMusicQuizSessionFinishPost(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const body = req.body || {};
    const sessionId = String(body.sessionId || "").trim();
    const session = sessions.get(sessionId);
    if (!session || session.userId !== (auth.userId || "guest")) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }
    const score = session.answers.reduce((s, a) => s + a.points, 0);
    const maxScore = session.rounds.length * 100;
    const correctCount = session.answers.filter((a) => a.correct).length;
    /* ospite: si gioca e basta, niente statistiche né EXP */
    if (auth.guest) {
      sessions.delete(sessionId);
      return res.json({
        ok: true,
        score,
        best: score,
        maxScore,
        saved: false,
        reward: { auth: "guest", exp: 0 },
        packSlug: session.packSlug,
        difficulty: session.difficulty,
        correctCount,
        rounds: session.rounds.length,
      });
    }
    const existing = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_SCORE,
      userId: auth.userId,
      boardSlug: session.packSlug,
      "payload.difficulty": session.difficulty,
      "payload.mode": session.mode || "solo",
    });
    let best = score;
    let saved = false;
    if (!existing) {
      await SiteDocument.create({
        docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_SCORE,
        userId: auth.userId,
        boardSlug: session.packSlug,
        authorName: auth.displayName,
        authorAvatarUrl: auth.avatarUrl,
        rating: Math.max(1, Math.min(5, Math.ceil(score / 200) || 1)),
        payload: {
          score,
          difficulty: session.difficulty,
          mode: session.mode || "solo",
          maxScore,
          answers: session.answers.length,
        },
      });
      saved = true;
    } else {
      const prev = Number((existing as any).payload?.score || 0);
      if (score >= prev) {
        (existing as any).payload = {
          ...((existing as any).payload || {}),
          score,
          maxScore,
          answers: session.answers.length,
        };
        (existing as any).authorName = auth.displayName;
        (existing as any).authorAvatarUrl = auth.avatarUrl;
        (existing as any).rating = Math.max(1, Math.min(5, Math.ceil(score / 200) || 1));
        await existing.save();
        saved = true;
      }
      best = Math.max(prev, score);
    }
    sessions.delete(sessionId);
    /* nel server Discord: EXP in base a come è andata (con un tetto al giorno per tutti i quiz) */
    const { claimQuizExp } = require("./siteQuizRewards") as typeof import("./siteQuizRewards");
    const reward = auth.inGuild
      ? await claimQuizExp(client, auth, { game: "music", ratio: maxScore ? score / maxScore : 0 }).catch(() => ({ auth: "member", exp: 0 }))
      : { auth: "outsider", exp: 0 };
    return res.json({
      ok: true,
      score,
      best,
      maxScore,
      saved,
      reward,
      packSlug: session.packSlug,
      difficulty: session.difficulty,
      correctCount: session.answers.filter((a) => a.correct).length,
      rounds: session.rounds.length,
    });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] finish:", err?.message || err);
    return res.status(500).json({ ok: false, error: "finish_error" });
  }
}

export = {
  ROUNDS,
  DIFF_MS,
  ensureDeezerPack,
  ensureSpotifyPack,
  loadPackTracks,
  handleMusicQuizSearchGet,
  handleMusicQuizHubGet,
  handleMusicQuizArtistGet,
  handleMusicQuizPlaylistGet,
  handleMusicQuizArtistTitlesGet,
  handleMusicQuizSimilarGet,
  handleMusicQuizSessionStartPost,
  handleMusicQuizSessionAnswerPost,
  handleMusicQuizSessionFinishPost,
};
