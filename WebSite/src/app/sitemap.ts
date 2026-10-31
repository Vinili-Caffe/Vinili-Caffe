import type { MetadataRoute } from "next";
import { REACT_PAGES, SITE_ORIGIN } from "@/lib/site";

export const dynamic = "force-static";

const NOINDEX = new Set([
  "/dashboard/",
  "/staff/",
  "/confessionale/",
  "/notifications/",
  "/personalizza/",
  "/dati/",
  "/seratafilm/",
  "/seratafilm/grazie/",
  "/seratafilm/accesso-richiesto/",
  "/vetrina/mod/",
  "/vetrina/invia/",
  "/vetrina/le-mie/",
  "/vetrina/vota/",
  "/tickets/",
  "/appelli/",
  "/candidature/",
]);

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [...REACT_PAGES]
    .filter((p) => !NOINDEX.has(p) && !p.includes("accesso-richiesto") && !p.startsWith("/dashboard") && !p.startsWith("/staff"))
    .map((path) => ({
      url: `${SITE_ORIGIN}${path}`,
      lastModified: now,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : 0.7,
    }));
}
