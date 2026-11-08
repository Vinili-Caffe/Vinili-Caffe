// Recensioni: /webhooks/site-reviews (GET ?kind=server|staff, POST, DELETE /:id, POST /:id/like, POST /:id/server-reply)
// Regole del bot: testo 12–1200 caratteri, voto 1–5, una recensione per tipo (e per staffer) che si può aggiornare,
// niente like alla propria, risposta "del locale" solo con il permesso (o lo staffer recensito).

// sul sito pubblico server e staff; il tipo "bot" (recensioni di Vinili) sta nella dashboard del bot
export type ReviewKind = "server" | "staff" | "bot";

export type ReviewKindInfo = { id: ReviewKind; label: string; hint: string };

export const KINDS: ReviewKindInfo[] = [
  { id: "server", label: "Il server", hint: "Com'è stare nel server" },
  { id: "staff", label: "Lo staff", hint: "Chi ti ha aiutato" },
];

export const BOT_KINDS: ReviewKindInfo[] = [{ id: "bot", label: "Il bot", hint: "Com'è usare Vinili" }];

export type Review = {
  id: string;
  kind: ReviewKind;
  userId: string;
  staffUserId: string | null;
  rating: number;
  content: string;
  authorName: string;
  authorAvatarUrl?: string;
  staffName?: string;
  staffAvatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  likedByViewer: boolean;
  serverReply?: { content: string; updatedAt?: string } | null;
};

export type Staffer = { id: string; name: string; avatarUrl?: string };

export type Viewer = {
  id: string;
  name: string;
  canReplyAsServer: boolean;
  canWriteStaffReview: boolean;
  serverReview: Review | null;
  botReview: Review | null;
  staffReviews: Review[];
} | null;

export type ReviewsData = { reviews: Review[]; staffers: Staffer[]; viewer: Viewer; externalUrl?: string };

const auth = (token?: string | null): HeadersInit => (token ? { Authorization: `Bearer ${token}` } : {});

export async function loadReviews(kind: ReviewKind, token?: string | null, origin = ""): Promise<ReviewsData | null> {
  try {
    const r = await fetch(`${origin}/webhooks/site-reviews?kind=${kind}`, { cache: "no-store", headers: auth(token) });
    const j = await r.json();
    if (!j?.ok) return null;
    return { reviews: j.reviews?.[kind] ?? [], staffers: j.staffers ?? [], viewer: j.viewer ?? null, externalUrl: j.externalReviewsUrl || undefined };
  } catch {
    return null;
  }
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function call<T>(url: string, token: string, init: RequestInit): Promise<Result<T>> {
  try {
    const r = await fetch(url, { ...init, headers: { ...auth(token), "Content-Type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) return { ok: false, message: j?.message || `Errore ${r.status}` };
    return { ok: true, ...(j as T) };
  } catch {
    return { ok: false, message: "Connessione non riuscita, riprova." };
  }
}

export const submitReview = (token: string, body: { kind: ReviewKind; rating: number; content: string; staffUserId?: string }) =>
  call<{ message?: string }>("/webhooks/site-reviews", token, { method: "POST", body: JSON.stringify({ ...body, contentLang: "it" }) });

export const deleteReview = (token: string, id: string) => call(`/webhooks/site-reviews/${encodeURIComponent(id)}`, token, { method: "DELETE" });

export const toggleLike = (token: string, id: string) =>
  call<{ liked: boolean; likeCount: number }>(`/webhooks/site-reviews/${encodeURIComponent(id)}/like`, token, { method: "POST", body: "{}" });

export const replyAsServer = (token: string, id: string, content: string) =>
  call(`/webhooks/site-reviews/${encodeURIComponent(id)}/server-reply`, token, { method: "POST", body: JSON.stringify({ content }) });

export const MIN_LEN = 12;
export const MAX_LEN = 1200;
export const REPLY_MIN = 8;
