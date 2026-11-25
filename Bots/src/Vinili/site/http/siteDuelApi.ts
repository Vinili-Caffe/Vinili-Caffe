/**
 * Allenamento e sfide a un amico per Wordle, Quordle e Angle.
 * Sfida: due giocatori, stessa parola (o angolo), vince chi indovina per primo. Ognuno vede nome e foto dell'altro
 * (chi non ha fatto l'accesso compare come «Ospite»).
 * Allenamento: una partita da soli con una parola (o un angolo) a caso. Niente EXP, niente statistiche.
 * Le stanze stanno in memoria per qualche ora: dopo non servono più.
 */
"use strict";

const crypto = require("node:crypto") as typeof import("node:crypto");

const wordle = require("../../Minigames/services/wordleService") as typeof import("../../Minigames/services/wordleService");

type Game = "wordle" | "quad" | "angle";
type Player = { token: string; guesses: string[]; solved: boolean; done: boolean; at: number; name: string; avatar: string; userId: string };
type Room = {
  id: string;
  game: Game;
  mode: "duel" | "practice";
  lang: string;
  createdAt: number;
  startedAt: number;
  /* wordle: una parola; quad: quattro */
  answers: string[];
  /* angle: angolo interno e rotazione della figura */
  angle: number;
  rotation: number;
  players: Player[];
  /* indice del vincitore, -1 = pari, null = in corso */
  winner: number | null;
};

const rooms = new Map<string, Room>();
const TTL = 6 * 3600_000;
const MAX_ROOMS = 20_000;
const ANGLE_ATTEMPTS = 4;

const rid = (n = 8) => crypto.randomBytes(n).toString("base64url").slice(0, n);

function prune() {
  const now = Date.now();
  for (const [k, r] of rooms) if (now - r.createdAt > TTL) rooms.delete(k);
  while (rooms.size > MAX_ROOMS) {
    const first = rooms.keys().next().value;
    if (first == null) break;
    rooms.delete(first);
  }
}

function maxAttempts(r: Room) {
  return r.game === "angle" ? ANGLE_ATTEMPTS : r.game === "quad" ? wordle.QUAD_MAX_ATTEMPTS : wordle.MAX_ATTEMPTS;
}

function pickWords(lang: string, n: number) {
  const bank = wordle.getAnswers(lang);
  const out = new Set<string>();
  while (out.size < n && out.size < bank.length) out.add(bank[crypto.randomInt(bank.length)]);
  return [...out];
}

function isSolved(r: Room, guesses: string[]) {
  if (r.game === "angle") return guesses.some((g) => Number(g) === r.angle);
  return r.answers.every((a) => guesses.some((g) => wordle.normalizeWord(g) === wordle.normalizeWord(a)));
}

function settle(r: Room) {
  if (r.winner != null) return;
  if (r.mode === "practice") {
    const p = r.players[0];
    if (p?.done) r.winner = p.solved ? 0 : -1;
    return;
  }
  if (r.players.length < 2) return;
  /* vince chi ha indovinato per primo */
  const solvers = r.players
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.solved)
    .sort((a, b) => a.p.at - b.p.at);
  if (solvers.length) r.winner = solvers[0].i;
  else if (r.players.every((p) => p.done)) r.winner = -1;
}

/** per ogni parola: le righe fino a quando è stata indovinata */
function boardsFor(r: Room, guesses: string[]) {
  return r.answers.map((answer) => {
    const rows: { guess: string; marks: string[] }[] = [];
    let won = false;
    for (const g of guesses) {
      if (won) break;
      rows.push({ guess: g.toUpperCase(), marks: wordle.scoreGuess(answer, g) });
      if (wordle.normalizeWord(g) === wordle.normalizeWord(answer)) won = true;
    }
    return { rows, won };
  });
}

/** chi gioca: nome e foto dall'accesso, altrimenti «Ospite» */
async function whoIs(client: any, req: any) {
  try {
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const v = await musicQuizViewer(client, req);
    if (v.guest || !v.userId) return { name: "Ospite", avatar: "", userId: "" };
    return { name: String(v.displayName || "Giocatore").slice(0, 40), avatar: String(v.avatarUrl || ""), userId: String(v.userId) };
  } catch {
    return { name: "Ospite", avatar: "", userId: "" };
  }
}

/** quello che vede un giocatore: come sta andando l'altro, con nome e foto */
function view(r: Room, me: number) {
  const p = r.players[me];
  const opp = r.mode === "duel" ? r.players.find((_, i) => i !== me) || null : null;
  const finished = r.winner != null;
  const status = r.mode === "duel" && r.players.length < 2 ? "waiting" : finished ? "finished" : "playing";
  return {
    ok: true,
    id: r.id,
    game: r.game,
    mode: r.mode,
    lang: r.lang,
    status,
    maxAttempts: maxAttempts(r),
    ...(r.game === "angle"
      ? { angle: r.angle, rotation: r.rotation, guesses: p.guesses.map(Number) }
      : { boards: boardsFor(r, p.guesses) }),
    me: { attempts: p.guesses.length, solved: p.solved, done: p.done },
    opponent: opp ? { attempts: opp.guesses.length, solved: opp.solved, done: opp.done, name: opp.name, avatar: opp.avatar } : null,
    result: !finished ? null : r.winner === -1 ? "draw" : r.winner === me ? "win" : "lose",
    answers: (finished || p.done) && r.game !== "angle" ? r.answers.map((a) => a.toUpperCase()) : undefined,
  };
}

function findMe(r: Room, token: string) {
  return token ? r.players.findIndex((p) => p.token === token) : -1;
}

/** Body: { game, mode: "duel" | "practice", lang } */
async function handleDuelCreate(client?, req?, res?) {
  try {
    prune();
    const game: Game = ["wordle", "quad", "angle"].includes(req.body?.game) ? req.body.game : "wordle";
    const mode = req.body?.mode === "practice" ? "practice" : "duel";
    const lang = wordle.parseLang(req.body?.lang) || "it";
    if (game !== "angle") await wordle.ensureReady(client?.config?.minigames?.wordle || null);
    const room: Room = {
      id: rid(8),
      game,
      mode,
      lang,
      createdAt: Date.now(),
      startedAt: mode === "practice" ? Date.now() : 0,
      answers: game === "angle" ? [] : pickWords(lang, game === "quad" ? wordle.QUAD_BOARDS : 1),
      angle: 10 + crypto.randomInt(161),
      rotation: crypto.randomInt(360),
      players: [{ token: rid(16), guesses: [], solved: false, done: false, at: 0, ...(await whoIs(client, req)) }],
      winner: null,
    };
    rooms.set(room.id, room);
    return res.json({ ...view(room, 0), token: room.players[0].token });
  } catch (err: any) {
    global.logger?.warn?.("[sfide] crea:", err?.message || err);
    return res.status(500).json({ ok: false, error: "duel_error" });
  }
}

/** Entrare con il link. Body: { token? } — chi c'è già rientra; il secondo prende il posto libero */
async function handleDuelJoin(client?, req?, res?) {
  const r = rooms.get(String(req.params?.id || ""));
  if (!r) return res.status(404).json({ ok: false, error: "not_found" });
  const mine = findMe(r, String(req.body?.token || ""));
  if (mine >= 0) return res.json({ ...view(r, mine), token: r.players[mine].token });
  if (r.mode !== "duel" || r.players.length >= 2) return res.status(409).json({ ok: false, error: "full" });
  const who = await whoIs(client, req);
  /* non contro sé stessi (stesso account su un altro dispositivo) */
  if (who.userId && who.userId === r.players[0]?.userId) return res.status(409).json({ ok: false, error: "self" });
  r.players.push({ token: rid(16), guesses: [], solved: false, done: false, at: 0, ...who });
  r.startedAt = Date.now();
  return res.json({ ...view(r, 1), token: r.players[1].token });
}

async function handleDuelGet(client?, req?, res?) {
  const r = rooms.get(String(req.params?.id || ""));
  if (!r) return res.status(404).json({ ok: false, error: "not_found" });
  const me = findMe(r, String(req.query?.t || ""));
  if (me < 0) return res.status(403).json({ ok: false, error: "not_player" });
  return res.json(view(r, me));
}

/** Body: { token, guess } */
async function handleDuelGuess(client?, req?, res?) {
  try {
    const r = rooms.get(String(req.params?.id || ""));
    if (!r) return res.status(404).json({ ok: false, error: "not_found" });
    const me = findMe(r, String(req.body?.token || ""));
    if (me < 0) return res.status(403).json({ ok: false, error: "not_player" });
    const p = r.players[me];
    if (r.mode === "duel" && r.players.length < 2) {
      return res.status(409).json({ ok: false, error: "waiting", message: "Aspetta che entri l'avversario." });
    }
    if (r.winner != null || p.done) return res.json(view(r, me));

    let guess = "";
    if (r.game === "angle") {
      const n = Math.round(Number(req.body?.guess));
      if (!Number.isFinite(n) || n < 0 || n > 180) return res.status(400).json({ ok: false, error: "bad_guess" });
      guess = String(n);
    } else {
      await wordle.ensureReady(client?.config?.minigames?.wordle || null);
      const check = wordle.isValidGuess(r.lang, req.body?.guess);
      if (!check.ok) {
        return res.status(400).json({
          ok: false,
          error: check.reason || "invalid",
          message: check.reason === "len" ? `Serve una parola di ${wordle.WORD_LEN} lettere.` : "Parola non nel dizionario.",
        });
      }
      if (p.guesses.includes(check.word)) return res.status(400).json({ ok: false, error: "dup", message: "Hai già provato questa parola." });
      guess = check.word;
    }
    p.guesses.push(guess);
    p.solved = isSolved(r, p.guesses);
    p.done = p.solved || p.guesses.length >= maxAttempts(r);
    if (p.solved) p.at = Date.now();
    settle(r);
    return res.json(view(r, me));
  } catch (err: any) {
    global.logger?.warn?.("[sfide] tentativo:", err?.message || err);
    return res.status(500).json({ ok: false, error: "duel_error" });
  }
}

/* ───── nella stessa chiamata (Attività Discord): la sfida arriva a chi è già dentro ───── */
type CallItem = { id: string; game: Game; duel: string; at: number; fromName: string; fromAvatar: string; fromId: string };
const calls = new Map<string, CallItem[]>();
const CALL_TTL = 30 * 60_000;

/** Body: { instanceId, duel } */
async function handleDuelCallPost(client?, req?, res?) {
  const instanceId = String(req.body?.instanceId || "").slice(0, 80);
  const r = rooms.get(String(req.body?.duel || ""));
  if (!/^[\w-]{4,80}$/.test(instanceId) || !r || r.mode !== "duel") return res.status(400).json({ ok: false, error: "bad_request" });
  const now = Date.now();
  const list = (calls.get(instanceId) || []).filter((c) => now - c.at < CALL_TTL);
  const host = r.players[0];
  const item: CallItem = { id: rid(6), game: r.game, duel: r.id, at: now, fromName: host?.name || "Ospite", fromAvatar: host?.avatar || "", fromId: host?.userId || "" };
  calls.set(instanceId, [...list, item].slice(-20));
  return res.json({ ok: true, id: item.id });
}

async function handleDuelCallGet(client?, req?, res?) {
  const now = Date.now();
  const list = (calls.get(String(req.params?.instanceId || "")) || []).filter((c) => now - c.at < CALL_TTL);
  /* solo le sfide con il posto ancora libero */
  return res.json({ ok: true, challenges: list.filter((c) => (rooms.get(c.duel)?.players.length ?? 2) < 2) });
}

export = { handleDuelCreate, handleDuelJoin, handleDuelGet, handleDuelGuess, handleDuelCallPost, handleDuelCallGet };
