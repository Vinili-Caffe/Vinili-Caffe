/**
 * Canzone del giorno e Copertina del giorno (uguali per tutti, cambiano a mezzanotte di Roma).
 * - Canzone: si sente 1 s, poi 2, 4, 7, 11, 16: sei tentativi per dire il brano.
 * - Copertina: la copertina di un album parte a quadrettoni e si schiarisce a ogni errore.
 * Si gioca senza accesso; con l'accesso la partita vale su ogni dispositivo, conta per la
 * classifica settimanale e la serie combinata; nel server Discord dà anche EXP.
 * Più: il riepilogo dei giochi del giorno (serie, punti) e la classifica della settimana.
 */
"use strict";

const axios = require("axios") as any;
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const daily = require("../../Minigames/services/dailyGamesService") as typeof import("../../Minigames/services/dailyGamesService");

type Kind = "song" | "cover";
type Item = { id: string; title: string; artist: string; cover: string; album?: string };

const DEEZER = "https://api.deezer.com";
const MAX_ATTEMPTS = 6;
/* secondi di ascolto a ogni tentativo */
const CLIPS = [1, 2, 4, 7, 11, 16];
/* quadretti per lato a ogni tentativo (poi si vede tutta) */
const PIXELS = [6, 10, 16, 26, 42, 70];
/* classifiche italiane e mondiali (le stesse del Music Quiz), più quella generale di Deezer */
const CHARTS = ["579513551", "1116187241", "3155776842"];
/* primo giorno: serve per «Canzone #12» */
const FIRST_DAY = "2026-11-25";

const mainGuildId = () => String(IDs.guilds?.main || "").trim();
const romeDay = daily.romeDay;

function fnv(text: string) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const dayNumber = (day: string) => Math.floor((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${FIRST_DAY}T12:00:00Z`)) / 86_400_000) + 1;

/* ───── la scelta del giorno: salvata, così resta uguale anche dopo un riavvio ───── */
const pickSchema = new mongoose.Schema(
  { _id: { type: String }, kind: String, day: String, item: { type: mongoose.Schema.Types.Mixed } },
  { versionKey: false, timestamps: true },
);
const DailyPick: any = mongoose.models.SiteDailyPick || mongoose.model("SiteDailyPick", pickSchema, "sitedailypicks");

const pickCache = new Map<string, Item>();

async function deezer(path: string, params?: Record<string, unknown>) {
  const r = await axios.get(path.startsWith("http") ? path : `${DEEZER}${path}`, { params, timeout: 12_000 });
  return r?.data;
}

async function candidates(kind: Kind): Promise<Item[]> {
  const lists: any[] = [];
  for (const id of CHARTS) {
    const d = await deezer(`/playlist/${id}/tracks`, { limit: 100 }).catch(() => null);
    lists.push(...(d?.data || []));
  }
  const chart = await deezer(kind === "song" ? "/chart/0/tracks" : "/chart/0/albums", { limit: 100 }).catch(() => null);
  lists.push(...(chart?.data || []));
  const out = new Map<string, Item>();
  for (const raw of lists) {
    if (kind === "song") {
      if (!raw?.id || !raw?.preview || !raw?.title) continue;
      out.set(String(raw.id), {
        id: String(raw.id),
        title: String(raw.title_short || raw.title),
        artist: String(raw.artist?.name || ""),
        cover: String(raw.album?.cover_big || raw.album?.cover_medium || ""),
        album: String(raw.album?.title || ""),
      });
    } else {
      /* le tracce portano il loro album; la classifica degli album è già fatta di album */
      const a = raw?.type === "album" ? raw : raw?.album;
      const cover = String(a?.cover_xl || a?.cover_big || "");
      if (!a?.id || !a?.title || !cover) continue;
      out.set(String(a.id), { id: String(a.id), title: String(a.title), artist: String(a.artist?.name || raw?.artist?.name || ""), cover });
    }
  }
  return [...out.values()].filter((x) => x.artist);
}

async function pickFor(kind: Kind, day: string): Promise<Item | null> {
  const key = `${kind}:${day}`;
  const hit = pickCache.get(key);
  if (hit) return hit;
  const saved: any = await DailyPick.findById(key).lean().catch(() => null);
  if (saved?.item) {
    pickCache.set(key, saved.item);
    return saved.item;
  }
  const pool = await candidates(kind).catch(() => [] as Item[]);
  if (!pool.length) return null;
  /* niente ripetizioni negli ultimi 120 giorni */
  const recent: any[] = await DailyPick.find({ kind }).sort({ day: -1 }).limit(120).select("item.id").lean().catch(() => []);
  const used = new Set(recent.map((r) => String(r?.item?.id || "")));
  const fresh = pool.filter((x) => !used.has(x.id));
  const list = (fresh.length ? fresh : pool).sort((a, b) => a.id.localeCompare(b.id));
  const item = list[fnv(`${day}|vc-${kind}`) % list.length]!;
  /* se due richieste arrivano insieme vince la prima salvata */
  await DailyPick.updateOne({ _id: key }, { $setOnInsert: { kind, day, item } }, { upsert: true }).catch(() => null);
  const final: any = await DailyPick.findById(key).lean().catch(() => null);
  const chosen = (final?.item as Item) || item;
  pickCache.set(key, chosen);
  return chosen;
}

/* anteprima fresca (i link di Deezer scadono dopo qualche ora) */
const previewCache = new Map<string, { at: number; url: string }>();
async function freshPreview(trackId: string) {
  const hit = previewCache.get(trackId);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.url;
  const d = await deezer(`/track/${encodeURIComponent(trackId)}`).catch(() => null);
  const url = String(d?.preview || "");
  if (url) previewCache.set(trackId, { at: Date.now(), url });
  return url;
}

function parseKind(raw: unknown): Kind | null {
  return raw === "song" || raw === "cover" ? raw : null;
}

function validDay(day: string) {
  return day === romeDay() || day === romeDay(new Date(Date.now() - 86_400_000));
}

/** GET /webhooks/site-daily/:kind/today */
async function handleDailyTodayGet(client?, req?, res?) {
  try {
    const kind = parseKind(req.params?.kind);
    if (!kind) return res.status(404).json({ ok: false, error: "not_found" });
    const day = romeDay();
    const item = await pickFor(kind, day);
    if (!item) return res.status(503).json({ ok: false, error: "unavailable", message: "Deezer non risponde, riprova tra poco." });
    const base = { ok: true, kind, day, number: dayNumber(day), maxAttempts: MAX_ATTEMPTS };
    if (kind === "song") {
      const preview = await freshPreview(item.id);
      return res.json({ ...base, clips: CLIPS, preview });
    }
    return res.json({ ...base, levels: PIXELS.length });
  } catch (err: any) {
    global.logger?.warn?.("[giochi del giorno] oggi:", err?.message || err);
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

/* ───── copertina a quadretti, disegnata sul server (la foto vera non arriva prima della fine) ───── */
const imgCache = new Map<string, Buffer>();
async function handleDailyCoverImgGet(client?, req?, res?) {
  try {
    const day = String(req.query?.day || romeDay());
    if (!validDay(day)) return res.status(400).end();
    const level = Math.max(0, Math.min(PIXELS.length - 1, Math.floor(Number(req.query?.level) || 0)));
    const key = `${day}:${level}`;
    let buf = imgCache.get(key);
    if (!buf) {
      const item = await pickFor("cover", day);
      if (!item) return res.status(503).end();
      const raw = await axios.get(item.cover, { responseType: "arraybuffer", timeout: 12_000 });
      const { createCanvas, loadImage } = require("canvas");
      const img = await loadImage(Buffer.from(raw.data));
      const size = 480;
      const cells = PIXELS[level]!;
      const small = createCanvas(cells, cells);
      small.getContext("2d").drawImage(img, 0, 0, cells, cells);
      const out = createCanvas(size, size);
      const ctx = out.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cells, cells, 0, 0, size, size);
      buf = out.toBuffer("image/png") as Buffer;
      imgCache.set(key, buf);
      if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value as string);
    }
    res.set?.("Content-Type", "image/png");
    res.set?.("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buf);
  } catch (err: any) {
    global.logger?.warn?.("[copertina del giorno] immagine:", err?.message || err);
    return res.status(502).end();
  }
}

/** GET /webhooks/site-daily/search?type=track|album&q= — niente copertine nei suggerimenti (aiuterebbero) */
async function handleDailySearchGet(client?, req?, res?) {
  try {
    const q = String(req.query?.q || "").trim().slice(0, 80);
    const album = req.query?.type === "album";
    if (q.length < 2) return res.json({ ok: true, results: [] });
    const d = await deezer(album ? "/search/album" : "/search/track", { q, limit: 10 });
    const seen = new Set<string>();
    const results = (d?.data || [])
      .map((x: any) => ({ id: String(x?.id || ""), title: String(album ? x?.title : x?.title_short || x?.title || ""), artist: String(x?.artist?.name || "") }))
      .filter((x: any) => {
        const k = `${norm(x.title)}|${norm(x.artist)}`;
        if (!x.id || !x.title || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8);
    return res.json({ ok: true, results });
  } catch {
    return res.status(502).json({ ok: false, error: "search_error", message: "Deezer non risponde, riprova." });
  }
}

type Guess = { id?: string; title?: string; artist?: string; skip?: boolean };
type Judged = { label: string; result: "hit" | "artist" | "miss" | "skip" };

function judge(item: Item, g: Guess): Judged {
  if (g?.skip) return { label: "", result: "skip" };
  const label = `${String(g?.title || "").slice(0, 120)}${g?.artist ? ` · ${String(g.artist).slice(0, 80)}` : ""}`;
  const sameArtist = norm(String(g?.artist || "")) === norm(item.artist);
  if (String(g?.id || "") === item.id || (sameArtist && norm(String(g?.title || "")) === norm(item.title))) return { label, result: "hit" };
  return { label, result: sameArtist ? "artist" : "miss" };
}

function cleanGuesses(raw: unknown): Guess[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_ATTEMPTS).map((g: any) =>
    g?.skip ? { skip: true } : { id: String(g?.id || "").slice(0, 20), title: String(g?.title || "").slice(0, 120), artist: String(g?.artist || "").slice(0, 80) },
  );
}

function stateFor(kind: Kind, day: string, item: Item, guesses: Guess[]) {
  const judged = guesses.map((g) => judge(item, g));
  const hitAt = judged.findIndex((j) => j.result === "hit");
  const solved = hitAt >= 0;
  const done = solved || judged.length >= MAX_ATTEMPTS;
  return {
    ok: true,
    kind,
    day,
    number: dayNumber(day),
    maxAttempts: MAX_ATTEMPTS,
    guesses: judged,
    solved,
    done,
    attempts: solved ? hitAt + 1 : judged.length,
    /* la soluzione solo a partita finita */
    answer: done ? { title: item.title, artist: item.artist, cover: item.cover, album: item.album || "" } : undefined,
  };
}

/** POST /webhooks/site-daily/:kind/guess — Body: { day, guesses: [...] } (tutti i tentativi fatti finora) */
async function handleDailyGuessPost(client?, req?, res?) {
  try {
    const kind = parseKind(req.params?.kind);
    if (!kind) return res.status(404).json({ ok: false, error: "not_found" });
    const day = String(req.body?.day || "");
    if (!validDay(day)) return res.status(400).json({ ok: false, error: "bad_day" });
    const item = await pickFor(kind, day);
    if (!item) return res.status(503).json({ ok: false, error: "unavailable" });
    let guesses = cleanGuesses(req.body?.guesses);

    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    if (viewer.guest) return res.json({ ...stateFor(kind, day, item, guesses), reward: { auth: "guest", exp: 0 } });

    const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
    const guildId = mainGuildId();
    const userId = viewer.userId;
    const field = kind === "song" ? "songDays" : "coverDays";
    const path = `profile.${field}.${day}`;
    await ActivityUserProfile.updateOne({ guildId, userId }, { $setOnInsert: { guildId, userId } }, { upsert: true }).catch(() => null);
    const doc: any = await ActivityUserProfile.findOne({ guildId, userId }).select(path).lean().catch(() => null);
    const stored = doc?.profile?.[field]?.[day];
    const storedGuesses: Guess[] = Array.isArray(stored?.guesses) ? stored.guesses : [];
    /* partita già finita (anche su un altro dispositivo), o più avanti di questa: vale quella salvata */
    if (stored?.done || storedGuesses.length > guesses.length) {
      return res.json({ ...stateFor(kind, day, item, storedGuesses), reward: { auth: viewer.inGuild ? "member" : "outsider", exp: 0 }, already: Boolean(stored?.done) });
    }
    /* i tentativi già salvati non si cambiano: si aggiungono solo i nuovi */
    guesses = [...storedGuesses, ...guesses.slice(storedGuesses.length)];
    const state = stateFor(kind, day, item, guesses);
    await ActivityUserProfile.updateOne({ guildId, userId }, { $set: { [path]: { guesses, solved: state.solved, done: state.done, at: new Date() } } }).catch(() => null);

    let reward: any = { auth: viewer.inGuild ? "member" : "outsider", exp: 0 };
    if (state.done) {
      void daily.recordDailyResult(userId, kind, day, { solved: state.solved, attempts: state.attempts }).catch(() => false);
      if (viewer.inGuild) {
        const { autoEnableDailyReminder } = require("../../Minigames/services/wordleDailyReminderService") as typeof import("../../Minigames/services/wordleDailyReminderService");
        void autoEnableDailyReminder(guildId, userId).catch(() => false);
      }
      /* EXP una volta sola al giorno per gioco */
      const claim = await ActivityUserProfile.updateOne({ guildId, userId, [`${path}.rewarded`]: { $ne: true } }, { $set: { [`${path}.rewarded`]: true } }).catch(() => null);
      if (viewer.inGuild && state.solved && claim?.modifiedCount) {
        const { claimQuizExp } = require("./siteQuizRewards") as typeof import("./siteQuizRewards");
        reward = await claimQuizExp(client, viewer, {
          game: kind,
          ratio: (MAX_ATTEMPTS + 1 - state.attempts) / MAX_ATTEMPTS,
          note: `${kind === "song" ? "Canzone" : "Copertina"} del giorno ${day}`,
        }).catch(() => ({ auth: "member", exp: 0 }));
      }
    }
    return res.json({ ...state, reward });
  } catch (err: any) {
    global.logger?.warn?.("[giochi del giorno] tentativo:", err?.message || err);
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

/** GET /webhooks/site-daily/:kind/me — la partita di oggi salvata (con l'accesso) */
async function handleDailyKindMeGet(client?, req?, res?) {
  try {
    const kind = parseKind(req.params?.kind);
    if (!kind) return res.status(404).json({ ok: false, error: "not_found" });
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    if (viewer.guest) return res.json({ ok: true, guest: true, game: null });
    const day = romeDay();
    const field = kind === "song" ? "songDays" : "coverDays";
    const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
    const doc: any = await ActivityUserProfile.findOne({ guildId: mainGuildId(), userId: viewer.userId }).select(`profile.${field}.${day}`).lean().catch(() => null);
    const stored = doc?.profile?.[field]?.[day];
    if (!stored?.guesses?.length) return res.json({ ok: true, guest: false, game: null });
    const item = await pickFor(kind, day);
    if (!item) return res.json({ ok: true, guest: false, game: null });
    return res.json({ ok: true, guest: false, game: stateFor(kind, day, item, stored.guesses) });
  } catch {
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

/* ───── riepilogo e classifica della settimana ───── */

async function namesFor(client: any, ids: string[]) {
  const out = new Map<string, { name: string; avatar: string }>();
  const guild = client?.guilds?.cache?.get(mainGuildId());
  if (!guild || !ids.length) return out;
  const missing = ids.filter((id) => !guild.members.cache.has(id));
  if (missing.length) await guild.members.fetch({ user: missing.slice(0, 100) }).catch(() => null);
  for (const id of ids) {
    const m = guild.members.cache.get(id);
    if (!m) continue;
    out.set(id, { name: String(m.displayName || m.user?.globalName || m.user?.username || "Utente"), avatar: String(m.displayAvatarURL?.({ size: 64 }) || "") });
  }
  return out;
}

/**
 * GET /webhooks/site-daily/:kind/history — canzoni o copertine dei giorni scorsi (mai quella di oggi,
 * che è ancora da indovinare). Per lo scaffale a coverflow sotto il gioco.
 */
async function handleDailyHistoryGet(client?, req?, res?) {
  try {
    const kind = String(req.params?.kind || "") === "song" ? "song" : String(req.params?.kind || "") === "cover" ? "cover" : "";
    if (!kind) return res.status(400).json({ ok: false, error: "bad_kind" });
    const today = romeDay();
    const rows: any[] = await DailyPick.find({ kind, day: { $lt: today } })
      .sort({ day: -1 })
      .limit(30)
      .lean()
      .catch(() => []);
    const items = rows
      .filter((r) => r?.item?.cover)
      .map((r) => ({
        day: String(r.day),
        n: dayNumber(String(r.day)),
        title: String(r.item.title || ""),
        artist: String(r.item.artist || ""),
        album: r.item.album ? String(r.item.album) : "",
        cover: String(r.item.cover),
      }));
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.json({ ok: true, kind, items });
  } catch {
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

/** GET /webhooks/site-daily/me — oggi (fatto o da fare), serie combinata e punti della settimana */
async function handleDailyMeGet(client?, req?, res?) {
  try {
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    if (viewer.guest) return res.json({ ok: true, guest: true, games: daily.DAILY_GAMES });
    const me = await daily.dailyMe(viewer.userId);
    return res.json({ ok: true, guest: false, games: daily.DAILY_GAMES, ...me });
  } catch {
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

/** GET /webhooks/site-daily/week?period=all|week|month (&prev=1 = settimana prima) — classifica dei giochi del giorno */
async function handleDailyWeekGet(client?, req?, res?) {
  try {
    const period = String(req.query?.period || "week");
    const monday = daily.weekStart(req.query?.prev ? romeDay(new Date(Date.now() - 7 * 86_400_000)) : romeDay());
    const days =
      period === "all" ? null : period === "day" ? [romeDay()] : period === "month" ? daily.monthDays(romeDay()) : daily.weekDays(monday);
    const rows = await daily.daysLeaderboard(days);
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req).catch(() => null);
    const top = rows.slice(0, 20);
    const names = await namesFor(client, top.map((r) => r.userId));
    const meIdx = viewer && !viewer.guest ? rows.findIndex((r) => r.userId === viewer.userId) : -1;
    return res.json({
      ok: true,
      week: monday,
      period: period === "all" || period === "day" || period === "month" ? period : "week",
      days: days || [],
      players: rows.length,
      top: top.map((r, i) => ({ rank: i + 1, ...r, name: names.get(r.userId)?.name || "Utente", avatar: names.get(r.userId)?.avatar || "" })),
      me: meIdx >= 0 ? { rank: meIdx + 1, ...rows[meIdx] } : null,
    });
  } catch (err: any) {
    global.logger?.warn?.("[giochi del giorno] classifica:", err?.message || err);
    return res.status(500).json({ ok: false, error: "daily_error" });
  }
}

export = {
  handleDailyTodayGet,
  handleDailyCoverImgGet,
  handleDailySearchGet,
  handleDailyGuessPost,
  handleDailyKindMeGet,
  handleDailyMeGet,
  handleDailyWeekGet,
  handleDailyHistoryGet,
  pickFor,
};
