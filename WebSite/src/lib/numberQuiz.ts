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

export const listNumberQuizCategories = () => api<{ categories: NumberQuizCategory[] }>("/categories");
export const loadNumberQuizCategory = (id: string, n = 80) =>
  api<{ category: NumberQuizCategory; items: NumberQuizItem[]; min: number; max: number }>(
    `/category/${encodeURIComponent(id)}?n=${n}`,
  );
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
export function readBest(cat: string, mode: "hl" | "hc") {
  try {
    return Number(localStorage.getItem(`${BEST_PREFIX}:${mode}:${cat}`) || 0) || 0;
  } catch {
    return 0;
  }
}
export function writeBest(cat: string, mode: "hl" | "hc", n: number) {
  try {
    localStorage.setItem(`${BEST_PREFIX}:${mode}:${cat}`, String(n));
  } catch {
    /* senza memoria il record vale solo adesso */
  }
}
