import { apiUrl } from "./api";

export type BoardKind = "quote" | "repost" | "clip";

export type BoardItem = {
  id: string;
  kind: BoardKind;
  createdAt: string | null;
  boardUrl: string;
  originUrl: string;
  previewImageUrl: string;
  previewAudioUrl: string;
  previewVideoUrl?: string;
  content: string;
  quotedUserId: string;
  quotedUsername: string;
  sourceAuthorId: string;
  authorUsername: string;
};

export type BoardPage = {
  kind: BoardKind;
  userId: string;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  items: BoardItem[];
};

/** Quote, repost o clip di una persona: del principale, oppure (con il login) di un altro server dove sei anche tu. */
export async function loadUserBoards(kind: BoardKind, userId: string, page = 1, opts: { guildId?: string | null; token?: string | null } = {}): Promise<BoardPage | null> {
  try {
    const q = new URLSearchParams({ kind, userId, page: String(page) });
    if (opts.guildId) q.set("guild", opts.guildId);
    const r = await fetch(apiUrl(`/webhooks/site-user-boards?${q}`), {
      cache: "no-store",
      ...(opts.guildId && opts.token ? { headers: { Authorization: `Bearer ${opts.token}` } } : {}),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.items)) return null;
    return {
      kind,
      userId,
      page: Number(j.page) || 1,
      perPage: Number(j.perPage) || 6,
      total: Number(j.total) || 0,
      totalPages: Number(j.totalPages) || 1,
      items: j.items,
    };
  } catch {
    return null;
  }
}

export async function deleteUserBoardItem(kind: BoardKind, id: string, token: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-user-boards"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, id }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return { ok: false, message: String(j?.message || "Eliminazione non riuscita.") };
    return { ok: true };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}
