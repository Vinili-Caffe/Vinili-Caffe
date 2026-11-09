// Dashboard: pannello sviluppatore (solo bot dev; agli altri 403) + blacklist uso bot (alto staff).
// API: /webhooks/site-dashboard/dev/* e /webhooks/site-dashboard/botban
// Handler: MultiGuild/site/dashboard/siteDashboardBotDevApi.ts, siteDashboardBotbanApi.ts

const BASE = "/webhooks/site-dashboard";

type Fail = { ok: false; status: number; message: string };
type Res<T> = ({ ok: true } & T) | Fail;

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, token: string, map: (d: Record<string, unknown>) => T, body?: unknown): Promise<Res<T>> {
  try {
    const url = method === "GET" ? `${BASE}${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}` : `${BASE}${path}`;
    const r = await fetch(url, {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || d.ok === false) {
      return { ok: false, status: r.status, message: typeof d.message === "string" && d.message ? d.message : "Operazione non riuscita." };
    }
    return { ok: true, ...map(d) };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

const str = (v: unknown) => (v == null ? null : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : []);

export type DevEvent = { id: string; type: string; guildId: string; guildName: string | null; ownerId: string | null; memberCount: number | null; actorId: string | null; note: string | null; at: string };

const mapEvent = (e: Record<string, unknown>): DevEvent => ({
  id: String(e.id || `${e.at}-${e.guildId}`),
  type: String(e.type || ""),
  guildId: String(e.guildId || ""),
  guildName: str(e.guildName),
  ownerId: str(e.ownerId),
  memberCount: e.memberCount != null ? Number(e.memberCount) : null,
  actorId: str(e.actorId),
  note: str(e.note),
  at: String(e.at || ""),
});

export type DevOverview = { botTag: string | null; guildCount: number; registryCount: number; blacklistUsers: number; blacklistGuilds: number; recentEvents: DevEvent[] };

export const loadDevOverview = (token: string) =>
  call<{ overview: DevOverview }>("GET", "/dev/overview", token, (d) => ({
    overview: {
      botTag: str(d.botTag),
      guildCount: Number(d.guildCount) || 0,
      registryCount: Number(d.registryCount) || 0,
      blacklistUsers: Number(d.blacklistUsers) || 0,
      blacklistGuilds: Number(d.blacklistGuilds) || 0,
      recentEvents: list(d.recentEvents).map(mapEvent),
    },
  }));

export const loadDevEvents = (token: string, type = "all") =>
  call<{ events: DevEvent[] }>("GET", `/dev/events?limit=250&type=${encodeURIComponent(type)}`, token, (d) => ({ events: list(d.events).map(mapEvent) }));

export type DevGuild = { id: string; name: string; iconUrl: string | null; ownerId: string | null; memberCount: number; protected: boolean; premiumActive: boolean; joinedAt: string | null };

export const loadDevGuilds = (token: string, q: string) =>
  call<{ guilds: DevGuild[]; total: number }>("GET", `/dev/guilds?limit=200&q=${encodeURIComponent(q)}`, token, (d) => ({
    total: Number(d.total) || 0,
    guilds: list(d.guilds).map((g) => ({
      id: String(g.id || ""),
      name: String(g.name || g.id || ""),
      iconUrl: str(g.iconUrl),
      ownerId: str(g.ownerId),
      memberCount: Number(g.memberCount) || 0,
      protected: g.protected === true,
      premiumActive: g.premiumActive === true,
      joinedAt: str(g.joinedAt),
    })),
  }));

type ActionOk = { message: string };
const msg = (d: Record<string, unknown>): ActionOk => ({ message: String(d.message || "Fatto.") });

export const devLeaveGuild = (token: string, guildId: string, note: string) => call("POST", "/dev/leave", token, msg, { guildId, note });
export const devBanGuild = (token: string, guildId: string, note: string) => call("POST", "/dev/guild-botban", token, msg, { guildId, note });
export const devBanOwner = (token: string, guildId: string, note: string) => call("POST", "/dev/owner-botban", token, msg, { guildId, note });
export const devResetGuild = (token: string, guildId: string, leave: boolean, note: string) => call("POST", "/dev/reset-guild", token, msg, { guildId, leave, note });
export const devRevokePremium = (token: string, guildId: string, refundCredits: boolean, note: string) =>
  call("POST", "/dev/revoke-premium", token, msg, { guildId, refundCredits, note });

export type DevUser = { id: string; username: string; displayName: string; avatarUrl: string; bannerUrl: string | null; accentColor: number | null; bot: boolean; createdAt: string };

export const loadDevUser = (token: string, userId: string) =>
  call<{ user: DevUser }>("GET", `/dev/user?userId=${encodeURIComponent(userId)}`, token, (d) => {
    const u = (d.user && typeof d.user === "object" ? d.user : {}) as Record<string, unknown>;
    return {
      user: {
        id: String(u.id || userId),
        username: String(u.username || ""),
        displayName: String(u.displayName || u.username || userId),
        avatarUrl: String(u.avatarUrl || ""),
        bannerUrl: str(u.bannerUrl),
        accentColor: u.accentColor != null ? Number(u.accentColor) : null,
        bot: u.bot === true,
        createdAt: String(u.createdAt || ""),
      },
    };
  });

export type CreditHolder = { userId: string; credits: number; updatedAt: number | null; username: string | null; displayName: string | null; avatarUrl: string | null };

export const loadCreditHolders = (token: string, q: string, page: number) =>
  call<{ users: CreditHolder[]; total: number; page: number; pages: number }>("GET", `/dev/credits?limit=15&page=${page}&q=${encodeURIComponent(q)}`, token, (d) => ({
    total: Number(d.total) || 0,
    page: Number(d.page) || 1,
    pages: Number(d.pages) || 1,
    users: list(d.users).map((u) => ({
      userId: String(u.userId || ""),
      credits: Number(u.credits) || 0,
      updatedAt: u.updatedAt != null ? Number(u.updatedAt) : null,
      username: str(u.username),
      displayName: str(u.displayName),
      avatarUrl: str(u.avatarUrl),
    })),
  }));

export const loadUserCredits = (token: string, userId: string) =>
  call<{ credits: number }>("GET", `/dev/credits?userId=${encodeURIComponent(userId)}`, token, (d) => ({ credits: Number(d.credits) || 0 }));

export const adjustUserCredits = (token: string, userId: string, delta: number, note: string) =>
  call<{ credits: number }>("POST", "/dev/credits", token, (d) => ({ credits: Number(d.credits) || 0 }), { userId, delta, note });

export type BotbanEntry = { id: string; type: "user" | "guild"; note: string; addedBy: string | null; addedAt: string | null; name: string | null; iconUrl: string | null };

export const loadBotban = (token: string) =>
  call<{ entries: BotbanEntry[] }>("GET", "/botban?kind=all", token, (d) => ({
    entries: list(d.entries).map((e) => ({
      id: String(e.id || ""),
      type: e.type === "guild" ? "guild" : "user",
      note: String(e.note || ""),
      addedBy: str(e.addedBy),
      addedAt: str(e.addedAt),
      name: str(e.name),
      iconUrl: str(e.iconUrl),
    })),
  }));

export const addBotban = (token: string, kind: "user" | "guild", id: string, note: string) => call("POST", "/botban", token, msg, { kind, id, note });
export const removeBotban = (token: string, kind: "user" | "guild", id: string) =>
  call("DELETE", `/botban/${kind}/${encodeURIComponent(id)}`, token, msg);

/* ── sono sviluppatore? (una sola richiesta per visita, la usa anche il menu) ── */
let devState: boolean | null = null;
let devLoading: Promise<boolean> | null = null;
const devListeners = new Set<() => void>();

export function subscribeDev(fn: () => void) {
  devListeners.add(fn);
  return () => {
    devListeners.delete(fn);
  };
}
export const getIsDev = () => devState;

export function ensureIsDev(token: string): Promise<boolean> {
  if (devState != null) return Promise.resolve(devState);
  if (devLoading) return devLoading;
  devLoading = loadDevOverview(token).then((r) => {
    devState = r.ok;
    devLoading = null;
    devListeners.forEach((fn) => fn());
    return devState;
  });
  return devLoading;
}
