// Banner "Sito web" (prodotto Sponsor). Stessa config del sito vecchio:
// WebSite/site.config.json → siteSponsorAd, iniettata come window.__VC_SITE_SPONSOR_AD.
// UI vecchia: vc-site-sponsor-ad.js. Nessun testo inventato: se la finestra è scaduta, il banner non esce.

export type SponsorAdConfig = {
  enabled?: boolean;
  id?: string;
  title?: string;
  badge?: string;
  description?: string;
  buttonUrl?: string;
  buttonLabel?: string;
  startAt?: string;
  until?: string;
  startMs?: number;
  untilMs?: number;
};

/** Copia di site.config.json `siteSponsorAd` (Asteris, giugno–luglio 2026). */
export const SPONSOR_AD_CONFIG: SponsorAdConfig = {
  enabled: true,
  id: "asteris-gaming-2026-06",
  title: "Asteris Gaming Anime Chill Nitro",
  badge: "Sponsor",
  description:
    "  ITA • Community accogliente\n• Vocali e chat testuali sempre attive\n• Staff gentile e preparato\n• Eventi in palio Nitro Boost da 10 euro\n\nEntrate e non ve ne pentirete!",
  buttonUrl: "https://discord.gg/asteris-gaminganimechillnitro-1267522772029145170",
  buttonLabel: "Entra su Asteris Gaming",
  startAt: "2026-06-03T21:00:00",
  until: "2026-07-03T23:59:59",
};

export const SPONSOR_AD_BOOT = `window.__VC_SITE_SPONSOR_AD=${JSON.stringify(SPONSOR_AD_CONFIG).replace(/</g, "\\u003c")};`;

export const SPONSOR_DISMISS_KEY = "vc_site_sponsor_dismiss_v1";

function parseMs(value: unknown, endOfDay: boolean) {
  const d = String(value || "").trim();
  if (!d) return NaN;
  const cleaned = d.replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{2})$/, "T$1:$2:$3");
  if (cleaned.indexOf("T") < 0 && endOfDay) return new Date(`${cleaned}T23:59:59.999`).getTime();
  if (cleaned.indexOf("T") < 0) return new Date(`${cleaned}T00:00:00`).getTime();
  return new Date(cleaned).getTime();
}

export function readSponsorAd(): SponsorAdConfig | null {
  if (typeof window !== "undefined" && window.__VC_SITE_SPONSOR_AD && typeof window.__VC_SITE_SPONSOR_AD === "object") {
    return window.__VC_SITE_SPONSOR_AD;
  }
  return SPONSOR_AD_CONFIG;
}

/** true solo se enabled e l'istante è dentro start/until. */
export function sponsorAdLive(cfg: SponsorAdConfig | null, now = Date.now()) {
  if (!cfg || cfg.enabled !== true) return false;
  let startMs = Number(cfg.startMs);
  let untilMs = Number(cfg.untilMs);
  if (!Number.isFinite(startMs)) startMs = parseMs(cfg.startAt, false);
  if (!Number.isFinite(untilMs)) untilMs = parseMs(cfg.until, true);
  if (Number.isFinite(startMs) && now < startMs) return false;
  if (Number.isFinite(untilMs) && now > untilMs) return false;
  return true;
}

export function sponsorHref(raw: unknown) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.href;
  } catch {
    return "";
  }
}

declare global {
  interface Window {
    __VC_SITE_SPONSOR_AD?: SponsorAdConfig | null;
  }
}
