// Buoni propositi Capodanno: /webhooks/site-propositi
// Toggle anonimo/pubblico; parity confessionale (board, like, commenti staff, soft-delete HS).

import { cdnUrl } from "@/lib/site";

export type Board = "community" | "staff";
export type PropStatus = "active" | "resolved" | "soft_deleted";

export type PropComment = {
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

export type Proposito = {
  id: string;
  content: string;
  createdAt: string | null;
  status: PropStatus;
  staffReason: string;
  decidedAt: string | null;
  comments: PropComment[];
  commentCount: number;
  likeCount: number;
  likedByViewer: boolean;
  board: Board;
  anonymous: boolean;
  authorName: string;
  authorAvatarUrl?: string;
  burnedAt?: string | null;
  isMine: boolean;
};

export type PropViewer = { id: string; canModerate: boolean; canAccessStaffBoard: boolean } | null;

export const MIN_LEN = 8;
export const MAX_LEN = 1500;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1200;

export const STATUS: Record<PropStatus, string> = {
  active: "Aperto",
  resolved: "Chiuso",
  soft_deleted: "Eliminato",
};

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
        message:
          j?.message ||
          (r.status === 429 ? "Troppi messaggi. Riprova tra qualche minuto." : "Operazione non riuscita."),
      };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete: controlla la connessione e riprova." };
  }
}

const base = "/webhooks/site-propositi";
const item = (r: Res<{ item: Proposito }>): Res<Proposito> => (r.ok ? { ok: true, data: r.data.item } : r);

export type PropositiList = {
  items: Proposito[];
  /** Fuori calendario: propositi bruciati per la cerimonia one-shot. */
  burnedItems?: Proposito[];
  viewer: PropViewer;
  canModerate: boolean;
  canAccessStaffBoard: boolean;
  seasonOpen?: boolean;
  calendarClosed?: boolean;
  burnedJustNow?: boolean;
  seasonClosed?: boolean;
};

/** Chiave localStorage: cerimonia vista una volta per Capodanno (anno di chiusura, Europe/Rome). */
export function propositiBurnSeenKey(now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const endYear = m === 12 ? y + 1 : y;
    return `vc_propositi_burn_seen_${endYear}`;
  } catch {
    return `vc_propositi_burn_seen_${now.getFullYear()}`;
  }
}

export function hasSeenPropositiBurn(now = new Date()): boolean {
  try {
    return localStorage.getItem(propositiBurnSeenKey(now)) === "1";
  } catch {
    return false;
  }
}

export function markPropositiBurnSeen(now = new Date()) {
  try {
    localStorage.setItem(propositiBurnSeenKey(now), "1");
  } catch {
    /* ignore */
  }
}

export const loadPropositi = (token: string | null) => call<PropositiList>(base, token);

export const sendProposito = async (token: string, content: string, anonymous: boolean) =>
  item(await call(base, token, { body: { content, anonymous } }));

export const commentProposito = async (
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

export const editPropositoComment = async (token: string, id: string, commentId: string, content: string) =>
  item(await call(`${base}/${id}/comments/${commentId}`, token, { method: "PATCH", body: { content } }));

export const deletePropositoComment = async (token: string, id: string, commentId: string) =>
  item(await call(`${base}/${id}/comments/${commentId}`, token, { method: "DELETE" }));

export const likePropositoComment = async (token: string, id: string, commentId: string) => {
  const r = await call<{ item: Proposito; liked: boolean; likeCount: number }>(
    `${base}/${id}/comments/${commentId}/like`,
    token,
    { body: {} },
  );
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.item, liked: r.data.liked, likeCount: r.data.likeCount };
};

export const likeProposito = async (token: string, id: string) => {
  const r = await call<{ item: Proposito; liked: boolean; likeCount: number }>(`${base}/${id}/like`, token, {
    body: {},
  });
  if (!r.ok) return r;
  return { ok: true as const, data: r.data.item, liked: r.data.liked, likeCount: r.data.likeCount };
};

/** High Staff: elimina (soft). `reopen` resta per undo eliminazione. */
export const reopenProposito = async (token: string, id: string, reason: string) =>
  item(await call(`${base}/${id}/reopen`, token, { body: { reason } }));
export const deleteProposito = async (token: string, id: string, reason: string) =>
  item(await call(`${base}/${id}/delete`, token, { body: { reason } }));

/** Radici + risposte (max 2 livelli, come feedback). */
export function threadComments(comments: PropComment[]) {
  const roots = comments.filter((c) => !c.parentCommentId);
  const byParent = new Map<string, PropComment[]>();
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const list = byParent.get(c.parentCommentId) || [];
    list.push(c);
    byParent.set(c.parentCommentId, list);
  }
  return { roots, byParent };
}

/** Riusa ambientazione confessionale finché non c’è un BGM dedicato. */
export const BGM_SRC = cdnUrl("/audio/confessionale-bgm.mp3");
