import { apiUrl } from "./api";

// Uptime Kuma (pagina pubblica "vinili") via api. — non via www (trailingSlash → 404 Next)

export type Beat = { status: number; time: string; ping: number | null; msg?: string };
export type Service = { id: string; name: string; beats: Beat[]; uptime24: number | null };
export type Incident = { title: string; content?: string; style?: string; lastUpdatedDate?: string } | null;
export type StatusData = {
  services: Service[];
  incident: Incident;
  maintenance: { title: string; description?: string }[];
  fetchedAt: number;
};

export type ProcessLive = {
  id: string;
  name: string;
  ok: boolean;
  status: string;
  bot: string | null;
  gatewayPingMs: number | null;
  restPingMs: number | null;
  mongoPingMs: number | null;
  uptimeSec: number | null;
  memMb: number | null;
  shard: string | null;
  checks: Record<string, boolean> | null;
};

export type MetricRange = "day" | "week" | "month";
export type MetricPoint = { t: number; label: string; ms: number };
export type PastIncidentDay = { key: string; label: string; ok: boolean; detail: string };

// codici di Uptime Kuma
export const UP = 1;
export const DOWN = 0;
export const PENDING = 2;
export const MAINT = 3;

export async function loadStatus(_origin = ""): Promise<StatusData | null> {
  try {
    const [pageRes, hbRes] = await Promise.all([
      fetch(apiUrl("/status-kuma/api/status-page/vinili"), { cache: "no-store" }),
      fetch(apiUrl("/status-kuma/api/status-page/heartbeat/vinili"), { cache: "no-store" }),
    ]);
    const pageJ = await pageRes.json();
    const hb = await hbRes.json();
    const services: Service[] = [];
    for (const g of pageJ.publicGroupList ?? []) {
      for (const m of g.monitorList ?? []) {
        const id = String(m.id);
        services.push({
          id,
          name: m.name,
          beats: (hb.heartbeatList?.[id] ?? []) as Beat[],
          uptime24: typeof hb.uptimeList?.[`${id}_24`] === "number" ? hb.uptimeList[`${id}_24`] : null,
        });
      }
    }
    if (!services.length) return null;
    return {
      services,
      incident: pageJ.incident ?? null,
      maintenance: (pageJ.maintenanceList ?? []).map((x: { title?: string; description?: string }) => ({
        title: x.title ?? "Manutenzione",
        description: x.description,
      })),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export const loadBuildStatus = () => loadStatus();

async function fetchJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Metriche live dei processi bot, da /webhooks/health. */
export async function loadLiveProcesses(): Promise<ProcessLive[]> {
  const health = await fetchJson("/webhooks/health");
  if (!health) return [];

  const coffee = (health.coffeeDetail as Record<string, unknown> | null) || null;
  const checks = (health.checks as Record<string, boolean> | null) || null;

  const vinyls: ProcessLive = {
    id: "vinyls",
    name: "Bot Vinili",
    ok: Boolean(health.ok) && Boolean(checks?.bot !== false),
    status: String(health.status || (health.ok ? "online" : "degraded")),
    bot: health.bot != null ? String(health.bot) : null,
    gatewayPingMs: numOrNull(health.gatewayPingMs),
    restPingMs: numOrNull(health.restPingMs),
    mongoPingMs: numOrNull(health.mongoPingMs),
    uptimeSec: numOrNull(health.uptimeSec),
    memMb: numOrNull(health.memMb),
    shard: health.shard != null ? String(health.shard) : null,
    checks,
  };

  const caffe: ProcessLive = {
    id: "coffee",
    name: "Bot Caffè",
    ok: Boolean(coffee?.ok ?? checks?.coffee),
    status: String(coffee?.status || (checks?.coffee ? "online" : "offline")),
    bot: coffee?.bot != null ? String(coffee.bot) : health.coffee != null ? String(health.coffee) : null,
    gatewayPingMs: numOrNull(coffee?.gatewayPingMs),
    restPingMs: numOrNull(coffee?.restPingMs),
    mongoPingMs: numOrNull(coffee?.mongoPingMs),
    uptimeSec: numOrNull(coffee?.uptimeSec),
    memMb: numOrNull(coffee?.memMb),
    shard: coffee?.shard != null ? String(coffee.shard) : null,
    checks: null,
  };

  return [vinyls, caffe];
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const lastStatus = (s: Service) => s.beats[s.beats.length - 1]?.status ?? PENDING;
export const lastPing = (s: Service) => {
  for (let i = s.beats.length - 1; i >= 0; i--) if (s.beats[i].ping != null) return s.beats[i].ping;
  return null;
};
/** "2026-10-23 11:17:39.096" (UTC) → ora locale */
export const beatTime = (t: string) => new Date(t.replace(" ", "T") + "Z");

export function formatUptime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Preferisci il monitor sito come “API response time”; fallback media di tutti. */
function pickApiBeats(services: Service[]): Beat[] {
  const preferred =
    services.find((s) => /sito/i.test(s.name)) ||
    services.find((s) => /api/i.test(s.name)) ||
    services[0];
  return preferred?.beats?.length ? preferred.beats : [];
}

function bucketMs(range: MetricRange): number {
  if (range === "week") return 6 * 60 * 60 * 1000;
  if (range === "month") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function windowMs(range: MetricRange): number {
  if (range === "week") return 7 * 24 * 60 * 60 * 1000;
  if (range === "month") return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function formatBucketLabel(t: number, range: MetricRange): string {
  const d = new Date(t);
  if (range === "day") {
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

/** Serie latenza media (ms) dai heartbeat Kuma, per Day/Week/Month. */
export function buildResponseTimeSeries(services: Service[], range: MetricRange = "day"): MetricPoint[] {
  const beats = pickApiBeats(services).filter((b) => b.ping != null && Number.isFinite(Number(b.ping)));
  if (!beats.length) return [];

  const now = Date.now();
  const from = now - windowMs(range);
  const step = bucketMs(range);
  const buckets = new Map<number, { sum: number; n: number }>();

  for (const b of beats) {
    const t = beatTime(b.time).getTime();
    if (!Number.isFinite(t) || t < from) continue;
    const key = Math.floor(t / step) * step;
    const cur = buckets.get(key) || { sum: 0, n: 0 };
    cur.sum += Number(b.ping);
    cur.n += 1;
    buckets.set(key, cur);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, { sum, n }]) => ({
      t,
      label: formatBucketLabel(t, range),
      ms: Math.round(sum / Math.max(1, n)),
    }));
}

/** Ultimi N giorni: incidente se c’è stato almeno un beat DOWN. */
export function buildPastIncidentDays(services: Service[], days = 7): PastIncidentDay[] {
  const out: PastIncidentDay[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const start = day.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const key = day.toISOString().slice(0, 10);
    const label = day.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const downNames = new Set<string>();
    for (const s of services) {
      for (const b of s.beats) {
        if (b.status !== DOWN) continue;
        const t = beatTime(b.time).getTime();
        if (t >= start && t < end) downNames.add(s.name);
      }
    }

    if (downNames.size) {
      out.push({
        key,
        label,
        ok: false,
        detail: `Interruzione su ${[...downNames].join(", ")}.`,
      });
    } else {
      out.push({
        key,
        label,
        ok: true,
        detail: i === 0 ? "Nessun incidente segnalato oggi." : "Nessun incidente segnalato.",
      });
    }
  }
  return out;
}

export type OverallStatus = {
  code: typeof UP | typeof DOWN | typeof PENDING | typeof MAINT;
  /** chiave i18n footer.status* */
  labelKey: "footer.statusOk" | "footer.statusDown" | "footer.statusSlow" | "footer.statusMaint" | "footer.statusUnknown";
  led: string;
  ping: string;
};

/** Peggiore tra i servizi: DOWN > MAINT > PENDING > UP. */
export function overallStatus(data: StatusData | null): OverallStatus {
  const unknown: OverallStatus = {
    code: PENDING,
    labelKey: "footer.statusUnknown",
    led: "bg-crema/40",
    ping: "bg-crema/30",
  };
  if (!data?.services.length) return unknown;
  const codes = data.services.map(lastStatus);
  if (codes.some((c) => c === DOWN)) {
    return { code: DOWN, labelKey: "footer.statusDown", led: "bg-red-500", ping: "bg-red-400/70" };
  }
  if (codes.some((c) => c === MAINT)) {
    return { code: MAINT, labelKey: "footer.statusMaint", led: "bg-sky-400", ping: "bg-sky-400/70" };
  }
  if (codes.some((c) => c === PENDING)) {
    return { code: PENDING, labelKey: "footer.statusSlow", led: "bg-amber-400", ping: "bg-amber-400/70" };
  }
  return { code: UP, labelKey: "footer.statusOk", led: "bg-emerald-400", ping: "bg-emerald-400/70" };
}
