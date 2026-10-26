/** Analytics sito pubblico via api. (non www — evita 404 Vercel). */
import { apiUrl } from "./api";

export type SiteAnalytics = {
  ok: true;
  source: "ga4" | "nginx";
  label: string;
  periodDays: number;
  from?: string;
  to?: string;
  pageViews: number;
  users: number;
  sessions: number;
  pagesPerSession?: number;
  updatedAt?: string;
};

export async function loadSiteAnalytics(_origin = ""): Promise<SiteAnalytics | null> {
  try {
    const r = await fetch(apiUrl("/site-analytics.json"), { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<SiteAnalytics>;
    if (!j || j.ok !== true) return null;
    return {
      ok: true,
      source: j.source === "ga4" ? "ga4" : "nginx",
      label: String(j.label || "Periodo recente"),
      periodDays: Number(j.periodDays) || 0,
      from: j.from,
      to: j.to,
      pageViews: Number(j.pageViews) || 0,
      users: Number(j.users) || 0,
      sessions: Number(j.sessions) || 0,
      pagesPerSession: j.pagesPerSession != null ? Number(j.pagesPerSession) : undefined,
      updatedAt: j.updatedAt,
    };
  } catch {
    return null;
  }
}
