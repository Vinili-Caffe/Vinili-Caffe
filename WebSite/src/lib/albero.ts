import { apiUrl } from "./api";

export type AlberoColor = "ruby" | "gold" | "emerald" | "frost" | "amber" | "wine";

export type AlberoOrnament = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  message: string;
  color: AlberoColor;
  x: number;
  y: number;
  anonymous?: boolean;
  mine: boolean;
  updatedAt: string | null;
};

export type AlberoPayload = {
  ok: true;
  season: boolean;
  count: number;
  mine: AlberoOrnament | null;
  ornaments: AlberoOrnament[];
};

export type AlberoResult =
  | { status: "ok"; data: AlberoPayload }
  | { status: "auth" }
  | { status: "forbidden" }
  | { status: "disabled" }
  | { status: "error"; message?: string };

export const ALBERO_COLORS: { id: AlberoColor; label: string; hex: string; glow: string }[] = [
  { id: "ruby", label: "Rubino", hex: "#c23b4a", glow: "rgba(194,59,74,0.55)" },
  { id: "gold", label: "Oro", hex: "#d4a24a", glow: "rgba(212,162,74,0.55)" },
  { id: "emerald", label: "Smeraldo", hex: "#2f7a55", glow: "rgba(47,122,85,0.5)" },
  { id: "frost", label: "Gelo", hex: "#8eb8c8", glow: "rgba(142,184,200,0.5)" },
  { id: "amber", label: "Ambra", hex: "#c9783a", glow: "rgba(201,120,58,0.55)" },
  { id: "wine", label: "Vinaccia", hex: "#7a2f48", glow: "rgba(122,47,72,0.5)" },
];

/** Centro default sull’albero (destra, scena 16:9), sotto la stella. */
export const TREE_DEFAULT = { x: 0.7, y: 0.4 };

/** Aspect della media salotto (jpg/mp4). */
export const ALBERO_MEDIA_ASPECT = 16 / 9;

/** object-position allineato a AlberoScene (desktop sticky). */
export const ALBERO_COVER_POS = { x: 0.58, y: 0.45 };

/** Layout object-fit:cover della media nel contenitore. */
export function alberoCoverLayout(
  cw: number,
  ch: number,
  posX = ALBERO_COVER_POS.x,
  posY = ALBERO_COVER_POS.y,
) {
  const ca = cw / Math.max(1, ch);
  if (ca > ALBERO_MEDIA_ASPECT) {
    const mw = cw;
    const mh = cw / ALBERO_MEDIA_ASPECT;
    return { mx: 0, my: (ch - mh) * posY, mw, mh };
  }
  const mh = ch;
  const mw = ch * ALBERO_MEDIA_ASPECT;
  return { mx: (cw - mw) * posX, my: 0, mw, mh };
}

/** Client → coordinate 0–1 nello spazio media. */
export function clientToAlberoMedia(clientX: number, clientY: number, rect: DOMRect) {
  const { mx, my, mw, mh } = alberoCoverLayout(rect.width, rect.height);
  return {
    x: (clientX - rect.left - mx) / Math.max(1, mw),
    y: (clientY - rect.top - my) / Math.max(1, mh),
  };
}

/** Media 0–1 → % CSS sul contenitore (per posizionare le palle). */
export function alberoMediaToCssPercent(x: number, y: number, cw: number, ch: number) {
  const { mx, my, mw, mh } = alberoCoverLayout(cw, ch);
  return {
    left: ((mx + x * mw) / Math.max(1, cw)) * 100,
    top: ((my + y * mh) / Math.max(1, ch)) * 100,
  };
}

/** Dimensione palla in px in base a quante ce ne sono (più palle → più piccole). */
export function baubleSizeForCount(count: number, compact = false): number {
  const n = Math.max(1, count);
  let base = 34;
  if (n >= 80) base = 22;
  else if (n >= 40) base = 24;
  else if (n >= 20) base = 28;
  else if (n >= 10) base = 30;
  if (compact) base = Math.max(20, base - 4);
  return base;
}

export function colorMeta(id: string) {
  return ALBERO_COLORS.find((c) => c.id === id) || ALBERO_COLORS[1];
}

export async function loadAlbero(token?: string | null): Promise<AlberoResult> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(apiUrl("/webhooks/site-albero"), { headers, cache: "no-store" });
    if (r.status === 401) return { status: "auth" };
    if (r.status === 403) return { status: "forbidden" };
    const j = await r.json().catch(() => null);
    if (r.status === 503 || j?.error === "albero_disabled") return { status: "disabled" };
    if (!r.ok || !j?.ok) {
      return { status: "error", message: String(j?.message || "Errore caricamento albero.") };
    }
    return { status: "ok", data: j as AlberoPayload };
  } catch {
    return { status: "error", message: "Rete non disponibile." };
  }
}

export async function saveAlberoOrnament(
  token: string,
  body: { message: string; x: number; y: number; color: AlberoColor; anonymous?: boolean },
): Promise<{ ok: true; ornament: AlberoOrnament } | { ok: false; message: string }> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-albero"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok || !j?.ornament) {
      return { ok: false, message: String(j?.message || "Salvataggio non riuscito.") };
    }
    return { ok: true, ornament: j.ornament as AlberoOrnament };
  } catch {
    return { ok: false, message: "Rete non disponibile." };
  }
}

export async function deleteAlberoOrnament(
  token: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-albero"), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      return { ok: false, message: String(j?.message || "Rimozione non riuscita.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Rete non disponibile." };
  }
}

/**
 * Hit-test chioma stretta (solo verde albero, scena 16:9).
 * Evita stella, regali, caminetto e muro.
 */
export function pointOnTree(x: number, y: number): boolean {
  if (y < 0.18 || y > 0.68) return false;
  const t = (y - 0.18) / 0.5;
  const cx = 0.7 + t * 0.015;
  const half = 0.04 + t * 0.115;
  return Math.abs(x - cx) <= half;
}

export function snapToTree(x: number, y: number): { x: number; y: number } {
  if (pointOnTree(x, y)) return { x, y };

  let best = { ...TREE_DEFAULT };
  let bestD = Infinity;
  for (let i = 0; i < 64; i++) {
    const ty = 0.18 + (i / 63) * 0.5;
    const t = (ty - 0.18) / 0.5;
    const cx = 0.7 + t * 0.015;
    const half = 0.04 + t * 0.115;
    for (const k of [-0.85, -0.45, 0, 0.45, 0.85]) {
      const sx = cx + half * k;
      const d = (sx - x) ** 2 + (ty - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: sx, y: ty };
      }
    }
  }
  return best;
}
