import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export const dynamic = "force-static";

/** Allineato alle esclusioni del robots.txt attuale (dashboard/staff/privati). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/",
        "/staff/",
        "/confessionale/",
        "/notifications/",
        "/personalizza/",
        "/dati/",
        "/seratafilm/",
        "/bacheca/mod/",
        "/bacheca/invia/",
        "/bacheca/le-mie/",
        "/*/accesso-richiesto/",
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
