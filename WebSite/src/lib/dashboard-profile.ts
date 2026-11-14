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

export const patchTenantProfile = (
  token: string,
  body: Partial<{ suppressManagerPing: boolean; ephemeralCommands: boolean; language: string; toggleBadgeId: string }>,
) => send("PATCH", token, body);
