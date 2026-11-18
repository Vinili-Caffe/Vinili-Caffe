// Confessionale: /webhooks/site-confessionale — handler Vinili/Utils/Web/siteConfessionaleApi.js
// Le confessioni sono anonime: l'API non espone mai l'autore, solo `isMine` per chi l'ha scritta.
// Commentare è riservato allo staff operativo (anche in anonimo); moderare all'High Staff.

import { cdnUrl } from "@/lib/site";

export type Board = "community" | "staff";
export type ConfStatus = "active" | "resolved" | "soft_deleted";

export type ConfComment = {
  id: string;
  authorName: string;
  authorAvatarUrl?: string;
  anonymous: boolean;
  content: string;
  imageUrls?: string[];
  parentCommentId?: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
  likeCount: number;
  likedByViewer: boolean;
  isMine: boolean;
};
export type Confession = {
  id: string;
  content: string;
  createdAt: string | null;
  status: ConfStatus;
  staffReason: string;
  decidedAt: string | null;
  comments: ConfComment[];
  commentCount: number;
  likeCount: number;
  likedByViewer: boolean;
  board: Board;
  isMine: boolean;
};
export type ConfViewer = { id: string; canModerate: boolean; canAccessStaffBoard: boolean } | null;

export const MIN_LEN = 8;
export const MAX_LEN = 1500;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1200;

export const STATUS: Record<ConfStatus, string> = { active: "Aperta", resolved: "Chiusa", soft_deleted: "Eliminata" };

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function call<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<Res<T>> {
  try {
    const method = init.method || (init.body === undefined ? "GET" : "POST");
    const r = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      return {
        ok: false,
        status: r.status,
        message: j?.message || (r.status === 429 ? "Troppi messaggi. Riprova tra qualche minuto." : "Operazione non riuscita."),
      };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete: controlla la connessione e riprova." };
  }
}

const base = "/webhooks/site-confessionale";
const item = (r: Res<{ item: Confession }>): Res<Confession> => (r.ok ? { ok: true, data: r.data.item } : r);

export const loadConfessions = (board: Board, token: string | null) =>
  call<{ items: Confession[]; viewer: ConfViewer; canModerate: boolean; canAccessStaffBoard: boolean }>(`${base}?board=${board}`, token);

export const sendConfession = async (token: string, board: Board, content: string) =>
  item(await call(`${base}?board=${board}`, token, { body: { content, board } }));

export const commentConfession = async (
  token: string,
  id: string,
  content: string,
  anonymous: boolean,
  images: string[] = [],
  parentCommentId?: string | null,
) =>
  item(
    await call(`${base}/${id}/comments`, token, {
      body: { content, anonymous, images, parentCommentId: parentCommentId ?? null },
    }),
  );

export const editConfessionComment = async (token: string, id: string, commentId: string, content: string) =>
  item(await call(`${base}/${id}/comments/${commentId}`, token, { method: "PATCH", body: { content } }));

export const deleteConfessionComment = async (token: string, id: string, commentId: string) =>
  item(await call(`${base}/${id}/comments/${commentId}`, token, { method: "DELETE" }));

export const likeConfessionComment = async (token: string, id: string, commentId: string) => {
  const r = await call<{ item: Confession; liked: boolean; likeCount: number }>(`${base}/${id}/comments/${commentId}/like`, token, {
    body: {},
  });
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.item, liked: r.data.liked, likeCount: r.data.likeCount };
};

export const likeConfession = async (token: string, id: string) => {
  const r = await call<{ item: Confession; liked: boolean; likeCount: number }>(`${base}/${id}/like`, token, { body: {} });
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.item, liked: r.data.liked, likeCount: r.data.likeCount };
};

/** High Staff: elimina (soft). `reopen` resta per undo eliminazione. */
export const reopenConfession = async (token: string, id: string, reason: string) =>
  item(await call(`${base}/${id}/reopen`, token, { body: { reason } }));
export const deleteConfession = async (token: string, id: string, reason: string) =>
  item(await call(`${base}/${id}/delete`, token, { body: { reason } }));

/** Radici + risposte (max 2 livelli, come feedback). */
export function threadComments(comments: ConfComment[]) {
  const roots = comments.filter((c) => !c.parentCommentId);
  const byParent = new Map<string, ConfComment[]>();
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const list = byParent.get(c.parentCommentId) || [];
    list.push(c);
    byParent.set(c.parentCommentId, list);
  }
  return { roots, byParent };
}

export const BGM_SRC = cdnUrl("/audio/confessionale-bgm.mp3");
