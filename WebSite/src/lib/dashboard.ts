// Dashboard bot: accesso + lista server gestibili.
// Vecchio: dashboard-access-gate.js, dashboard-page.js, dashboard-server-switcher.js
// API: GET /webhooks/site-dashboard/access, GET /webhooks/site-dashboard/guilds
// Handler: Vinili/Utils/Web/siteDashboardApi.js (+ siteWebhookRoutes.js).

import { page } from "@/lib/site";

export type DashboardGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  botPresent: boolean;
  isMainGuild: boolean;
  isProtectedGuild: boolean;
  premiumActive: boolean;
  /** Scadenza Premium in ms; null = per sempre o non attivo. undefined = il bot non la manda (versione vecchia). */
  premiumUntil?: number | null;
  premiumLifetime?: boolean;
};

export type DashboardAccess = {
  allowed: boolean;
  blacklisted: boolean;
};

type Fail = { ok: false; message: string; error?: string; status?: number };
type OkAccess = { ok: true; access: DashboardAccess };
type OkGuilds = {
  ok: true;
  guilds: DashboardGuild[];
  user?: { id: string; username: string };
};

const BASE = "/webhooks/site-dashboard";
const LAST_GUILD_KEY = "vc_dash_guild_v1";
const LEGACY_LAST_GUILD_KEY = "vc_dash_last_guild_id";
const GUILDS_CACHE_KEY = "vc_dash_switcher_guilds_v1";

/** Voci della sidebar dashboard. */
export const DASH_NAV = [
  { id: "servers", label: "Server", href: "/dashboard/", hint: "Scegli il server" },
  { id: "guild", label: "Pannello", href: "/dashboard/guild/", hint: "Configurazione e moduli" },
  { id: "premium", label: "Premium", href: "/dashboard/premium/", hint: "Piani e crediti" },
  { id: "profilo", label: "Profilo", href: "/dashboard/profilo/", hint: "Account dashboard" },
  { id: "faq", label: "FAQ", href: "/dashboard/faq/", hint: "Domande sul bot" },
  { id: "feedback", label: "Feedback", href: "/dashboard/feedback/", hint: "Idee per il bot" },
  { id: "recensioni", label: "Recensioni", href: "/dashboard/recensioni/", hint: "Recensioni del bot" },
  { id: "transcript", label: "Transcript", href: "/dashboard/transcript/", hint: "Log ticket" },
] as const;

export type DashNavId = (typeof DASH_NAV)[number]["id"];

export function dashHref(path: string) {
  return page(path);
}

export function isGuildId(raw: string) {
  return /^\d{17,22}$/.test(String(raw || "").trim());
}

/** URL del pannello server (`/dashboard/guild/?id=`). */
export function guildPageHref(guildId: string) {
  const id = String(guildId || "").trim();
  if (!isGuildId(id)) return page("/dashboard/guild/");
  return page(`/dashboard/guild/?id=${encodeURIComponent(id)}`);
}

/** Memorizza la scelta (come il switcher vecchio) e restituisce l’href del pannello. */
export function selectGuild(guildId: string) {
  const id = String(guildId || "").trim();
  if (isGuildId(id)) {
    try {
      localStorage.setItem(LAST_GUILD_KEY, id);
    } catch {}
  }
  return guildPageHref(id);
}

export function readLastGuildId(): string {
  try {
    let id = String(localStorage.getItem(LAST_GUILD_KEY) || "").trim();
    if (!isGuildId(id)) {
      id = String(sessionStorage.getItem(LEGACY_LAST_GUILD_KEY) || "").trim();
      if (isGuildId(id)) {
        try {
          localStorage.setItem(LAST_GUILD_KEY, id);
          sessionStorage.removeItem(LEGACY_LAST_GUILD_KEY);
        } catch {}
      }
    }
    return isGuildId(id) ? id : "";
  } catch {
    return "";
  }
}

export function readGuildsCache(): DashboardGuild[] | null {
  try {
    const raw = sessionStorage.getItem(GUILDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DashboardGuild[]) : null;
  } catch {
    return null;
  }
}

export function writeGuildsCache(guilds: DashboardGuild[]) {
  try {
    if (!Array.isArray(guilds) || !guilds.length) return;
    sessionStorage.setItem(GUILDS_CACHE_KEY, JSON.stringify(guilds));
  } catch {}
}

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

async function getJson(path: string, token: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const bust = `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const r = await fetch(bust, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    headers: authHeaders(token),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, data };
}

function failFrom(status: number, data: Record<string, unknown>, fallback: string): Fail {
  return {
    ok: false,
    status,
    error: typeof data.error === "string" ? data.error : undefined,
    message: typeof data.message === "string" && data.message.trim() ? data.message : fallback,
  };
}

function mapGuild(row: Record<string, unknown>): DashboardGuild | null {
  const id = String(row?.id || "").trim();
  if (!isGuildId(id)) return null;
  const icon = String(row?.iconUrl || "").trim();
  return {
    id,
    name: String(row?.name || "Server").trim() || "Server",
    iconUrl: icon || null,
    owner: row?.owner === true,
    botPresent: row?.botPresent === true,
    isMainGuild: row?.isMainGuild === true,
    isProtectedGuild: row?.isProtectedGuild === true,
    premiumActive: row?.premiumActive === true,
    ...("premiumUntil" in (row || {})
      ? {
          premiumUntil: Number(row.premiumUntil) > 0 ? Number(row.premiumUntil) : null,
          premiumLifetime: row.premiumLifetime === true,
        }
      : {}),
  };
}

/** GET /webhooks/site-dashboard/access — decide se l’account può aprire la dashboard. */
export async function checkDashboardAccess(token: string): Promise<OkAccess | Fail> {
  try {
    const { status, data } = await getJson(`${BASE}/access`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 429) return failFrom(status, data, "Troppe richieste. Riprova tra poco.");
    if (status >= 500) return failFrom(status, data, "Dashboard temporaneamente non disponibile.");
    if (data.ok === false) return failFrom(status, data, "Impossibile verificare l’accesso alla dashboard.");
    return {
      ok: true,
      access: {
        allowed: data.allowed === true,
        blacklisted: data.blacklisted === true,
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete durante il controllo accesso." };
  }
}

/** GET /webhooks/site-dashboard/guilds — server dove puoi gestire Vinili. */
export async function listManageableGuilds(token: string): Promise<OkGuilds | Fail> {
  try {
    const { status, data } = await getJson(`${BASE}/guilds`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 429) return failFrom(status, data, "Troppe richieste. Riprova tra poco.");
    if (status === 403) {
      const err = typeof data.error === "string" ? data.error : "";
      if (err === "missing_guilds_scope") {
        return failFrom(status, data, "Permesso guilds mancante: effettua di nuovo il login dalla dashboard.");
      }
      if (err === "high_staff_only" || err === "forbidden" || err === "bot_usage_blacklisted") {
        return failFrom(
          status,
          data,
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Questa sezione non è disponibile con il tuo account.",
        );
      }
      return failFrom(status, data, "Non hai i permessi per la dashboard.");
    }
    if (status >= 500) return failFrom(status, data, "Impossibile caricare i server.");

    const rows = Array.isArray(data.guilds) ? data.guilds : null;
    if (rows && data.ok !== false) {
      const guilds = rows
        .map((row) => mapGuild((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
        .filter((g): g is DashboardGuild => Boolean(g));
      const userRaw = data.user && typeof data.user === "object" ? (data.user as Record<string, unknown>) : null;
      writeGuildsCache(guilds);
      return {
        ok: true,
        guilds,
        user: userRaw
          ? { id: String(userRaw.id || ""), username: String(userRaw.username || "") }
          : undefined,
      };
    }
    return failFrom(status, data, "Impossibile caricare i server.");
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento dei server." };
  }
}

export function guildMeta(g: DashboardGuild): string {
  if (!g.botPresent) return "Il bot non è ancora in questo server";
  if (g.isMainGuild) return "Gestione community Vinili & Caffè";
  if (g.isProtectedGuild) return "Apri impostazioni";
  return "Apri impostazioni";
}

/** Badge stato bot (come dashboard-page.js); Premium è badge separato. */
export function guildStatusBadge(g: DashboardGuild): { label: string; tone: "ok" | "warn" | "main" } {
  if (!g.botPresent) return { label: "Invita il bot", tone: "warn" };
  if (g.isMainGuild) return { label: "Server principale", tone: "main" };
  if (g.isProtectedGuild) return { label: "Vinili", tone: "main" };
  return { label: "Bot attivo", tone: "ok" };
}
