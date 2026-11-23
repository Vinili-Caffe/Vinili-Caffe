/**
 * Music Quiz party/stream: lobby stile Quizei (coda multi-pack, settings, chat),
 * codice stanza a 6 cifre, sync realtime via broadcast.
 */
const crypto = require("crypto") as typeof import("crypto");
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { ensureDeezerPack, loadPackTracks } = require("./siteMusicQuizApi") as typeof import("./siteMusicQuizApi");
const { ANSWER_MS, DIFF_MS, buildRounds, refreshPreviews, parseDifficulty } =
  require("./siteMusicQuizRounds") as typeof import("./siteMusicQuizRounds");
const { broadcastSiteMusicQuizParty } =
  require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");

type QuizRound = import("./siteMusicQuizRounds").QuizRound;
type DiffKey = import("./siteMusicQuizRounds").DiffKey;

const ANSWER_CHOICES = [15_000, 30_000, 45_000, 60_000, 90_000, 120_000] as const;
const DEFAULT_MAX_PLAYERS = 8;
const CHAT_CAP = 100;
const GRACE_MS = 1500;
const AUTO_NEXT_MS = 5_000;
const MIN_START_PLAYERS = 2;

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

type QueueItem = {
  id: string;
  packSlug: string;
  title: string;
  cover: string;
  difficulty: DiffKey;
};

type PartySettings = {
  locked: boolean;
  chatEnabled: boolean;
  answerMs: number;
  autoNext: boolean;
  presentationMode: boolean;
  leaderboard: "always" | "end" | "never";
  queueActive: boolean;
  queueVisible: "all" | "host";
  queueAdd: "host" | "all";
};

type ChatMsg = { id: string; userId: string; name: string; text: string; at: number };
type Reaction = { id: string; userId: string; name: string; emoji: string; at: number };

/** reazioni permesse durante la partita (niente testo libero: niente moderazione da fare) */
const REACTIONS = ["🔥", "😂", "😮", "👏", "😭", "🎉", "❤️", "🤯"];
const REACTION_SHOW_MS = 6_000;

type PartyRoom = {
  roomId: string;
  roomName: string;
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
  queue: QueueItem[];
  settings: PartySettings;
  chat: ChatMsg[];
  reactions: Reaction[];
  /** espulsi dall'host: non possono rientrare in questa stanza */
  kicked: string[];
  maxPlayers: number;
  roundStartedAt: number;
  createdAt: number;
  timer: NodeJS.Timeout | null;
  autoNextTimer: NodeJS.Timeout | null;
};

const rooms = new Map<string, PartyRoom>();

function defaultSettings(): PartySettings {
  return {
    locked: false,
    chatEnabled: true,
    answerMs: ANSWER_MS,
    autoNext: true,
    presentationMode: false,
    leaderboard: "always",
    queueActive: true,
    queueVisible: "all",
    queueAdd: "host",
  };
}

function pruneRooms() {
  const cutoff = Date.now() - 3 * 60 * 60_000;
  for (const [id, r] of rooms) {
    if (r.createdAt < cutoff) {
      if (r.timer) clearTimeout(r.timer);
      if (r.autoNextTimer) clearTimeout(r.autoNextTimer);
      rooms.delete(id);
    }
  }
}

function allocRoomId(): string {
  for (let i = 0; i < 40; i++) {
    const id = String(100_000 + crypto.randomInt(900_000));
    if (!rooms.has(id)) return id;
  }
  return String(Date.now() % 1_000_000).padStart(6, "0");
}

function parseAnswerMs(raw: unknown): number {
  const n = Number(raw);
  return (ANSWER_CHOICES as readonly number[]).includes(n) ? n : ANSWER_MS;
}

function scorePoints(ms: number, totalMs: number): number {
  const t = Math.max(0, Math.min(1, ms / Math.max(1000, totalMs)));
  return Math.round(1000 * (1 - t) * (1 - t));
}

function publicQueue(room: PartyRoom, viewerId: string) {
  const isHost = room.hostId === viewerId;
  if (room.settings.queueVisible === "host" && !isHost) return [];
  return room.queue;
}

function publicRoom(room: PartyRoom, viewerId: string) {
  const round = room.rounds[room.roundIndex];
  const revealed = room.status === "round_result" || room.status === "finished";
  const me = room.players.find((p) => p.userId === viewerId);
  const showLb =
    room.settings.leaderboard === "always" ||
    (room.settings.leaderboard === "end" && room.status === "finished");
  return {
    roomId: room.roomId,
    roomName: room.roomName,
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
    answerMs: room.settings.answerMs,
    serverNow: Date.now(),
    maxPlayers: room.maxPlayers,
    settings: { ...room.settings },
    queue: publicQueue(room, viewerId),
    chat: room.settings.chatEnabled ? room.chat.slice(-80) : [],
    reactions: room.settings.chatEnabled ? (room.reactions || []).filter((r) => Date.now() - r.at < REACTION_SHOW_MS) : [],
    players: room.players
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        score: showLb || room.status === "lobby" ? p.score : 0,
        hasAnswered: p.choice != null,
        lastPoints: revealed && showLb ? p.lastPoints : 0,
        choice: revealed ? p.choice : null,
        correctCount: showLb ? p.correctCount : 0,
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
    upcoming: room.rounds.slice(Math.max(0, room.roundIndex), room.roundIndex + 3).map((r) => r.previewUrl),
  };
}

function clearTimers(room: PartyRoom) {
  if (room.timer) clearTimeout(room.timer);
  if (room.autoNextTimer) clearTimeout(room.autoNextTimer);
  room.timer = null;
  room.autoNextTimer = null;
}

function advanceAfterReveal(room: PartyRoom) {
  if (room.roundIndex + 1 >= room.rounds.length) {
    room.status = "finished";
    if (room.settings.queueActive && room.queue.length > 1) {
      room.queue.shift();
      const next = room.queue[0];
      if (next) {
        room.packSlug = next.packSlug;
        room.packTitle = next.title;
        room.packCover = next.cover;
        room.difficulty = next.difficulty;
      }
    }
    broadcastSiteMusicQuizParty(room.roomId, "finished");
    return;
  }
  room.roundIndex += 1;
  startRound(room);
  broadcastSiteMusicQuizParty(room.roomId, "next");
}

function reveal(room: PartyRoom) {
  if (room.status !== "playing") return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const round = room.rounds[room.roundIndex]!;
  const total = room.settings.answerMs || ANSWER_MS;
  for (const p of room.players) {
    const right = p.choice === round.correctIndex;
    p.lastPoints = right ? scorePoints(p.answerMs ?? total, total) : 0;
    p.score += p.lastPoints;
    if (right) p.correctCount += 1;
  }
  room.status = "round_result";
  broadcastSiteMusicQuizParty(room.roomId, "reveal");
  if (room.settings.autoNext) {
    if (room.autoNextTimer) clearTimeout(room.autoNextTimer);
    room.autoNextTimer = setTimeout(() => {
      room.autoNextTimer = null;
      if (room.status !== "round_result") return;
      advanceAfterReveal(room);
    }, AUTO_NEXT_MS);
    room.autoNextTimer.unref?.();
  }
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
  if (room.autoNextTimer) clearTimeout(room.autoNextTimer);
  room.autoNextTimer = null;
  const ms = (room.settings.answerMs || ANSWER_MS) + GRACE_MS;
  room.timer = setTimeout(() => reveal(room), ms);
  room.timer.unref?.();
}

function player(auth: any, nick?: string): PartyPlayer {
  const name = String(nick || auth.displayName || "Player").trim().slice(0, 32) || auth.displayName;
  return {
    userId: auth.userId,
    displayName: name,
    avatarUrl: auth.avatarUrl,
    score: 0,
    choice: null,
    answerMs: null,
    lastPoints: 0,
    correctCount: 0,
  };
}

async function loadRoundsForSlug(slug: string) {
  const loaded = await loadPackTracks(slug);
  if (!loaded) return null;
  const built = buildRounds(loaded.tracks);
  const rounds = built ? await refreshPreviews(built) : null;
  if (!rounds || rounds.length < 4) return null;
  return { loaded, rounds };
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
    const packData = await loadRoundsForSlug(slug);
    if (!packData) {
      return res.status(400).json({
        ok: false,
        error: "not_enough_tracks",
        message: "Servono almeno 4 brani con l'anteprima disponibile.",
      });
    }
    const { loaded, rounds } = packData;
    const difficulty = parseDifficulty(body.difficulty);
    const title = String((loaded.pack as any).title || slug);
    const cover = String((loaded.pack as any).boardIconUrl || loaded.payload?.cover || "");
    const nick = String(body.displayName || "").trim().slice(0, 32);
    const host = player(auth, nick || undefined);
    const roomName =
      String(body.roomName || "").trim().slice(0, 40) || `${host.displayName}'s Room`;
    const roomId = allocRoomId();
    const queueItem: QueueItem = {
      id: crypto.randomBytes(4).toString("hex"),
      packSlug: slug,
      title,
      cover,
      difficulty,
    };
    const room: PartyRoom = {
      roomId,
      roomName,
      hostId: auth.userId,
      mode: body.mode === "stream" ? "stream" : "party",
      packSlug: slug,
      packTitle: title,
      packCover: cover,
      difficulty,
      status: "lobby",
      roundIndex: 0,
      rounds,
      players: [host],
      queue: [queueItem],
      settings: defaultSettings(),
      chat: [],
      reactions: [],
      kicked: [],
      maxPlayers: DEFAULT_MAX_PLAYERS,
      roundStartedAt: 0,
      createdAt: Date.now(),
      timer: null,
      autoNextTimer: null,
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
  const limit = room.settings.answerMs || ANSWER_MS;
  if (room.status === "playing" && Date.now() > room.roundStartedAt + limit + GRACE_MS) reveal(room);
  return res.json({ ok: true, room: publicRoom(room, auth.userId) });
}

async function handleMusicQuizPartyJoinPost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  const roomId = String(req.params?.roomId || req.body?.roomId || "").trim();
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ ok: false, error: "not_found", message: "Questa stanza non esiste più." });
  const nick = String(req.body?.displayName || "").trim().slice(0, 32);
  const existing = room.players.find((p) => p.userId === auth.userId);
  if (existing) {
    if (nick) existing.displayName = nick;
    return res.json({ ok: true, room: publicRoom(room, auth.userId) });
  }
  if ((room.kicked || []).includes(auth.userId)) {
    return res.status(403).json({ ok: false, error: "kicked", message: "L'host ti ha tolto da questa stanza." });
  }
  if (room.settings.locked) {
    return res.status(403).json({ ok: false, error: "locked", message: "La stanza è bloccata." });
  }
  if (room.players.length >= room.maxPlayers) {
    return res.status(400).json({ ok: false, error: "full", message: "La stanza è piena." });
  }
  if (room.status === "finished") {
    return res.status(400).json({ ok: false, error: "finished", message: "Questa partita è già finita." });
  }
  room.players.push(player(auth, nick || undefined));
  broadcastSiteMusicQuizParty(roomId, "join");
  return res.json({ ok: true, room: publicRoom(room, auth.userId) });
}

async function resolvePackSlug(body: any): Promise<{ slug: string; title: string; cover: string } | null> {
  let slug = String(body.slug || body.packSlug || "").trim();
  const source = String(body.source || "").trim();
  const deezerId = String(body.deezerId || "").trim();
  if (!slug && (source === "artist" || source === "playlist") && deezerId) {
    const pack = await ensureDeezerPack(source as any, deezerId);
    if (!pack) return null;
    slug = String((pack as any).boardSlug);
  }
  if (!slug) return null;
  const loaded = await loadPackTracks(slug);
  if (!loaded) return null;
  return {
    slug,
    title: String((loaded.pack as any).title || slug),
    cover: String((loaded.pack as any).boardIconUrl || loaded.payload?.cover || ""),
  };
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

  if (action === "settings") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    const s = body.settings && typeof body.settings === "object" ? body.settings : body;
    if (typeof s.locked === "boolean") room.settings.locked = s.locked;
    if (typeof s.chatEnabled === "boolean") room.settings.chatEnabled = s.chatEnabled;
    if (s.answerMs != null) room.settings.answerMs = parseAnswerMs(s.answerMs);
    if (typeof s.autoNext === "boolean") room.settings.autoNext = s.autoNext;
    if (typeof s.presentationMode === "boolean") room.settings.presentationMode = s.presentationMode;
    if (s.leaderboard === "always" || s.leaderboard === "end" || s.leaderboard === "never") {
      room.settings.leaderboard = s.leaderboard;
    }
    if (typeof s.queueActive === "boolean") room.settings.queueActive = s.queueActive;
    if (s.queueVisible === "all" || s.queueVisible === "host") room.settings.queueVisible = s.queueVisible;
    if (s.queueAdd === "host" || s.queueAdd === "all") room.settings.queueAdd = s.queueAdd;
    if (body.roomName != null) {
      const name = String(body.roomName || "").trim().slice(0, 40);
      if (name) room.roomName = name;
    }
    if (body.maxPlayers != null) {
      const m = Math.max(2, Math.min(20, Number(body.maxPlayers) || DEFAULT_MAX_PLAYERS));
      room.maxPlayers = m;
    }
  } else if (action === "chat") {
    if (!room.settings.chatEnabled) {
      return res.status(400).json({ ok: false, error: "chat_off", message: "Chat disattivata." });
    }
    const text = String(body.text || body.message || "").trim().slice(0, 280);
    if (!text) return res.status(400).json({ ok: false, error: "empty" });
    room.chat.push({
      id: crypto.randomBytes(4).toString("hex"),
      userId: auth.userId,
      name: me.displayName,
      text,
      at: Date.now(),
    });
    if (room.chat.length > CHAT_CAP) room.chat.splice(0, room.chat.length - CHAT_CAP);
  } else if (action === "queue_add") {
    if (room.settings.queueAdd === "host" && !isHost) {
      return res.status(403).json({ ok: false, error: "host_only", message: "Solo l'host può aggiungere giochi." });
    }
    if (room.queue.length >= 20) {
      return res.status(400).json({ ok: false, error: "queue_full", message: "Coda piena." });
    }
    const pack = await resolvePackSlug(body);
    if (!pack) return res.status(404).json({ ok: false, error: "not_found", message: "Quiz non trovato." });
    const difficulty = parseDifficulty(body.difficulty || room.difficulty);
    room.queue.push({
      id: crypto.randomBytes(4).toString("hex"),
      packSlug: pack.slug,
      title: pack.title,
      cover: pack.cover,
      difficulty,
    });
  } else if (action === "queue_remove") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    const id = String(body.id || body.queueId || "").trim();
    if (room.queue.length <= 1) {
      return res.status(400).json({ ok: false, error: "last_item", message: "Serve almeno un gioco in coda." });
    }
    const idx = room.queue.findIndex((q) => q.id === id);
    if (idx < 0) return res.status(404).json({ ok: false, error: "not_found" });
    if (idx === 0 && room.status !== "lobby") {
      return res.status(400).json({ ok: false, error: "busy", message: "Non puoi togliere il gioco in corso." });
    }
    room.queue.splice(idx, 1);
    if (idx === 0 && room.status === "lobby") {
      const head = room.queue[0]!;
      room.packSlug = head.packSlug;
      room.packTitle = head.title;
      room.packCover = head.cover;
      room.difficulty = head.difficulty;
      const packData = await loadRoundsForSlug(head.packSlug);
      if (packData) room.rounds = packData.rounds;
    }
  } else if (action === "queue_move") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    const id = String(body.id || body.queueId || "").trim();
    const dir = Number(body.dir) || 0;
    const idx = room.queue.findIndex((q) => q.id === id);
    if (idx < 0) return res.status(404).json({ ok: false, error: "not_found" });
    const j = idx + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= room.queue.length) return res.json({ ok: true, room: publicRoom(room, auth.userId) });
    if (room.status !== "lobby" && (idx === 0 || j === 0)) {
      return res.status(400).json({ ok: false, error: "busy" });
    }
    const tmp = room.queue[idx]!;
    room.queue[idx] = room.queue[j]!;
    room.queue[j] = tmp;
    if (room.status === "lobby") {
      const head = room.queue[0]!;
      room.packSlug = head.packSlug;
      room.packTitle = head.title;
      room.packCover = head.cover;
      room.difficulty = head.difficulty;
    }
  } else if (action === "queue_play") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    if (room.status !== "lobby" && room.status !== "finished") {
      return res.status(400).json({ ok: false, error: "bad_state" });
    }
    const id = String(body.id || body.queueId || "").trim();
    const idx = room.queue.findIndex((q) => q.id === id);
    if (idx < 0) return res.status(404).json({ ok: false, error: "not_found" });
    if (idx > 0) {
      const [item] = room.queue.splice(idx, 1);
      room.queue.unshift(item!);
    }
    const head = room.queue[0]!;
    room.packSlug = head.packSlug;
    room.packTitle = head.title;
    room.packCover = head.cover;
    room.difficulty = head.difficulty;
    room.status = "lobby";
    clearTimers(room);
  } else if (action === "start") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only", message: "Solo chi ha creato la stanza può avviarla." });
    if (room.status !== "lobby") return res.status(400).json({ ok: false, error: "bad_state" });
    if (room.players.length < MIN_START_PLAYERS) {
      return res.status(400).json({
        ok: false,
        error: "need_players",
        message: `Servono almeno ${MIN_START_PLAYERS} giocatori per iniziare.`,
      });
    }
    if (!room.queue.length) {
      return res.status(400).json({ ok: false, error: "empty_queue", message: "Aggiungi un quiz in coda." });
    }
    const head = room.queue[0]!;
    room.packSlug = head.packSlug;
    room.packTitle = head.title;
    room.packCover = head.cover;
    room.difficulty = head.difficulty;
    const packData = await loadRoundsForSlug(head.packSlug);
    if (!packData) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: "Quiz non pronto." });
    }
    room.rounds = packData.rounds;
    room.roundIndex = 0;
    for (const p of room.players) {
      p.score = 0;
      p.correctCount = 0;
    }
    room.settings.locked = true;
    startRound(room);
  } else if (action === "answer") {
    if (room.status !== "playing") return res.status(400).json({ ok: false, error: "bad_state", message: "Il turno è già chiuso." });
    if (room.mode === "stream" && isHost && !room.settings.presentationMode) {
      return res.status(400).json({ ok: false, error: "host_stream", message: "In diretta l'host non risponde." });
    }
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return res.status(400).json({ ok: false, error: "bad_choice" });
    const total = room.settings.answerMs || ANSWER_MS;
    if (me.choice == null) {
      me.choice = choice;
      const elapsed = Date.now() - room.roundStartedAt;
      me.answerMs = Math.min(Math.max(0, Number(body.ms) || elapsed), elapsed, total);
    }
    const voters = room.settings.presentationMode
      ? room.players
      : room.mode === "stream"
        ? room.players.filter((p) => p.userId !== room.hostId)
        : room.players;
    if (voters.length && voters.every((p) => p.choice != null)) reveal(room);
  } else if (action === "reveal") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    reveal(room);
  } else if (action === "next") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only", message: "Solo chi ha creato la stanza può andare avanti." });
    if (room.status !== "round_result") return res.status(400).json({ ok: false, error: "bad_state" });
    if (room.autoNextTimer) clearTimeout(room.autoNextTimer);
    room.autoNextTimer = null;
    advanceAfterReveal(room);
  } else if (action === "restart") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only" });
    if (room.status !== "finished") return res.status(400).json({ ok: false, error: "bad_state" });
    const head = room.queue[0];
    const slug = head?.packSlug || room.packSlug;
    const packData = await loadRoundsForSlug(slug);
    if (!packData) return res.status(400).json({ ok: false, error: "not_enough_tracks" });
    room.rounds = packData.rounds;
    room.roundIndex = 0;
    room.status = "lobby";
    room.settings.locked = false;
    clearTimers(room);
    for (const p of room.players) {
      p.score = 0;
      p.correctCount = 0;
      p.choice = null;
      p.lastPoints = 0;
    }
  } else if (action === "react") {
    /* reazioni con le emoji durante la partita (valgono finché la chat è attiva) */
    if (!room.settings.chatEnabled) return res.status(400).json({ ok: false, error: "chat_off", message: "Reazioni disattivate." });
    const emoji = String(body.emoji || "");
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ ok: false, error: "bad_emoji" });
    const mine = (room.reactions || []).filter((r) => r.userId === auth.userId && Date.now() - r.at < 1_500);
    if (mine.length >= 3) return res.json({ ok: true, room: publicRoom(room, auth.userId) });
    room.reactions = [
      ...(room.reactions || []).filter((r) => Date.now() - r.at < REACTION_SHOW_MS),
      { id: crypto.randomBytes(4).toString("hex"), userId: auth.userId, name: me.displayName, emoji, at: Date.now() },
    ].slice(-40);
  } else if (action === "kick") {
    if (!isHost) return res.status(403).json({ ok: false, error: "host_only", message: "Solo l'host può togliere qualcuno." });
    const target = String(body.userId || "");
    if (!target || target === room.hostId) return res.status(400).json({ ok: false, error: "bad_target" });
    const before = room.players.length;
    room.players = room.players.filter((p) => p.userId !== target);
    if (room.players.length !== before) room.kicked = [...new Set([...(room.kicked || []), target])];
  } else if (action === "leave") {
    room.players = room.players.filter((p) => p.userId !== auth.userId);
    if (!room.players.length) {
      /* stanza vuota: si chiude */
      clearTimers(room);
      rooms.delete(roomId);
      broadcastSiteMusicQuizParty(roomId, "closed");
      return res.json({ ok: true, left: true });
    }
    /* se esce l'host passa al primo arrivato */
    if (isHost) room.hostId = room.players[0]!.userId;
    broadcastSiteMusicQuizParty(roomId, "leave");
    return res.json({ ok: true, left: true });
  } else if (action === "nick") {
    const nick = String(body.displayName || body.nick || "").trim().slice(0, 32);
    if (nick) me.displayName = nick;
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
