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
};

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

export function buildRounds(tracks: any[]): QuizRound[] | null {
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
    const correct = label(t);
    const others = shuffle(usable.filter((x) => x.id !== t.id)).slice(0, 3).map(label);
    const options = shuffle([correct, ...others]);
    return {
      index,
      trackId: String(t.id),
      title: String(t.title),
      artist: String(t.artist || ""),
      cover: String(t.cover || ""),
      previewUrl: String(t.previewUrl),
      options,
      correctIndex: options.indexOf(correct),
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
