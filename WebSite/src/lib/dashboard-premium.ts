// Dashboard: crediti Premium e attivazione per server.
// API (bot): GET /webhooks/site-dashboard/credits, POST /webhooks/site-dashboard/credits/spend,
// GET /webhooks/site-dashboard/credits/history (storico). Scadenze: campi premiumUntil della lista server.
// Handler: MultiGuild/site/dashboard/dashboardRoutes.ts + premiumCreditsService.ts.

const BASE = "/webhooks/site-dashboard";

/** Stessi piani di PREMIUM_CREDIT_PLANS nel bot. */
export const PREMIUM_PLANS = [
  { months: 1, days: 30, credits: 15 },
  { months: 3, days: 90, credits: 35 },
  { months: 6, days: 180, credits: 65 },
  { months: 12, days: 365, credits: 115 },
] as const;

export type PremiumPlan = (typeof PREMIUM_PLANS)[number];

type Fail = { ok: false; message: string; error?: string; status?: number };

function headers(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Cache-Control": "no-cache",
  };
}

async function call(method: "GET" | "POST", path: string, token: string, body?: unknown) {
  const url = method === "GET" ? `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}` : path;
  const r = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "omit",
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, data };
}

function fail(status: number, data: Record<string, unknown>, fallback: string): Fail {
  return {
    ok: false,
    status,
    error: typeof data.error === "string" ? data.error : undefined,
    message: typeof data.message === "string" && data.message.trim() ? data.message : fallback,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** GET /credits — saldo crediti dell'account. */
export async function loadCredits(token: string): Promise<{ ok: true; credits: number } | Fail> {
  try {
    const { status, data } = await call("GET", `${BASE}/credits`, token);
    if (status === 401) return fail(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status !== 200 || data.ok === false) return fail(status, data, "Impossibile leggere i crediti.");
    setCreditsBalance(num(data.credits));
    return { ok: true, credits: num(data.credits) };
  } catch {
    return { ok: false, message: "Errore di rete durante la lettura dei crediti." };
  }
}

/** POST /credits/spend — attiva o allunga Premium su un server. */
export async function spendCredits(
  token: string,
  guildId: string,
  months: number,
): Promise<{ ok: true; credits: number; until: number | null; lifetime: boolean } | (Fail & { credits?: number })> {
  try {
    const { status, data } = await call("POST", `${BASE}/credits/spend`, token, { guildId, months });
    if (status !== 200 || data.ok !== true) {
      return { ...fail(status, data, "Attivazione non riuscita."), credits: data.credits == null ? undefined : num(data.credits) };
    }
    const premium = (data.premium && typeof data.premium === "object" ? data.premium : {}) as Record<string, unknown>;
    const until = premium.until == null ? null : num(premium.until) || null;
    setCreditsBalance(num(data.credits));
    return { ok: true, credits: num(data.credits), until, lifetime: premium.lifetime === true || until == null };
  } catch {
    return { ok: false, message: "Errore di rete durante l'attivazione." };
  }
}

export type CreditsMove = {
  delta: number;
  at: number | null;
  reason: string;
  guildId: string | null;
};

/** GET /credits/history — saldo e ultimi 50 movimenti, più recenti prima. */
export async function loadCreditsHistory(
  token: string,
): Promise<{ ok: true; credits: number; history: CreditsMove[] } | Fail> {
  try {
    const { status, data } = await call("GET", `${BASE}/credits/history`, token);
    if (status === 404) return { ok: false, status, message: "Lo storico arriva col prossimo aggiornamento del bot." };
    if (status !== 200 || data.ok === false) return fail(status, data, "Impossibile leggere lo storico.");
    const rows = Array.isArray(data.history) ? data.history : [];
    const history = rows
      .map((raw) => {
        const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const delta = Math.trunc(num(r.delta));
        if (!delta) return null;
        const gid = String(r.guildId || "");
        return {
          delta,
          at: num(r.at) || null,
          reason: String(r.reason || "adjust"),
          guildId: /^d{16,22}$/.test(gid) ? gid : null,
        } satisfies CreditsMove;
      })
      .filter((m): m is CreditsMove => Boolean(m));
    setCreditsBalance(num(data.credits));
    return { ok: true, credits: num(data.credits), history };
  } catch {
    return { ok: false, message: "Errore di rete durante la lettura dello storico." };
  }
}

/** Testo leggibile di un movimento (i motivi vengono dal bot: premiumCreditsService). */
export function describeMove(m: CreditsMove, guildName: string | null): string {
  const where = guildName ? ` su ${guildName}` : m.guildId ? " su un server" : "";
  if (m.delta < 0 && m.reason === "tenant_premium") {
    const plan = PREMIUM_PLANS.find((p) => p.credits === -m.delta);
    return `Premium ${plan ? monthsLabel(plan.months) : ""}${where}`.replace("  ", " ");
  }
  if (m.delta > 0 && m.reason.includes("refund")) {
    return m.reason === "refund_failed_grant" ? "Rimborso: attivazione non riuscita" : `Rimborso Premium${where}`;
  }
  if (m.delta > 0) return "Aggiunti dallo staff";
  return "Tolti dallo staff";
}

/* ── saldo condiviso: la topbar e le pagine leggono lo stesso numero ── */

let balance: number | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function setCreditsBalance(n: number) {
  balance = n;
  listeners.forEach((fn) => fn());
}

export function subscribeCredits(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCreditsBalance() {
  return balance;
}

/** Carica il saldo una volta per visita (poi lo aggiornano spese e storico). */
export function ensureCreditsBalance(token: string, force = false): Promise<void> {
  if (!force && (balance != null || loading)) return loading || Promise.resolve();
  loading = loadCredits(token)
    .then((res) => {
      if (res.ok) setCreditsBalance(res.credits);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function planPerMonth(plan: PremiumPlan): string {
  return (plan.credits / plan.months).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** Sconto rispetto al piano da 1 mese (es. 35 crediti per 3 mesi = -22%). */
export function planSaving(plan: PremiumPlan): number {
  const base = PREMIUM_PLANS[0].credits * plan.months;
  return Math.round(((base - plan.credits) / base) * 100);
}

export function formatUntil(until: number | null, lifetime: boolean): string {
  if (lifetime || until == null) return "Per sempre";
  return new Date(until).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function monthsLabel(months: number): string {
  return months === 1 ? "1 mese" : months === 12 ? "1 anno" : `${months} mesi`;
}
