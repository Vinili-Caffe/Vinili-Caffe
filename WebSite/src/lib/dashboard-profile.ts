// Dashboard: profilo partnership (preferenze, badge, obiettivi). Solo alto staff: agli altri 403.
// API: GET/PATCH /webhooks/site-dashboard/profile
// Handler: MultiGuild/site/dashboard/siteDashboardTenantProfileApi.ts

const BASE = "/webhooks/site-dashboard/profile";

export type ProfileEmoji = { kind: "custom" | "unicode"; text: string; url: string | null };

export type TenantProfile = {
  scores: { total: number; daily: number; weekly: number };
  prefs: { suppressManagerPing: boolean; ephemeralCommands: boolean; language: string; selectedBadges: string[] };
  languages: { code: string; label: string; flag: string }[];
  awardsPercent: number;
  qualifiesForMissions: boolean;
  objectives: { id: string; title: string; desc: string; emoji: ProfileEmoji; done: boolean; current: number; target: number }[];
  badges: { id: string; title: string; desc: string; emoji: ProfileEmoji; unlocked: boolean; selected: boolean }[];
  maxSelectedBadges: number;
};

type Fail = { ok: false; status: number; message: string };

function emoji(raw: unknown): ProfileEmoji {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { kind: r.kind === "custom" ? "custom" : "unicode", text: String(r.text || "🎯"), url: r.url ? String(r.url) : null };
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : [];
}

function mapProfile(d: Record<string, unknown>): TenantProfile {
  const scores = (d.scores && typeof d.scores === "object" ? d.scores : {}) as Record<string, unknown>;
  const prefs = (d.prefs && typeof d.prefs === "object" ? d.prefs : {}) as Record<string, unknown>;
  const limits = (d.limits && typeof d.limits === "object" ? d.limits : {}) as Record<string, unknown>;
  return {
    scores: { total: Number(scores.total) || 0, daily: Number(scores.daily) || 0, weekly: Number(scores.weekly) || 0 },
    prefs: {
      suppressManagerPing: prefs.suppressManagerPing === true,
      ephemeralCommands: prefs.ephemeralCommands === true,
      language: String(prefs.language || "it"),
      selectedBadges: Array.isArray(prefs.selectedBadges) ? prefs.selectedBadges.map(String) : [],
    },
    languages: arr(d.languages).map((l) => ({ code: String(l.code || ""), label: String(l.label || l.code || ""), flag: String(l.flag || "") })),
    awardsPercent: Math.max(0, Math.min(100, Number(d.awardsPercent) || 0)),
    qualifiesForMissions: d.qualifiesForMissions === true,
    objectives: arr(d.objectives).map((o) => ({
      id: String(o.id || ""),
      title: String(o.title || o.id || ""),
      desc: String(o.desc || ""),
      emoji: emoji(o.emoji),
      done: o.done === true,
      current: Number(o.current) || 0,
      target: Math.max(1, Number(o.target) || 1),
    })),
    badges: arr(d.badges).map((b) => ({
      id: String(b.id || ""),
      title: String(b.title || b.id || ""),
      desc: String(b.desc || ""),
      emoji: emoji(b.emoji),
      unlocked: b.unlocked === true,
      selected: b.selected === true,
    })),
    maxSelectedBadges: Number(limits.maxSelectedBadges) || 2,
  };
}

async function send(method: "GET" | "PATCH", token: string, body?: unknown): Promise<{ ok: true; profile: TenantProfile } | Fail> {
  try {
    const r = await fetch(method === "GET" ? `${BASE}?_=${Date.now()}` : BASE, {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || data.ok === false) {
      return { ok: false, status: r.status, message: typeof data.message === "string" ? data.message : "Profilo non disponibile." };
    }
    return { ok: true, profile: mapProfile(data) };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export const loadTenantProfile = (token: string) => send("GET", token);

type PmBody = Partial<{ suppressManagerPing: boolean; ephemeralCommands: boolean; language: string; toggleBadgeId: string }>;

/** Lo stesso profilo partnership in un server qualsiasi (profilo del sito): solo il tuo, se lì sei Partner Manager. */
async function sendPm(token: string, guildId: string, body?: PmBody): Promise<{ ok: true; profile: TenantProfile } | Fail> {
  try {
    const url = body ? "/webhooks/site-profile-extras" : `/webhooks/site-profile-extras?section=pm&guild=${encodeURIComponent(guildId)}&_=${Date.now()}`;
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify({ section: "pm", guild: guildId, ...body }) : undefined,
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || data.ok === false) {
      return { ok: false, status: r.status, message: typeof data.message === "string" ? data.message : "Profilo non disponibile." };
    }
    return { ok: true, profile: mapProfile(data) };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

/** Preferenze del bot (comandi partnership): uguali in tutti i server. */
export type BotPrefs = {
  prefs: { suppressManagerPing: boolean; ephemeralCommands: boolean; language: string };
  languages: { code: string; label: string; flag: string }[];
};

async function sendBotPrefs(token: string, body?: Partial<BotPrefs["prefs"]>): Promise<{ ok: true; data: BotPrefs } | Fail> {
  try {
    const r = await fetch(body ? "/webhooks/site-profile-extras" : `/webhooks/site-profile-extras?section=botprefs&_=${Date.now()}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify({ section: "botprefs", ...body }) : undefined,
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || d.ok === false) return { ok: false, status: r.status, message: typeof d.message === "string" ? d.message : "Preferenze non disponibili." };
    const p = (d.prefs || {}) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        prefs: { suppressManagerPing: p.suppressManagerPing === true, ephemeralCommands: p.ephemeralCommands === true, language: String(p.language || "it") },
        languages: Array.isArray(d.languages) ? (d.languages as BotPrefs["languages"]) : [],
      },
    };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}
export const loadBotPrefs = (token: string) => sendBotPrefs(token);
export const patchBotPrefs = (token: string, body: Partial<BotPrefs["prefs"]>) => sendBotPrefs(token, body);

export const loadPmProfile = (token: string, guildId: string) => sendPm(token, guildId);
export const patchPmProfile = (token: string, guildId: string, body: PmBody) => sendPm(token, guildId, body);

/** Cronologia partnership del server (profilo staff, come +history). */
export type PmPartnershipHistory = {
  days: number | null;
  uniqueServers: number;
  totalPartnerships: number;
  page: number;
  totalPages: number;
  entries: {
    guildId: string | null;
    guildName: string | null;
    iconUrl: string | null;
    count: number;
    lastAt: string | null;
    invite: string | null;
  }[];
};

export async function loadPmPartnershipHistory(
  token: string,
  guildId: string,
  query: { days?: number; page?: number; pageSize?: number } = {},
): Promise<{ ok: true; data: PmPartnershipHistory } | Fail> {
  try {
    const params = new URLSearchParams({ section: "pmhistory", guild: guildId, _: String(Date.now()) });
    if (query.days) params.set("days", String(query.days));
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const r = await fetch(`/webhooks/site-profile-extras?${params}`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || data.ok === false) {
      return { ok: false, status: r.status, message: typeof data.message === "string" ? data.message : "Cronologia non disponibile." };
    }
    const entries = Array.isArray(data.entries)
      ? data.entries.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const e = row as Record<string, unknown>;
          return [
            {
              guildId: e.guildId ? String(e.guildId) : null,
              guildName: e.guildName ? String(e.guildName) : null,
              iconUrl: e.iconUrl ? String(e.iconUrl) : null,
              count: Number(e.count) || 0,
              lastAt: e.lastAt ? String(e.lastAt) : null,
              invite: e.invite ? String(e.invite) : null,
            },
          ];
        })
      : [];
    return {
      ok: true,
      data: {
        days: data.days == null ? null : Number(data.days) || 0,
        uniqueServers: Number(data.uniqueServers) || 0,
        totalPartnerships: Number(data.totalPartnerships) || 0,
        page: Number(data.page) || 1,
        totalPages: Number(data.totalPages) || 1,
        entries,
      },
    };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete durante il caricamento cronologia." };
  }
}

export const patchTenantProfile = (
  token: string,
  body: Partial<{ suppressManagerPing: boolean; ephemeralCommands: boolean; language: string; toggleBadgeId: string }>,
) => send("PATCH", token, body);
