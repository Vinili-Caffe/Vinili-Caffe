/**
 * Attività Discord: chi della stessa chiamata sta giocando, e a cosa.
 * Ogni giocatore manda un'anteprima ridotta (mai lettere, parole o gradi: solo colori e numeri),
 * gli altri la vedono nella barra a sinistra. Resta in memoria per pochi secondi.
 */
"use strict";

type Mark = "g" | "y" | "b";
type Preview = {
  /* quiz, numeri, angle, wordle, quad */
  game: string;
  /* «del giorno», «allenamento», «sfida»… */
  mode?: string;
  /* Wordle/Quordle: righe di colori, una griglia per parola */
  grids?: Mark[][][];
  attempts?: number;
  max?: number;
  solved?: boolean;
  done?: boolean;
  /* Number Quiz: serie in corso */
  streak?: number;
};
type Entry = { userId: string; name: string; avatar: string; preview: Preview; at: number };

const rooms = new Map<string, Map<string, Entry>>();
const FRESH_MS = 20_000;
const GAMES = new Set(["quiz", "numeri", "angolo", "wordle", "quad"]);
const MODES = new Set(["daily", "practice", "duel", "stream", "party", "solo"]);

const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

/* solo colori: qualunque altra cosa (lettere comprese) viene scartata */
function cleanGrids(raw: unknown): Mark[][][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 4).map((grid) =>
    (Array.isArray(grid) ? grid : []).slice(0, 9).map((row) =>
      (Array.isArray(row) ? row : []).slice(0, 5).map((m) => (m === "g" || m === "y" ? m : "b") as Mark),
    ),
  );
}

function clean(raw: any): Preview | null {
  const game = String(raw?.game || "");
  if (!GAMES.has(game)) return null;
  const mode = MODES.has(String(raw?.mode || "")) ? String(raw.mode) : undefined;
  return {
    game,
    mode,
    grids: game === "wordle" || game === "quad" ? cleanGrids(raw?.grids) : undefined,
    attempts: raw?.attempts != null ? int(raw.attempts, 99) : undefined,
    max: raw?.max != null ? int(raw.max, 99) : undefined,
    solved: Boolean(raw?.solved),
    done: Boolean(raw?.done),
    streak: game === "numeri" && raw?.streak != null ? int(raw.streak, 9999) : undefined,
  };
}

function prune(now = Date.now()) {
  for (const [k, m] of rooms) {
    for (const [u, e] of m) if (now - e.at > FRESH_MS) m.delete(u);
    if (!m.size) rooms.delete(k);
  }
}

/** Body: { instanceId, preview } — serve l'accesso (nell'Attività c'è sempre) */
async function handleActivityLivePost(client?, req?, res?) {
  try {
    const instanceId = String(req.body?.instanceId || "").slice(0, 80);
    if (!/^[\w-]{4,80}$/.test(instanceId)) return res.status(400).json({ ok: false, error: "bad_instance" });
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    if (viewer.guest || !viewer.userId) return res.json({ ok: true, saved: false });
    const preview = clean(req.body?.preview);
    const room = rooms.get(instanceId) || new Map<string, Entry>();
    if (preview) room.set(viewer.userId, { userId: viewer.userId, name: viewer.displayName, avatar: viewer.avatarUrl, preview, at: Date.now() });
    else room.delete(viewer.userId);
    rooms.set(instanceId, room);
    prune();
    return res.json({ ok: true, saved: Boolean(preview) });
  } catch {
    return res.status(500).json({ ok: false, error: "live_error" });
  }
}

async function handleActivityLiveGet(client?, req?, res?) {
  prune();
  const room = rooms.get(String(req.params?.instanceId || ""));
  const players = room ? [...room.values()].map(({ userId, name, avatar, preview }) => ({ userId, name, avatar, preview })) : [];
  return res.json({ ok: true, players });
}

export = { handleActivityLivePost, handleActivityLiveGet };
