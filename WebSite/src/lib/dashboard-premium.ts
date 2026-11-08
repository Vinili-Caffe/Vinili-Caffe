// Dashboard: crediti Premium e attivazione per server.
// API (bot): GET /webhooks/site-dashboard/credits, POST /webhooks/site-dashboard/credits/spend,
// GET /webhooks/site-dashboard/account (solo alto staff: altrimenti 403, gestito).
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

export type PremiumGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  until: number | null;
  lifetime: boolean;
  ownedByYou: boolean;
};

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
    return { ok: true, credits: num(data.credits), until, lifetime: premium.lifetime === true || until == null };
  } catch {
    return { ok: false, message: "Errore di rete durante l'attivazione." };
  }
}

/**
 * GET /account — server con Premium e scadenze. Disponibile solo per l'alto staff:
 * per gli altri torna `{ ok: false, status: 403 }` e la pagina usa i dati dei server.
 */
export async function loadPremiumGuilds(token: string): Promise<{ ok: true; guilds: PremiumGuild[] } | Fail> {
  try {
    const { status, data } = await call("GET", `${BASE}/account`, token);
    if (status !== 200 || data.ok === false) return fail(status, data, "Dettagli Premium non disponibili.");
    const premium = (data.premium && typeof data.premium === "object" ? data.premium : {}) as Record<string, unknown>;
    const rows = Array.isArray(premium.guilds) ? premium.guilds : [];
    const guilds = rows
      .map((raw) => {
        const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const id = String(row.id || "").trim();
        if (!/^\d{16,22}$/.test(id)) return null;
        const until = row.until == null ? null : num(row.until) || null;
        return {
          id,
          name: String(row.name || "Server").trim() || "Server",
          iconUrl: String(row.iconUrl || "").trim() || null,
          botPresent: row.botPresent !== false,
          until,
          lifetime: row.lifetime === true,
          ownedByYou: row.ownedByYou === true,
        } satisfies PremiumGuild;
      })
      .filter((g): g is PremiumGuild => Boolean(g));
    return { ok: true, guilds };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
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
