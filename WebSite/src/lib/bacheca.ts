// Bacheca: /webhooks/site-bacheca — handler Vinili/features/bacheca/bachecaApi.ts
// Quote, repost, clip vocali e messaggi con la 💀 del server, appesi al muro del sito.

export type BachecaKind = "quote" | "repost" | "clip" | "skull";
export type BachecaFilter = "all" | BachecaKind;
export type BachecaSort = "new" | "top" | "week";

export type BachecaPerson = { id: string; name: string; avatar: string };
export type BachecaMedia = { url: string; type: "image" | "video" | "audio" | "file"; name: string };

export type BachecaItem = {
  id: string;
  kind: BachecaKind;
  createdAt: string | null;
  number: number | null;
  author: BachecaPerson;
  by: BachecaPerson;
  text: string;
  imageUrl: string;
  media: BachecaMedia[];
  audioUrl?: string;
  skulls?: number;
  sourceUrl: string;
  reactions: Record<string, number>;
  mine: string[];
  reposts: number;
  onDiscord: boolean;
};

export const BACHECA_EMOJIS = ["💀", "❤️", "🔥", "😂"] as const;

export const KIND_LABEL: Record<BachecaFilter, string> = {
  all: "Tutto",
  quote: "Quote",
  repost: "Repost",
  clip: "Clip",
  skull: "💀 Skull",
};

export const SORT_LABEL: Record<BachecaSort, string> = {
  new: "Nuovi",
  top: "Più amati",
  week: "Questa settimana",
};

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function call<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      return {
        ok: false,
        status: Number(j?.status) || r.status,
        message: j?.message || (r.status === 429 ? "Troppe richieste. Riprova tra poco." : "Operazione non riuscita."),
      };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete: controlla la connessione e riprova." };
  }
}

const base = "/webhooks/site-bacheca";

export function loadBacheca(token: string | null, kind: BachecaFilter, sort: BachecaSort, page: number) {
  const q = new URLSearchParams({ kind, sort, page: String(page) });
  return call<{ items: BachecaItem[]; hasMore: boolean; page: number }>(`${base}?${q}`, token);
}

export async function loadBachecaItem(token: string | null, id: string): Promise<Res<BachecaItem>> {
  const r = await call<{ item: BachecaItem }>(`${base}/item?id=${encodeURIComponent(id)}`, token);
  return r.ok ? { ok: true, data: r.data.item } : r;
}

export async function pickRandomBacheca(token: string | null): Promise<Res<BachecaItem>> {
  const r = await call<{ item: BachecaItem }>(`${base}/random`, token);
  return r.ok ? { ok: true, data: r.data.item } : r;
}

export function reactBacheca(token: string, id: string, emoji: string) {
  return call<{ reactions: Record<string, number>; mine: string[]; active: boolean }>(`${base}/react`, token, "POST", { id, emoji });
}

export function removeBacheca(token: string, id: string) {
  return call<{ id: string }>(base, token, "DELETE", { id });
}

export function bachecaShareUrl(id: string) {
  return `https://www.viniliecaffe.it/bacheca/?p=${encodeURIComponent(id)}`;
}

/** Chi può togliere il contenuto dal muro (il server ricontrolla comunque). */
export function canRemove(item: BachecaItem, userId: string | undefined) {
  if (!userId) return false;
  if (item.kind === "skull") return item.author.id === userId;
  return item.by.id === userId;
}

/** Inclinazione stabile per ogni contenuto (sempre la stessa, niente salti al ricaricare). */
export function tiltFor(id: string, max = 3) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * max * 2 - max;
}
