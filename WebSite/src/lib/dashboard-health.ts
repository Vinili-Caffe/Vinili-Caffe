// Dashboard: "Salute del bot" — cosa non funziona nel server (permessi, canali, ruoli) e come sistemarlo.
// API: GET /webhooks/site-dashboard/guilds/:id/health
// Handler: MultiGuild/site/dashboard/dashboardHealthApi.ts

export type HealthLevel = "ok" | "warn" | "error" | "info";
export type HealthCheck = { id: string; area: string; level: HealthLevel; title: string; detail: string; fix: string | null; channelId: string | null };
export type GuildHealth = {
  botPresent: boolean;
  admin: boolean;
  botRole: { id: string; name: string; position: number; total: number } | null;
  checks: HealthCheck[];
  summary: { error: number; warn: number; ok: number };
  checkedAt: number;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const lv = (v: unknown): HealthLevel => (v === "ok" || v === "warn" || v === "error" || v === "info" ? v : "info");

export async function loadGuildHealth(token: string, guildId: string): Promise<{ ok: true; health: GuildHealth } | { ok: false; message: string }> {
  try {
    const r = await fetch(`/webhooks/site-dashboard/guilds/${encodeURIComponent(guildId)}/health?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 404) return { ok: false, message: "Arriva col prossimo aggiornamento del bot." };
    if (r.status !== 200 || d.ok === false) return { ok: false, message: typeof d.message === "string" ? d.message : "Controllo non disponibile." };
    const s = rec(d.summary);
    const role = rec(d.botRole);
    return {
      ok: true,
      health: {
        botPresent: d.botPresent !== false,
        admin: d.admin === true,
        botRole: role.id ? { id: String(role.id), name: String(role.name || ""), position: num(role.position), total: num(role.total) } : null,
        checks: (Array.isArray(d.checks) ? d.checks : []).map((c) => {
          const x = rec(c);
          return {
            id: String(x.id || ""),
            area: String(x.area || "generale"),
            level: lv(x.level),
            title: String(x.title || ""),
            detail: String(x.detail || ""),
            fix: x.fix ? String(x.fix) : null,
            channelId: x.channelId ? String(x.channelId) : null,
          };
        }),
        summary: { error: num(s.error), warn: num(s.warn), ok: num(s.ok) },
        checkedAt: num(d.checkedAt) || Date.now(),
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}
