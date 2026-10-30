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
  createdAt: string | null;
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
  board: Board;
  isMine: boolean;
};
export type ConfViewer = { id: string; canModerate: boolean; canAccessStaffBoard: boolean } | null;

export const MIN_LEN = 8;
export const MAX_LEN = 1500;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1200;

export const STATUS: Record<ConfStatus, string> = { active: "Aperta", resolved: "Risolta", soft_deleted: "Eliminata" };

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function call<T>(path: string, token: string | null, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) return { ok: false, status: r.status, message: j?.message || (r.status === 429 ? "Troppi messaggi. Riprova tra qualche minuto." : "Operazione non riuscita.") };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete: controlla la connessione e riprova." };
  }
}

const base = "/webhooks/site-confessionale";
const item = (r: Res<{ item: Confession }>): Res<Confession> => (r.ok ? { ok: true, data: r.data.item } : r);

export const loadConfessions = (board: Board, token: string | null) =>
  call<{ items: Confession[]; viewer: ConfViewer; canModerate: boolean; canAccessStaffBoard: boolean }>(`${base}?board=${board}`, token);

export const sendConfession = async (token: string, board: Board, content: string) => item(await call(`${base}?board=${board}`, token, { content, board }));
export const commentConfession = async (token: string, id: string, content: string, anonymous: boolean, images: string[] = []) =>
  item(await call(`${base}/${id}/comments`, token, { content, anonymous, images }));

/** High Staff (mai sulla propria confessione). */
export const resolveConfession = async (token: string, id: string, reason: string) => item(await call(`${base}/${id}/resolve`, token, { reason }));
export const reopenConfession = async (token: string, id: string, reason: string) => item(await call(`${base}/${id}/reopen`, token, { reason }));
export const deleteConfession = async (token: string, id: string, reason: string) => item(await call(`${base}/${id}/delete`, token, { reason }));

export const BGM_SRC = cdnUrl("/audio/confessionale-bgm.mp3");
