import { SITE_ORIGIN } from "./site";

// Uptime Kuma (pagina pubblica "vinili"), letto tramite il sito: /status-kuma/api/status-page/…

export type Beat = { status: number; time: string; ping: number | null; msg?: string };
export type Service = { id: string; name: string; beats: Beat[]; uptime24: number | null };
export type Incident = { title: string; content?: string; style?: string; lastUpdatedDate?: string } | null;
export type StatusData = { services: Service[]; incident: Incident; maintenance: { title: string; description?: string }[]; fetchedAt: number };

// codici di Uptime Kuma
export const UP = 1;
export const DOWN = 0;
export const PENDING = 2;
export const MAINT = 3;

const base = (origin: string) => `${origin}/status-kuma/api/status-page`;

export async function loadStatus(origin = ""): Promise<StatusData | null> {
  try {
    const [pageRes, hbRes] = await Promise.all([
      fetch(`${base(origin)}/vinili`, { cache: "no-store" }),
      fetch(`${base(origin)}/heartbeat/vinili`, { cache: "no-store" }),
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
      maintenance: (pageJ.maintenanceList ?? []).map((x: { title?: string; description?: string }) => ({ title: x.title ?? "Manutenzione", description: x.description })),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export const loadBuildStatus = () => loadStatus(SITE_ORIGIN);

export const lastStatus = (s: Service) => s.beats[s.beats.length - 1]?.status ?? PENDING;
export const lastPing = (s: Service) => {
  for (let i = s.beats.length - 1; i >= 0; i--) if (s.beats[i].ping != null) return s.beats[i].ping;
  return null;
};
/** "2026-10-23 11:17:39.096" (UTC) → ora locale */
export const beatTime = (t: string) => new Date(t.replace(" ", "T") + "Z");

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
