/**
 * Analytics sito pubblico.
 * Same-origin `/site-analytics.json` (rewrite Vercel → api): evita CORS.
 * apiUrl()+credentials include su ACAO:* veniva bloccato dal browser → sempre "—".
 */
import { SITE_ORIGIN } from "./site";

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

export async function loadSiteAnalytics(origin = ""): Promise<SiteAnalytics | null> {
  try {
    const base =
      origin ||
      (typeof location !== "undefined" ? "" : SITE_ORIGIN);
    const href = `${base}/site-analytics.json?t=${Date.now()}`;
    const r = await fetch(href, { cache: "no-store", credentials: "omit" });
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
