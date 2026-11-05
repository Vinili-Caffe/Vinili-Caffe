// Dati condivisi del sito: link, sezioni, testi. Un solo posto da aggiornare.

export const SITE_ORIGIN = "https://www.viniliecaffe.it";
/**
 * Host API stabile (nginx → site-api:3020). Path: `/webhooks/site-*`, alias `/v1/site-*`, `/health`.
 * `USE_API_ORIGIN` + `apiUrl` / boot fetch in `@/lib/api` spostano il traffico qui.
 */
export const API_ORIGIN = "https://api.viniliecaffe.it";
/** true = fetch/WS verso API_ORIGIN (www resta solo static). */
export const USE_API_ORIGIN = true;

/** Media statici su Cloudflare R2 (custom domain). */
export const CDN_ORIGIN = "https://cdn.viniliecaffe.it";

/** `/images/*` e `/audio/*` → CDN (hero incluso). */
export function cdnUrl(path: string): string {
  const raw = String(path || "").trim();
  if (!raw) return raw;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const q = raw.indexOf("?");
  const pathname = (q >= 0 ? raw.slice(0, q) : raw).trim();
  const query = q >= 0 ? raw.slice(q) : "";
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (p.startsWith("/images/") || p.startsWith("/audio/")) return `${CDN_ORIGIN}${p}${query}`;
  return `${p}${query}`;
}

export const DISCORD_INVITE = "https://discord.gg/viniliecaffe";

/** Social ufficiali (footer + promo). */
export const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/viniliecaffe/" },
  { id: "discord", label: "Discord", href: DISCORD_INVITE },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@viniliecaffe" },
] as const;

/** labelKey / hintKey → `t()` da `@/lib/i18n` (shell chrome). */
export type NavLink = {
  labelKey: string;
  href: string;
  hintKey?: string;
  /** SOON blur: highStaff | evento (HS oppure dal 1° dic pubblico) */
  gate?: "highStaff" | "evento";
};
export type NavGroup = { labelKey: string; links: NavLink[] };

/** Catalogo percorsi (sitemap e smart 404). Non è un gate: `page()` è sempre un link interno. */
export const REACT_PAGES = new Set([
  "/",
  "/faq/",
  "/regole/",
  "/wiki/",
  "/classifiche/",
  "/wrapped/",
  "/status/",
  "/perks/",
  "/vote/",
  "/recensioni/",
  "/ruoli/",
  "/donazioni/",
  "/sponsor/",
  "/user/",
  "/profilo/",
  "/feedback/",

  "/confessionale/",
  "/bacheca/",
  "/candidature/",
  "/appelli/",
  "/tickets/",
  "/wordle/",
  "/puzzle/",
  "/evento/",
  "/evento/accademia/",
  "/evento/gara/",
  "/evento/miniera/",
  "/privacy/",
  "/cookie/",
  "/terms/",
  "/copyright/",
  "/dati/",
  "/vetrina/",
  "/vetrina/bot/",
  "/vetrina/server/",
  "/vetrina/scheda/",
  "/vetrina/invia/",
  "/vetrina/le-mie/",
  "/vetrina/vota/",
  "/vetrina/mod/",
  "/vetrina/linee-guida-recensioni/",
  "/seratafilm/",
  "/seratafilm/grazie/",
  "/seratafilm/accesso-richiesto/",
  "/notifications/",
  "/app/",
  "/personalizza/",
  "/dashboard/",
  "/dashboard/guild/",
  "/dashboard/faq/",
  "/dashboard/feedback/",
  "/dashboard/recensioni/",
  "/dashboard/transcript/",
  "/dashboard/premium/",
  "/dashboard/premium/crediti/",
  "/dashboard/profilo/",
  "/dashboard/profilo/abbonamento/",
  "/staff/",
  "/staff/compiti/",
  "/staff/gestione/",
  "/staff/guida/",
  "/staff/pause/",
  "/staff/pm/",
  "/staff/punti-tolti/",
  "/staff/inbox/",
  "/staff/profilo/",
]);
/** Percorso interno con slash finale (`trailingSlash`), query e hash invariati. */
export function page(path: string): string {
  const raw = String(path ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;

  const hashAt = raw.indexOf("#");
  const hash = hashAt >= 0 ? raw.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : "";
  let pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;

  if (!pathname || pathname === "/") return `/${query}${hash}`;
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (!pathname.endsWith("/")) pathname = `${pathname}/`;
  return `${pathname}${query}${hash}`;
}

/** Link diretti desktop (come snav legacy). */
export const NAV_DIRECT: NavLink[] = [
  { labelKey: "nav.wiki", href: page("/wiki/") },
  { labelKey: "nav.sponsor", href: page("/sponsor/") },
];

/** Alias: alcuni componenti usavano ancora NAV_MAIN. */
export const NAV_MAIN = NAV_DIRECT;

/** Gruppi a tendina desktop / drawer mobile — allineati al sito vecchio. */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.support",
    links: [
      { labelKey: "nav.voteServer", href: page("/vote/"), hintKey: "nav.hint.vote" },
      { labelKey: "nav.reviews", href: page("/recensioni/"), hintKey: "nav.hint.reviews" },
      { labelKey: "nav.donations", href: page("/donazioni/"), hintKey: "nav.hint.donations" },
      { labelKey: "nav.perks", href: page("/perks/"), hintKey: "nav.hint.perks" },
    ],
  },
  {
    labelKey: "nav.community",
    links: [
      { labelKey: "nav.bachecaWall", href: page("/bacheca/"), hintKey: "nav.hint.bachecaWall" },
      { labelKey: "nav.users", href: page("/classifiche/"), hintKey: "nav.hint.users" },
      { labelKey: "nav.roles", href: page("/ruoli/"), hintKey: "nav.hint.roles" },
      { labelKey: "nav.rules", href: page("/regole/"), hintKey: "nav.hint.rules" },
      { labelKey: "nav.faq", href: page("/faq/"), hintKey: "nav.hint.faq" },
    ],
  },
  {
    labelKey: "nav.games",
    links: [
      { labelKey: "nav.confessionale", href: page("/confessionale/"), hintKey: "nav.hint.confessionale" },
      { labelKey: "nav.wordle", href: page("/wordle/"), hintKey: "nav.hint.wordle" },
    ],
  },
  {
    labelKey: "nav.requests",
    links: [
      { labelKey: "nav.appeals", href: page("/appelli/"), hintKey: "nav.hint.appeals" },
      { labelKey: "nav.applications", href: page("/candidature/"), hintKey: "nav.hint.applications" },
      { labelKey: "nav.suggestions", href: page("/feedback/"), hintKey: "nav.hint.suggestions" },
      { labelKey: "nav.tickets", href: page("/tickets/"), hintKey: "nav.hint.tickets" },
    ],
  },
];

/** Drawer mobile: PRINCIPALE + gruppi. */
export const NAV_MOBILE_SECTIONS: NavGroup[] = [
  {
    labelKey: "nav.main",
    links: [
      { labelKey: "nav.wiki", href: page("/wiki/"), hintKey: "nav.hint.wiki" },
      { labelKey: "nav.sponsor", href: page("/sponsor/"), hintKey: "nav.hint.sponsor" },
    ],
  },
  ...NAV_GROUPS,
];

export const WHY = [
  { n: "01", titleKey: "why.1.title", textKey: "why.1.text" },
  { n: "02", titleKey: "why.2.title", textKey: "why.2.text" },
  { n: "03", titleKey: "why.3.title", textKey: "why.3.text" },
];

/** Link legali + status in footer (copyright sta sul testo ©). */
export const LEGAL: NavLink[] = [
  { labelKey: "footer.status", href: page("/status/") },
  { labelKey: "footer.installApp", href: page("/app/") },
  { labelKey: "footer.terms", href: page("/terms/") },
  { labelKey: "footer.privacy", href: page("/privacy/") },
  { labelKey: "footer.cookies", href: page("/cookie/") },
  { labelKey: "footer.yourData", href: page("/dati/") },
];

export const COPYRIGHT_HREF = page("/copyright/");
