// Dashboard: centro notifiche (campanella).
// API: GET /webhooks/site-dashboard/notifications, POST /webhooks/site-dashboard/notifications/read
// Handler: MultiGuild/site/dashboard/siteDashboardStaffNotificationsApi.ts
// Mix: avvisi live (premium, bot assente, ticket fermi) + eventi (bot uscito) + staff (solo alto staff).

const BASE = "/webhooks/site-dashboard/notifications";

export type DashNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
  href: string | null;
  guildId: string | null;
  guildName: string | null;
  source: "live" | "event" | "staff" | string;
};

export type NotificationsResult =
  | { ok: true; unread: number; items: DashNotification[] }
  | { ok: false; status: number; message: string };

function mapItems(raw: unknown): DashNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const body = String(r.body || "").trim();
    const title = String(r.title || body || "Notifica").trim();
    return [
      {
        id: String(r.id || r.at || Math.random()),
        type: String(r.type || "info").trim() || "info",
        title,
        body: body || title,
        at: Number(r.at) || Date.now(),
        read: r.read === true,
        href: r.href ? String(r.href) : null,
        guildId: r.guildId ? String(r.guildId) : null,
        guildName: r.guildName ? String(r.guildName) : null,
        source: String(r.source || "live"),
      },
    ];
  });
}

async function send(method: "GET" | "POST", url: string, token: string): Promise<NotificationsResult> {
  try {
    const r = await fetch(method === "GET" ? `${url}?_=${Date.now()}` : url, {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || data.ok === false) {
      return { ok: false, status: r.status, message: typeof data.message === "string" ? data.message : "Notifiche non disponibili." };
    }
    return { ok: true, unread: Math.max(0, Number(data.unread) || 0), items: mapItems(data.items) };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export function loadNotifications(token: string) {
  return send("GET", BASE, token);
}

export function markNotificationsRead(token: string) {
  return send("POST", `${BASE}/read`, token);
}

/** "adesso", "5 min fa", "3 ore fa", "ieri", "12 ott". */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "adesso";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "1 ora fa" : `${h} ore fa`;
  const d = Math.round(h / 24);
  if (d === 1) return "ieri";
  if (d < 7) return `${d} giorni fa`;
  return new Date(at).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
