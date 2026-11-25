/** Number Quiz: categorie da API pubbliche, servite da `/webhooks/site-number-quiz/*`. */

export type NumberQuizFormat = "number" | "year" | "duration" | "money" | "decimal";

export type NumberQuizCategory = {
  id: string;
  topic: string;
  title: string;
  question: string;
  description: string;
  emoji: string;
  unit: string;
  format: NumberQuizFormat;
  count: number;
  ready: boolean;
  cover: string;
  plays: number;
};

export type NumberQuizItem = { name: string; value: number; sub?: string; image?: string };

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number; preparing?: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<Res<T>> {
  try {
    const r = await fetch(`/webhooks/site-number-quiz${path}`, {
      ...init,
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await r.json().catch(() => null)) as (T & { ok?: boolean; message?: string; error?: string }) | null;
    if (!r.ok || !data?.ok) {
      return {
        ok: false,
        status: r.status,
        preparing: data?.error === "preparing",
        message: String(data?.message || "Qualcosa è andato storto, riprova."),
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Connessione assente, riprova." };
  }
}

/* nell'Attività di Discord le immagini esterne sono bloccate: passano dal nostro server */
function img(url?: string) {
  if (!url || typeof window === "undefined" || !/\.discordsays\.com$/i.test(window.location.hostname)) return url;
  return `/webhooks/site-number-quiz/img?u=${encodeURIComponent(url)}`;
}

/* il server a volte è occupato a preparare una categoria: si riprova un paio di volte prima di arrendersi */
async function withRetry<T>(fn: () => Promise<Res<T>>) {
  let r = await fn();
  for (let i = 0; i < 2 && !r.ok && !r.preparing && r.status !== 404; i++) {
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    r = await fn();
  }
  return r;
}

export const listNumberQuizCategories = async () => {
  const r = await withRetry(() => api<{ categories: NumberQuizCategory[] }>("/categories"));
  if (r.ok) r.data.categories = r.data.categories.map((c) => ({ ...c, cover: img(c.cover) || "" }));
  return r;
};
export const loadNumberQuizCategory = async (id: string, n = 80) => {
  const r = await withRetry(() =>
    api<{ category: NumberQuizCategory; items: NumberQuizItem[]; min: number; max: number }>(`/category/${encodeURIComponent(id)}?n=${n}`),
  );
  if (r.ok) {
    r.data.category = { ...r.data.category, cover: img(r.data.category.cover) || "" };
    r.data.items = r.data.items.map((x) => (x.image ? { ...x, image: img(x.image) } : x));
  }
  return r;
};
/** Fine partita: con l'accesso si salva il record, nel server Discord arriva anche l'EXP. */
export async function postNumberQuizResult(token: string | null | undefined, body: { cat: string; mode: "hl" | "hc"; score: number }) {
  try {
    const r = await fetch("/webhooks/site-number-quiz/result", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as {
      ok?: boolean;
      saved?: boolean;
      best?: number;
      reward?: { auth: "guest" | "outsider" | "member"; exp: number; capped?: boolean };
    } | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/** I tuoi record salvati sul server (con l'accesso): { categoria: { hl, hc } } */
export async function loadMyNumberQuiz(token: string) {
  try {
    const r = await fetch("/webhooks/site-number-quiz/me", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; best?: Record<string, { hl?: number; hc?: number }> } | null;
    return data?.ok ? data.best || {} : {};
  } catch {
    return {};
  }
}

/** tutti i record del dispositivo: { categoria: { hl, hc } } */
function readAllBest() {
  const out: Record<string, { hl?: number; hc?: number }> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      const m = k.match(/^vc-numquiz2:(hl|hc):(.+)$/);
      if (!m) continue;
      const n = Number(localStorage.getItem(k) || 0) || 0;
      if (n > 0) (out[m[2]] ||= {})[m[1] as "hl" | "hc"] = n;
    }
  } catch {
    /* ignore */
  }
  return out;
}

let syncing: Promise<boolean> | null = null;
/**
 * Con l'accesso: manda i record del dispositivo al server e riprende quelli salvati altrove
 * (vale il più alto), così sono uguali su telefono e PC. Una volta per caricamento.
 */
export function syncNumberQuizBest(token: string) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const r = await fetch("/webhooks/site-number-quiz/best-sync", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ best: readAllBest() }),
        cache: "no-store",
      });
      const data = (await r.json().catch(() => null)) as { ok?: boolean; best?: Record<string, { hl?: number; hc?: number }> } | null;
      if (!data?.ok || !data.best) return false;
      for (const [cat, v] of Object.entries(data.best)) {
        for (const mode of ["hl", "hc"] as const) {
          const n = Number(v?.[mode]) || 0;
          if (n > readBest(cat, mode)) writeBest(cat, mode, n);
        }
      }
      return true;
    } catch {
      syncing = null;
      return false;
    }
  })();
  return syncing;
}

export const countNumberQuizPlay = (id: string) => api<object>(`/category/${encodeURIComponent(id)}/play`, { method: "POST" });

const intIt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const decIt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** Il numero come lo leggono le persone: anni senza punto, durate in minuti e secondi, soldi abbreviati. */
export function formatNumberQuizValue(value: number, format: NumberQuizFormat) {
  if (!Number.isFinite(value)) return "?";
  switch (format) {
    case "year":
      return value < 0 ? `${Math.abs(Math.round(value))} a.C.` : String(Math.round(value));
    case "duration": {
      const s = Math.max(0, Math.round(value));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    case "money": {
      const a = Math.abs(value);
      if (a >= 1e12) return `${decIt.format(Math.round(value / 1e10) / 100)} bilioni`;
      if (a >= 1e9) return `${decIt.format(Math.round(value / 1e7) / 100)} miliardi`;
      if (a >= 1e6) return `${decIt.format(Math.round(value / 1e4) / 100)} milioni`;
      return intIt.format(value);
    }
    case "decimal":
      return decIt.format(value);
    default:
      return Math.abs(value) < 100 && !Number.isInteger(value) ? decIt.format(value) : intIt.format(Math.round(value));
  }
}

export function formatCount(n: number) {
  return intIt.format(n);
}

const BEST_PREFIX = "vc-numquiz2";
export function readBest(cat: string, mode: string) {
  try {
    return Number(localStorage.getItem(`${BEST_PREFIX}:${mode}:${cat}`) || 0) || 0;
  } catch {
    return 0;
  }
}
export function writeBest(cat: string, mode: string, n: number) {
  try {
    localStorage.setItem(`${BEST_PREFIX}:${mode}:${cat}`, String(n));
  } catch {
    /* senza memoria il record vale solo adesso */
  }
}
