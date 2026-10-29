// Feedback (idee e problemi): /webhooks/site-suggestions — handler Vinyls/Utils/Web/siteSuggestionsApi.js
// Ogni azione risponde con { ok, suggestion } già aggiornato: si sostituisce nella lista.

export type Board = "community" | "staff";
export type Kind = "suggestion" | "bug";
export type Status = "pending" | "accepted" | "rejected";
export type Topic = "server" | "staff" | "sito" | "bots" | "eventi" | "altro";

export type Comment = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  /** foto allegate al commento (indirizzi firmati, scadono dopo qualche ora) */
  imageUrls?: string[];
  parentCommentId: string | null;
  createdAt: string;
  updatedAt?: string;
  upvoteCount: number;
  downvoteCount: number;
  upvotedByViewer: boolean;
  downvotedByViewer: boolean;
};

export type Suggestion = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  kind: Kind;
  tag: Topic;
  imageUrls: string[];
  status: Status;
  staffReason: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  commentCount: number;
  upvoteCount: number;
  downvoteCount: number;
  upvotedByViewer: boolean;
  downvotedByViewer: boolean;
};

export type Viewer = { id: string; name: string; canModerateSuggestions: boolean; canAccessStaffBoard: boolean } | null;

export const MIN_LEN = 12;
export const MAX_LEN = 2000;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1200;
export const REASON_MIN = 3;
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

export const KINDS: { id: Kind; label: string }[] = [
  { id: "suggestion", label: "Idea" },
  { id: "bug", label: "Problema" },
];
export const TOPICS: { id: Topic; label: string }[] = [
  { id: "server", label: "Server" },
  { id: "staff", label: "Staff" },
  { id: "sito", label: "Sito" },
  { id: "bots", label: "Bots" },
  { id: "eventi", label: "Eventi" },
  { id: "altro", label: "Altro" },
];
export const STATUS: Record<Status, string> = { pending: "In valutazione", accepted: "Accettato", rejected: "Rifiutato" };
export const kindLabel = (k: Kind) => (k === "bug" ? "Problema" : "Idea");
export const topicLabel = (t: string) => TOPICS.find((x) => x.id === t)?.label ?? "Altro";

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (r.status === 429) return { ok: false, message: "Troppe richieste: attendi un momento." };
    if (!j || !j.ok) return { ok: false, message: j?.message || "Operazione non riuscita." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Connessione instabile: riprova." };
  }
}

const base = "/webhooks/site-suggestions";
const one = (r: Res<{ suggestion: Suggestion; message?: string }>): Res<Suggestion> => (r.ok ? { ok: true, data: r.data.suggestion } : r);

export const loadFeedback = (board: Board, token: string | null) =>
  call<{ suggestions: Suggestion[]; viewer: Viewer }>(`${base}?board=${board}`, token);

export const createFeedback = async (token: string, b: { board: Board; kind: Kind; tag: Topic; content: string; images: string[] }) =>
  one(await call(base, token, { method: "POST", body: b }));
export const editFeedback = async (token: string, id: string, b: { kind: Kind; tag: Topic; content: string }) =>
  one(await call(`${base}/${id}`, token, { method: "PATCH", body: b }));
export const deleteOwnFeedback = (token: string, id: string) => call(`${base}/${id}`, token, { method: "DELETE" });
export const voteFeedback = async (token: string, id: string, direction: "up" | "down") =>
  one(await call(`${base}/${id}/vote`, token, { method: "POST", body: { direction } }));

export const addComment = async (token: string, id: string, content: string, parentCommentId?: string, images: string[] = []) =>
  one(await call(`${base}/${id}/comments`, token, { method: "POST", body: { content, parentCommentId: parentCommentId ?? null, images } }));
export const editComment = async (token: string, id: string, cid: string, content: string) =>
  one(await call(`${base}/${id}/comments/${cid}`, token, { method: "PATCH", body: { content } }));
export const deleteComment = async (token: string, id: string, cid: string) => one(await call(`${base}/${id}/comments/${cid}`, token, { method: "DELETE" }));
export const voteComment = async (token: string, id: string, cid: string, direction: "up" | "down") =>
  one(await call(`${base}/${id}/comments/${cid}/vote`, token, { method: "POST", body: { direction } }));

/** High Staff: decide (accetta / rifiuta / rimetti in valutazione) ed elimina. */
export const decideFeedback = async (token: string, id: string, status: Status, reason: string) =>
  one(await call(`${base}/${id}/decision`, token, { method: "PATCH", body: { status, reason } }));
export const staffDeleteFeedback = (token: string, id: string) => call(`${base}/${id}/delete`, token, { method: "POST", body: {} });

/** Ridimensiona la foto nel browser (max 1600px) così resta sotto il limite di 2,5 MB del server. */
export async function imageToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.85;
  let out = c.toDataURL("image/jpeg", q);
  while (out.length * 0.75 > MAX_IMAGE_BYTES && q > 0.4) {
    q -= 0.15;
    out = c.toDataURL("image/jpeg", q);
  }
  return out;
}

export { timeAgo } from "./time";
