/** Client Music Quiz → `/webhooks/site-music-quiz/*` (high staff). */

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number; error?: string };

async function api<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Res<T & { ok?: boolean; message?: string; error?: string }>> {
  try {
    const r = await fetch(`/webhooks/site-music-quiz${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await r.json().catch(() => null)) as (T & { ok?: boolean; message?: string; error?: string }) | null;
    if (!r.ok || !data?.ok) {
      return {
        ok: false,
        status: r.status,
        error: String(data?.error || ""),
        message: String(data?.message || (r.status === 404 ? "Non trovato." : "Qualcosa è andato storto, riprova.")),
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Connessione assente, riprova." };
  }
}

export type MusicQuizPackCard = {
  slug: string;
  title: string;
  cover: string;
  kind?: string;
  deezerId?: string;
  plays?: number;
  trackCount?: number;
  authorName?: string;
  /** nome originale della playlist, quando il titolo mostrato è un'etichetta (es. «Anni '80») */
  label?: string;
};

export type MusicQuizTrack = {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  previewUrl?: string;
  artistId?: string;
  album?: string;
};

export type MusicQuizRound = {
  index: number;
  total?: number;
  previewUrl: string;
  options: string[];
  correctIndex?: number;
  title?: string;
  artist?: string;
  cover?: string;
};

export type MusicQuizDifficulty = "5s" | "3s" | "1s";
export type MusicQuizMode = "solo" | "party" | "stream";

/** Tempo per rispondere, da quando parte il brano (uguale al server). */
export const MUSIC_QUIZ_ANSWER_MS = 30_000;

export type MusicQuizHubData = {
  featured: MusicQuizPackCard[];
  trendingArtists?: MusicQuizPackCard[];
  playlists?: MusicQuizPackCard[];
  decades?: MusicQuizPackCard[];
  genres?: Array<{ id: string; name: string; items: MusicQuizPackCard[] }>;
  communityNew?: MusicQuizPackCard[];
  communityTop?: MusicQuizPackCard[];
  community?: MusicQuizPackCard[];
  popular?: MusicQuizPackCard[];
  recent?: MusicQuizPackCard[];
};

export async function loadMusicQuizHub(token: string) {
  return api<MusicQuizHubData>("/hub", token);
}

export async function searchMusicQuiz(token: string, q: string) {
  return api<{
    artists: Array<{ id: string; name: string; cover: string; fans: number; kind: string }>;
    playlists: Array<{ id: string; name: string; cover: string; fans: number; trackCount: number; owner?: string; kind: string }>;
    tracks: MusicQuizTrack[];
  }>(`/search?q=${encodeURIComponent(q)}`, token);
}

export async function loadMusicQuizPack(token: string, slug: string) {
  return api<{ pack: MusicQuizPackCard & { tracks?: MusicQuizTrack[]; community?: boolean; createdBy?: string } }>(
    `/pack/${encodeURIComponent(slug)}`,
    token,
  );
}

/** Brani di una playlist pubblica di Spotify, Apple Music o YouTube, con l'anteprima presa dallo stesso brano su Deezer. */
export async function importPlaylistLink(token: string, url: string) {
  return api<{ source: string; playlist: { name: string; cover: string; total: number }; tracks: MusicQuizTrack[] }>(
    `/import?url=${encodeURIComponent(url)}`,
    token,
  );
}

export async function resolveArtistPack(token: string, id: string) {
  return api<{ pack: MusicQuizPackCard }>(`/artist/${encodeURIComponent(id)}`, token);
}

export async function resolvePlaylistPack(token: string, id: string) {
  return api<{ pack: MusicQuizPackCard }>(`/playlist/${encodeURIComponent(id)}`, token);
}

export async function createMusicQuizPack(token: string, body: { title: string; tracks: MusicQuizTrack[] }) {
  return api<{ pack: MusicQuizPackCard }>("/pack", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function startMusicQuizSession(
  token: string,
  body: { slug?: string; source?: string; deezerId?: string; difficulty: MusicQuizDifficulty; mode?: string },
) {
  return api<{
    sessionId: string;
    difficulty: MusicQuizDifficulty;
    mode: string;
    packSlug: string;
    packTitle: string;
    packCover?: string;
    round: MusicQuizRound;
    clipMs: number;
    answerMs?: number;
  }>("/session/start", token, { method: "POST", body: JSON.stringify(body) });
}

/** choice -1 = tempo scaduto senza risposta */
export async function answerMusicQuizRound(token: string, body: { sessionId: string; index: number; choice: number; ms: number }) {
  return api<{
    correct: boolean;
    points: number;
    score: number;
    correctIndex: number;
    title: string;
    artist: string;
    cover?: string;
    nextRound: MusicQuizRound | null;
    done: boolean;
  }>("/session/answer", token, { method: "POST", body: JSON.stringify(body) });
}

export async function finishMusicQuizSession(token: string, sessionId: string) {
  return api<{
    score: number;
    best: number;
    maxScore: number;
    saved: boolean;
    packSlug: string;
    difficulty: MusicQuizDifficulty;
    correctCount: number;
    rounds: number;
  }>("/session/finish", token, { method: "POST", body: JSON.stringify({ sessionId }) });
}

export async function loadMusicQuizScores(token: string, slug: string, opts?: { difficulty?: string; mode?: string }) {
  const q = new URLSearchParams({ slug });
  if (opts?.difficulty) q.set("difficulty", opts.difficulty);
  if (opts?.mode) q.set("mode", opts.mode || "solo");
  return api<{
    scores: Array<{
      rank: number;
      userId: string;
      displayName: string;
      avatarUrl: string;
      score: number;
      maxScore: number;
      difficulty: string;
      mode: string;
    }>;
  }>(`/scores?${q}`, token);
}

export async function loadMusicQuizComments(token: string, slug: string) {
  return api<{
    comments: Array<{
      id: string;
      userId: string;
      authorName: string;
      authorAvatarUrl: string;
      content: string;
      createdAt?: string;
    }>;
  }>(`/comments?slug=${encodeURIComponent(slug)}`, token);
}

export async function postMusicQuizComment(token: string, slug: string, content: string) {
  return api<{ comments: Array<{ id: string; authorName: string; content: string }> }>("/comments", token, {
    method: "POST",
    body: JSON.stringify({ slug, content }),
  });
}

export type MusicQuizPartyPlayer = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  score: number;
  hasAnswered: boolean;
  lastPoints?: number;
  choice?: number | null;
  correctCount?: number;
};

export type MusicQuizPartyRoom = {
  roomId: string;
  hostId: string;
  mode: "party" | "stream";
  packSlug: string;
  packTitle: string;
  packCover?: string;
  difficulty: MusicQuizDifficulty;
  status: "lobby" | "playing" | "round_result" | "finished";
  roundIndex: number;
  totalRounds: number;
  clipMs: number;
  answerMs?: number;
  serverNow?: number;
  players: MusicQuizPartyPlayer[];
  myChoice?: number | null;
  round: MusicQuizRound | null;
  roundStartedAt: number;
};

export async function createMusicQuizParty(
  token: string,
  body: { slug?: string; source?: string; deezerId?: string; difficulty: MusicQuizDifficulty; mode: "party" | "stream" },
) {
  return api<{ room: MusicQuizPartyRoom }>("/party", token, { method: "POST", body: JSON.stringify(body) });
}

export async function loadMusicQuizParty(token: string, roomId: string) {
  return api<{ room: MusicQuizPartyRoom }>(`/party/${encodeURIComponent(roomId)}`, token);
}

export async function joinMusicQuizParty(token: string, roomId: string) {
  return api<{ room: MusicQuizPartyRoom }>(`/party/${encodeURIComponent(roomId)}/join`, token, {
    method: "POST",
    body: "{}",
  });
}

export async function musicQuizPartyAction(token: string, roomId: string, body: { action: string; choice?: number; ms?: number }) {
  return api<{ room: MusicQuizPartyRoom }>(`/party/${encodeURIComponent(roomId)}/action`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
