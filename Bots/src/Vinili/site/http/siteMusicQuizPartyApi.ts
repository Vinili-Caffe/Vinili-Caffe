/**
 * Music Quiz: partite di gruppo («party», tutti rispondono) e «stream» (chi ospita guida la partita in diretta).
 *
 * - Chi crea la stanza la avvia; le domande partono per tutti insieme.
 * - Ognuno ha ANSWER_MS per rispondere: i punti dipendono da quando ha risposto lui.
 * - Il turno si chiude quando hanno risposto tutti o allo scadere del tempo (anche se qualcuno non risponde).
 * - Dopo il risultato chi ospita passa alla domanda successiva; all'ultima si vede la classifica.
 */
const crypto = require("crypto") as typeof import("crypto");
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { ensureDeezerPack, loadPackTracks } = require("./siteMusicQuizApi") as typeof import("./siteMusicQuizApi");
const { ANSWER_MS, DIFF_MS, buildRounds, refreshPreviews, pointsFor, parseDifficulty } =
  require("./siteMusicQuizRounds") as typeof import("./siteMusicQuizRounds");
const { broadcastSiteMusicQuizParty } =
  require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");

type QuizRound = import("./siteMusicQuizRounds").QuizRound;
type DiffKey = import("./siteMusicQuizRounds").DiffKey;

type PartyPlayer = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  score: number;
  choice: number | null;
  answerMs: number | null;
  lastPoints: number;
  correctCount: number;
};

type PartyRoom = {
  roomId: string;
  hostId: string;
  mode: "party" | "stream";
  packSlug: string;
  packTitle: string;
  packCover: string;
  difficulty: DiffKey;
  status: "lobby" | "playing" | "round_result" | "finished";
  roundIndex: number;
  rounds: QuizRound[];
  players: PartyPlayer[];
  roundStartedAt: number;
  createdAt: number;
  timer: NodeJS.Timeout | null;
};

const MAX_PLAYERS = 20;
/* margine per chi carica il brano un po' dopo */
const GRACE_MS = 1500;
const rooms = new Map<string, PartyRoom>();

function pruneRooms() {
  const cutoff = Date.now() - 3 * 60 * 60_000;
  for (const [id, r] of rooms) {
    if (r.createdAt < cutoff) {
      if (r.timer) clearTimeout(r.timer);
      rooms.delete(id);
    }
  }
}

function publicRoom(room: PartyRoom, viewerId: string) {
  const round = room.rounds[room.roundIndex];
  const revealed = room.status === "round_result" || room.status === "finished";
  const me = room.players.find((p) => p.userId === viewerId);
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    mode: room.mode,
    packSlug: room.packSlug,
    packTitle: room.packTitle,
    packCover: room.packCover,
    difficulty: room.difficulty,
    status: room.status,
    roundIndex: room.roundIndex,
    totalRounds: room.rounds.length,
    clipMs: DIFF_MS[room.difficulty] || 5000,
    answerMs: ANSWER_MS,
    serverNow: Date.now(),
    players: room.players
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        score: p.score,
        hasAnswered: p.choice != null,
        lastPoints: revealed ? p.lastPoints : 0,
        choice: revealed ? p.choice : null,
        correctCount: p.correctCount,
      }))
      .sort((a, b) => b.score - a.score),
    myChoice: me?.choice ?? null,
    round:
      round && room.status !== "lobby"
        ? {
            index: round.index,
            total: room.rounds.length,
            previewUrl: round.previewUrl,
            options: round.options,
            start: round.start || 0,
            correctIndex: revealed ? round.correctIndex : undefined,
            title: revealed ? round.title : undefined,
            artist: revealed ? round.artist : undefined,
            cover: revealed ? round.cover : undefined,
          }
        : null,
    roundStartedAt: room.roundStartedAt,
    /* i prossimi brani, da scaricare in anticipo */
    upcoming: room.rounds.slice(Math.max(0, room.roundIndex), room.roundIndex + 3).map((r) => r.previewUrl),
  };
}

/** Chiude il turno: punti a chi ha risposto giusto, in base a quando ha risposto. */
function reveal(room: PartyRoom) {
  if (room.status !== "playing") return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const round = room.rounds[room.roundIndex]!;
  for (const p of room.players) {
    const right = p.choice === round.correctIndex;
    p.lastPoints = right ? pointsFor(p.answerMs ?? ANSWER_MS) : 0;
    p.score += p.lastPoints;
    if (right) p.correctCount += 1;
  }
  room.status = "round_result";
  broadcastSiteMusicQuizParty(room.roomId, "reveal");
}

function startRound(room: PartyRoom) {
  room.status = "playing";
  room.roundStartedAt = Date.now();
  for (const p of room.players) {
    p.choice = null;
    p.answerMs = null;
    p.lastPoints = 0;
  }
  if (room.timer) clearTimeout(room.timer);
  /* allo scadere del tempo il turno si chiude anche se qualcuno non ha risposto */
  room.timer = setTimeout(() => reveal(room), ANSWER_MS + GRACE_MS);
  room.timer.unref?.();
}

function player(auth: any): PartyPlayer {
  return {
    userId: auth.userId,
    displayName: auth.displayName,
    avatarUrl: auth.avatarUrl,
    score: 0,
    choice: null,
    answerMs: null,
    lastPoints: 0,
    correctCount: 0,
  };
}

async function handleMusicQuizPartyCreatePost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    pruneRooms();
    const body = req.body || {};
    let slug = String(body.slug || body.packSlug || "").trim();
    const source = String(body.source || "").trim();
    const deezerId = String(body.deezerId || "").trim();
    if (!slug && (source === "artist" || source === "playlist") && deezerId) {
      const pack = await ensureDeezerPack(source as any, deezerId);
      if (!pack) return res.status(404).json({ ok: false, error: "not_found", message: "Quiz non trovato." });
      slug = String((pack as any).boardSlug);
    }
    const loaded = await loadPackTracks(slug);
    if (!loaded) return res.status(404).json({ ok: false, error: "not_found", message: "Quiz non trovato." });
    const built = buildRounds(loaded.tracks);
    const rounds = built ? await refreshPreviews(built) : null;
    if (!rounds || rounds.length < 4) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: "Servono almeno 4 brani con l'anteprima disponibile." });
    }
    const roomId = crypto.randomBytes(5).toString("hex");
    const room: PartyRoom = {
      roomId,
      hostId: auth.userId,
      mode: body.mode === "stream" ? "stream" : "party",
      packSlug: slug,
      packTitle: String((loaded.pack as any).title || slug),
      packCover: String((loaded.pack as any).boardIconUrl || loaded.payload?.cover || ""),
      difficulty: parseDifficulty(body.difficulty),
      status: "lobby",
      roundIndex: 0,
      rounds,
      players: [player(auth)],
      roundStartedAt: 0,
      createdAt: Date.now(),
      timer: null,
    };
    rooms.set(roomId, room);
    broadcastSiteMusicQuizParty(roomId, "created");
    return res.json({ ok: true, room: publicRoom(room, auth.userId) });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] party create:", err?.message || err);
    return res.status(500).json({ ok: false, error: "party_create_error", message: "Non sono riuscito a creare la stanza." });
  }
}

async function handleMusicQuizPartyGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  const room = rooms.get(String(req.params?.roomId || "").trim());
  if (!room) return res.status(404).json({ ok: false, error: "not_found", message: "Questa stanza non esiste più." });
  if (room.status === "playing" && Date.now() > room.roundStartedAt + ANSWER_MS + GRACE_MS) reveal(room);
  return res.json({ ok: true, room: publicRoom(room, auth.userId) });
}

async function handleMusicQuizPartyJoinPost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  const roomId = String(req.params?.roomId || req.body?.roomId || "").trim();
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ ok: false, error: "not_found", message: "Questa stanza non esiste più." });
  if (!room.players.some((p) => p.userId === auth.userId)) {
    /* si può entrare anche a partita iniziata: si parte da zero punti */
    if (room.players.length >= MAX_PLAYERS) return res.status(400).json({ ok: false, error: "full", message: "La stanza è piena." });
    if (room.status === "finished") return res.status(400).json({ ok: false, error: "finished", message: "Questa partita è già finita." });
    room.players.push(player(auth));
    broadcastSiteMusicQuizParty(roomId, "join");
  }
  return res.json({ ok: true, room: publicRoom(room, auth.userId) });
}

async function handleMusicQuizPartyActionPost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  const roomId = String(req.params?.roomId || "").trim();
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ ok: false, error: "not_found", message: "Questa stanza non esiste più." });
  const body = req.body || {};
  const action = String(body.action || "").trim();
  const me = room.players.find((p) => p.userId === auth.userId);
  if (!me) return res.status(403).json({ ok: false, error: "not_in_room", message: "Non sei in questa stanza." });
  const isHost = room.hostId === auth.userId;

  if (action === "start") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only", message: "Solo chi ha creato la stanza può avviarla." });
    if (room.status !== "lobby") return res.status(400).json({ ok: false, error: "bad_state" });
    room.roundIndex = 0;
    for (const p of room.players) {
      p.score = 0;
      p.correctCount = 0;
    }
    startRound(room);
  } else if (action === "answer") {
    if (room.status !== "playing") return res.status(400).json({ ok: false, error: "bad_state", message: "Il turno è già chiuso." });
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return res.status(400).json({ ok: false, error: "bad_choice" });
    if (me.choice == null) {
      me.choice = choice;
      /* tempo dal browser (da quando è partito il brano), mai oltre quello passato davvero */
      const elapsed = Date.now() - room.roundStartedAt;
      me.answerMs = Math.min(Math.max(0, Number(body.ms) || elapsed), elapsed, ANSWER_MS);
    }
    if (room.players.every((p) => p.choice != null)) reveal(room);
  } else if (action === "reveal") {
    /* chi ospita può chiudere il turno prima (utile in diretta) */
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    reveal(room);
  } else if (action === "next") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only", message: "Solo chi ha creato la stanza può andare avanti." });
    if (room.status !== "round_result") return res.status(400).json({ ok: false, error: "bad_state" });
    if (room.roundIndex + 1 >= room.rounds.length) room.status = "finished";
    else {
      room.roundIndex += 1;
      startRound(room);
    }
  } else if (action === "restart") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    if (room.status !== "finished") return res.status(400).json({ ok: false, error: "bad_state" });
    const loaded = await loadPackTracks(room.packSlug);
    const built = loaded ? buildRounds(loaded.tracks) : null;
    const rounds = built ? await refreshPreviews(built) : null;
    if (!rounds || rounds.length < 4) return res.status(400).json({ ok: false, error: "not_enough_tracks" });
    room.rounds = rounds;
    room.roundIndex = 0;
    room.status = "lobby";
    for (const p of room.players) {
      p.score = 0;
      p.correctCount = 0;
      p.choice = null;
      p.lastPoints = 0;
    }
  } else {
    return res.status(400).json({ ok: false, error: "bad_action" });
  }

  broadcastSiteMusicQuizParty(roomId, action);
  return res.json({ ok: true, room: publicRoom(room, auth.userId) });
}

export = {
  handleMusicQuizPartyCreatePost,
  handleMusicQuizPartyGet,
  handleMusicQuizPartyJoinPost,
  handleMusicQuizPartyActionPost,
};
