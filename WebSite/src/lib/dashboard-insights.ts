// Dashboard: statistiche del server e registro delle modifiche.
// API: GET /webhooks/site-dashboard/guilds/:id/stats?days= · GET …/audit?page=&area=
// Handler: MultiGuild/site/dashboard/dashboardStatsApi.ts, dashboardAuditLog.ts

const BASE = "/webhooks/site-dashboard/guilds";

type Fail = { ok: false; status: number; message: string };

async function getJson(url: string, token: string): Promise<{ ok: true; data: Record<string, unknown> } | Fail> {
  try {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 404) return { ok: false, status: 404, message: "Arriva col prossimo aggiornamento del bot." };
    if (r.status !== 200 || data.ok === false) return { ok: false, status: r.status, message: typeof data.message === "string" ? data.message : "Dati non disponibili." };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export type GuildStats = {
  days: number;
  axis: string[];
  tickets: {
    openNow: number;
    opened: number;
    openedPrev: number;
    closed: number;
    avgResolutionMs: number | null;
    avgRating: number | null;
    ratings: number[];
    ratingCount: number;
    openedByDay: number[];
    closedByDay: number[];
    types: { type: string; count: number }[];
    topStaff: { userId: string; name: string | null; closed: number; claimed: number; total: number }[];
  };
  partnerships: { total: number; prev: number; byDay: number[]; topManagers: { userId: string; name: string | null; count: number }[] };
};

export async function loadGuildStats(token: string, guildId: string, days: number): Promise<{ ok: true; stats: GuildStats } | Fail> {
  const r = await getJson(`${BASE}/${encodeURIComponent(guildId)}/stats?days=${days}`, token);
  if (!r.ok) return r;
  const d = r.data;
  const t = rec(d.tickets);
  const p = rec(d.partnerships);
  return {
    ok: true,
    stats: {
      days: num(d.days) || days,
      axis: arr(d.axis).map(String),
      tickets: {
        openNow: num(t.openNow),
        opened: num(t.opened),
        openedPrev: num(t.openedPrev),
        closed: num(t.closed),
        avgResolutionMs: t.avgResolutionMs == null ? null : num(t.avgResolutionMs),
        avgRating: t.avgRating == null ? null : num(t.avgRating),
        ratings: arr(t.ratings).map(num),
        ratingCount: num(t.ratingCount),
        openedByDay: arr(t.openedByDay).map(num),
        closedByDay: arr(t.closedByDay).map(num),
        types: arr(t.types).map((x) => ({ type: String(rec(x).type || "supporto"), count: num(rec(x).count) })),
        topStaff: arr(t.topStaff).map((x) => {
          const s = rec(x);
          return { userId: String(s.userId || ""), name: s.name ? String(s.name) : null, closed: num(s.closed), claimed: num(s.claimed), total: num(s.total) };
        }),
      },
      partnerships: {
        total: num(p.total),
        prev: num(p.prev),
        byDay: arr(p.byDay).map(num),
        topManagers: arr(p.topManagers).map((x) => {
          const m = rec(x);
          return { userId: String(m.userId || ""), name: m.name ? String(m.name) : null, count: num(m.count) };
        }),
      },
    },
  };
}

export type AuditRow = { at: number; userId: string | null; username: string | null; avatar: string | null; action: string; area: string; fields: string[] };

export async function loadGuildAudit(
  token: string,
  guildId: string,
  page: number,
  area: string,
): Promise<{ ok: true; rows: AuditRow[]; page: number; pages: number; total: number } | Fail> {
  const r = await getJson(`${BASE}/${encodeURIComponent(guildId)}/audit?page=${page}&area=${encodeURIComponent(area)}`, token);
  if (!r.ok) return r;
  return {
    ok: true,
    page: num(r.data.page) || 1,
    pages: num(r.data.pages) || 1,
    total: num(r.data.total),
    rows: arr(r.data.rows).map((x) => {
      const a = rec(x);
      return {
        at: num(a.at),
        userId: a.userId ? String(a.userId) : null,
        username: a.username ? String(a.username) : null,
        avatar: a.avatar ? String(a.avatar) : null,
        action: String(a.action || "Modifica"),
        area: String(a.area || "altro"),
        fields: arr(a.fields).map(String),
      };
    }),
  };
}
