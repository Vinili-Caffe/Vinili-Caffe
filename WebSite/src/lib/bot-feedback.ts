// Feedback sul bot Vinili: /webhooks/site-bot-feedback (siteBotFeedbackApi.js)

export type BotFeedbackKind = "suggestion" | "bug";
export type BotFeedbackStatus = "pending" | "accepted" | "rejected";

export type BotFeedbackComment = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
};

export type BotFeedbackItem = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  kind: BotFeedbackKind;
  imageUrls: string[];
  status: BotFeedbackStatus;
  staffReason: string;
  decidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: BotFeedbackComment[];
  commentCount: number;
  upvoteCount: number;
  downvoteCount: number;
  upvotedByViewer: boolean;
  downvotedByViewer: boolean;
};

export type BotFeedbackViewer = { id: string; name: string; canModerate: boolean } | null;

export const MIN_LEN = 12;
export const MAX_LEN = 2000;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1200;
export const REASON_MIN = 3;
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

export const KINDS: { id: BotFeedbackKind; label: string }[] = [
  { id: "suggestion", label: "Idea" },
  { id: "bug", label: "Problema" },
];

export const STATUS: Record<BotFeedbackStatus, string> = {
  pending: "In valutazione",
  accepted: "Accettato",
  rejected: "Rifiutato",
};

export const kindLabel = (k: BotFeedbackKind) => (k === "bug" ? "Problema" : "Idea");

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
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

const base = "/webhooks/site-bot-feedback";

export const loadBotFeedback = (token: string | null) =>
  call<{ items: BotFeedbackItem[]; viewer: BotFeedbackViewer }>(base, token);

export const createBotFeedback = (token: string, body: { content: string; kind: BotFeedbackKind; images: string[] }) =>
  call<{ item?: BotFeedbackItem; message?: string }>(base, token, { method: "POST", body });

export const deleteOwnBotFeedback = (token: string, id: string) => call(`${base}/${id}`, token, { method: "DELETE" });

export const voteBotFeedback = (token: string, id: string, direction: "up" | "down") =>
  call<{ item?: BotFeedbackItem }>(`${base}/${id}/vote`, token, { method: "POST", body: { direction } });

export const commentBotFeedback = (token: string, id: string, content: string, parentCommentId?: string | null) =>
  call<{ item?: BotFeedbackItem }>(`${base}/${id}/comments`, token, {
    method: "POST",
    body: { content, parentCommentId: parentCommentId ?? null },
  });

export const decideBotFeedback = (token: string, id: string, status: BotFeedbackStatus, reason: string) =>
  call<{ item?: BotFeedbackItem }>(`${base}/${id}/decision`, token, { method: "PATCH", body: { status, reason } });

export const staffDeleteBotFeedback = (token: string, id: string) =>
  call(`${base}/${id}/delete`, token, { method: "POST", body: {} });

export { imageToDataUrl } from "./feedback";
export { timeAgo } from "./time";
