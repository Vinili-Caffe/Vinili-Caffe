/**
 * Music Quiz: costruzione delle domande, condivisa da partita singola e di gruppo.
 *
 * - 10 domande (o meno se il pacchetto è piccolo), 4 opzioni ciascuna.
 * - Nei pacchetti di un solo artista le opzioni sono i titoli; dove gli artisti sono più d'uno
 *   l'opzione è «Titolo · Artista», così non ci sono doppioni ambigui.
 * - I link alle anteprime di Deezer scadono dopo qualche ora: a ogni partita si chiedono freschi.
 * - Si ascolta per la durata scelta (5/3/1 s) e si hanno ANSWER_MS per rispondere da quando parte il brano.
 */
const axios = require("axios") as any;

export const ROUNDS = 10;
export const ANSWER_MS = 30_000;
export const DIFF_MS = { "5s": 5000, "3s": 3000, "1s": 1000 } as const;
export type DiffKey = keyof typeof DIFF_MS;

export type QuizRound = {
  index: number;
  trackId: string;
  title: string;
  artist: string;
  cover: string;
  previewUrl: string;
  options: string[];
  correctIndex: number;
  /** secondo dell'anteprima da cui parte lo spezzone (scelto da chi ha creato il quiz) */
  start: number;
};

/** Spezzone: l'anteprima dura 30 s, lo spezzone più lungo è 5 s. */
export const MAX_START = 25;

export function parseDifficulty(raw: unknown): DiffKey {
  const d = String(raw || "");
  return (d === "3s" || d === "1s" ? d : "5s") as DiffKey;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Punti di una risposta giusta: 100 subito, scende fino a 20 allo scadere del tempo. */
export function pointsFor(ms: number): number {
  const t = Math.max(0, Math.min(1, ms / ANSWER_MS));
  return Math.round(100 - 80 * t);
}

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* titoli più noti di un artista (Deezer), tenuti qualche ora: servono per le risposte sbagliate */
const artistCache = new Map<string, { at: number; titles: string[] }>();
const ARTIST_TTL = 6 * 3600_000;

/**
 * Per le risposte lasciate vuote da chi ha creato il quiz: altri brani dello stesso artista
 * (come «Riempi le opzioni a caso»), così non si indovina solo perché le altre opzioni sono di altri.
 */
export async function artistTitlesFor(tracks: any[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const need = [
    ...new Set(
      (tracks || [])
        .filter((t) => t?.artistId && /^\d{1,15}$/.test(String(t.artistId)))
        .filter((t) => (Array.isArray(t.wrong) ? t.wrong.filter((w: unknown) => String(w || "").trim()).length : 0) < 3)
        .map((t) => String(t.artistId)),
    ),
  ].slice(0, 20);
  if (!need.length) return out;
  const deezer = require("./siteMusicQuizDeezer") as typeof import("./siteMusicQuizDeezer");
  await Promise.all(
    need.map(async (id) => {
      const hit = artistCache.get(id);
      if (hit && Date.now() - hit.at < ARTIST_TTL) return void out.set(id, hit.titles);
      try {
        const list = await deezer.artistTopTracks(id, 50);
        const seen = new Set<string>();
        const titles: string[] = [];
        for (const t of list || []) {
          const k = norm(String(t?.title || ""));
          if (!k || seen.has(k)) continue;
          seen.add(k);
          titles.push(String(t.title));
        }
        artistCache.set(id, { at: Date.now(), titles });
        out.set(id, titles);
      } catch {
        /* Deezer lento: restano gli altri brani del quiz */
      }
    }),
  );
  return out;
}

export function buildRounds(tracks: any[], artistTitles?: Map<string, string[]>): QuizRound[] | null {
  /* un brano per titolo: le versioni live/remix dello stesso pezzo confonderebbero le opzioni */
  const seen = new Set<string>();
  const usable = tracks.filter((t) => {
    if (!t?.previewUrl || !t?.title || !t?.id) return false;
    const k = norm(t.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (usable.length < 4) return null;
  /* quiz di un artista (anche con qualche featuring): solo titoli; playlist miste: «Titolo · Artista» */
  const counts = new Map<string, number>();
  for (const t of usable) counts.set(norm(t.artist), (counts.get(norm(t.artist)) || 0) + 1);
  const topShare = Math.max(...counts.values()) / usable.length;
  const manyArtists = topShare < 0.8;
  const label = (t: any) => (manyArtists ? `${t.title} · ${t.artist}` : String(t.title));
  const picked = shuffle(usable).slice(0, Math.min(ROUNDS, usable.length));
  return picked.map((t, index) => {
    /* risposte scritte da chi ha creato il quiz: la giusta (se l'ha cambiata) e fino a 3 sbagliate; il resto si riempie con gli altri brani */
    const correct = String(t.answer || "").trim() || label(t);
    const custom: string[] = Array.isArray(t.wrong)
      ? t.wrong.map((w: unknown) => String(w || "").trim()).filter((w: string) => w && norm(w) !== norm(correct))
      : [];
    const taken = (o: string) => norm(o) === norm(correct) || norm(o) === norm(String(t.title)) || custom.some((c) => norm(c) === norm(o));
    /* risposte vuote: prima altri brani dello stesso artista, poi (se non bastano) gli altri brani del quiz */
    const sameArtist = shuffle(artistTitles?.get(String(t.artistId || "")) || [])
      .map((title) => (manyArtists ? `${title} · ${t.artist}` : title))
      .filter((o) => !taken(o) && !taken(String(o).split(" · ")[0] || o));
    const others = shuffle(usable.filter((x) => x.id !== t.id).map(label)).filter((o) => !taken(o));
    const fill = [...new Set([...sameArtist, ...others])];
    const options = shuffle([correct, ...[...new Set(custom)].slice(0, 3), ...fill].slice(0, 4));
    return {
      index,
      trackId: String(t.id),
      title: String(t.title),
      artist: String(t.artist || ""),
      cover: String(t.cover || ""),
      previewUrl: String(t.previewUrl),
      options,
      correctIndex: options.indexOf(correct),
      start: Math.max(0, Math.min(MAX_START, Number(t.start) || 0)),
    };
  });
}

/** Link freschi alle anteprime (quelli salvati scadono); i brani senza anteprima vengono tolti. */
export async function refreshPreviews(rounds: QuizRound[]): Promise<QuizRound[]> {
  const fresh = await Promise.all(
    rounds.map(async (r) => {
      try {
        const res = await axios.get(`https://api.deezer.com/track/${encodeURIComponent(r.trackId)}`, { timeout: 8000 });
        const preview = String(res?.data?.preview || "").trim();
        const cover = String(res?.data?.album?.cover_big || res?.data?.album?.cover_medium || "").trim();
        return preview ? { ...r, previewUrl: preview, cover: cover || r.cover } : null;
      } catch {
        return r; /* Deezer lento: si prova con il link salvato */
      }
    }),
  );
  return fresh.filter(Boolean).map((r, index) => ({ ...(r as QuizRound), index }));
}
