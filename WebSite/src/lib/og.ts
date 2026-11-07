/** Open Graph + Discord Component Embeds (link preview V2).
 *  Card 1200×630 per pagina (`/og/{slug}.png`) + `<script id="discord:component-embed">`.
 */

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Finestra PWA / meta theme-color (roast — diverso dall’accent embed). */
export const SITE_THEME_COLOR = "#1a110c";
/** Accent Discord Component Embed / link preview (caffè — non confondere con la PWA). */
export const SITE_EMBED_COLOR = "#6F4E37";
/** Stesso colore in int per Component Embeds (accent_color). */
export const SITE_EMBED_COLOR_INT = 0x6f4e37;
/** Accent 404 / pagina assente. */
export const SITE_404_ACCENT_INT = 0xe07a5f;

export const SITE_DISCORD_INVITE = "https://discord.gg/viniliecaffe";
export const SITE_ORIGIN = "https://www.viniliecaffe.it";

/** Screenshot reali pagina 1200×630 (`/og/{slug}.png`) — solo fallback legacy / debug. */
const OG_CARD_VERSION = "20261026embedFix1";
/** Thumb OG = icona live del server main (proxy API, non asset in repo). */
const LOGO_VERSION = "20261030guildIconLive1";
/** Limite Discord per il JSON component-embed (byte). */
export const DISCORD_COMPONENT_EMBED_MAX_BYTES = 3000;

export function pathToOgSlug(path: string): string {
  const raw = String(path || "/").trim() || "/";
  if (raw === "/404" || raw === "/404/" || raw === "404") return "404";
  const normalized = raw.endsWith("/") || raw === "/" ? raw : `${raw}/`;
  const parts = normalized.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  return parts.join("-") || "home";
}

function normalizePagePath(path: string): string {
  let p = String(path || "/").trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && !p.endsWith("/")) p = `${p}/`;
  return p;
}

/** Icona guild Discord live — thumb accessorio piccolo. */
export function siteLogoOgImage(version = LOGO_VERSION) {
  const url = `${SITE_ORIGIN}/webhooks/site-guild-icon?size=512&v=${version}`;
  return {
    url,
    width: 512,
    height: 512,
    alt: "Vinili & Caffè",
    type: "image/gif" as const,
  };
}

/** Card OG grande per path (summary_large_image + MediaGallery Component Embed). */
export function ogCardForPath(path: string, version = OG_CARD_VERSION) {
  const slug = pathToOgSlug(path);
  const url = `${SITE_ORIGIN}/og/${slug}.png?v=${version}`;
  return {
    url,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: "Vinili & Caffè",
    type: "image/png" as const,
  };
}

/** @deprecated — preferisci ogCardForPath; resta per compat. */
export function ogImageForPath(path: string, version = OG_CARD_VERSION) {
  return ogCardForPath(path, version);
}

function shortenEmbedTitle(raw: string): string {
  let title = String(raw || "").trim() || "Vinili & Caffè";
  // Brand ǀ Pagina → solo il nome pagina (non l’ultima parola del brand, es. “Gaming”)
  if (title.includes("ǀ")) {
    const tail = title.split("ǀ").pop()?.trim() || "";
    if (tail) return tail.slice(0, 80);
  }
  if (/vinili\s*&\s*caff/i.test(title)) return "Vinili & Caffè";
  for (const sep of ["|"]) {
    if (!title.includes(sep)) continue;
    const tail = title.split(sep).pop()?.trim() || "";
    if (tail && tail.length < 64) return tail.slice(0, 80);
  }
  return title.slice(0, 80);
}

export type ComponentEmbedOpts = {
  path?: string;
  title?: string;
  description?: string;
  pageUrl?: string;
  /** Immagine grande (card OG). */
  imageUrl?: string;
  /** Thumb piccolo (logo). */
  thumbnailUrl?: string;
  accentColor?: number;
  pageLabel?: string;
  inviteLabel?: string;
  inviteUrl?: string;
  version?: string;
  /** Embed “pagina non trovata”. */
  notFound?: boolean;
};

/**
 * Payload ufficiale Discord “Component Embeds” per link preview
 * (https://docs.discord.com/developers/link-previews/component-embeds).
 * Layout: titolo + desc con logo GIF come thumbnail (lato), poi CTA.
 */
export function buildDiscordComponentEmbedPayload(opts: ComponentEmbedOpts) {
  const notFound = opts.notFound === true;
  const path = normalizePagePath(opts.path || (notFound ? "/404/" : "/"));
  const pageUrl = notFound
    ? SITE_ORIGIN + "/"
    : String(opts.pageUrl || "").trim() || `${SITE_ORIGIN}${path === "/" ? "/" : path}`;
  const title = notFound
    ? "Pagina non trovata"
    : shortenEmbedTitle(opts.title || "Vinili & Caffè");
  let description = notFound
    ? "Questo link non porta a nessuna pagina del sito. Torna alla home o entra sul server Discord."
    : String(
        opts.description ||
          "Community Discord italiana chill: vinili, caffè, musica e chiacchiere.",
      ).trim();
  if (description.length > 160) description = `${description.slice(0, 157)}…`;

  const thumb =
    String(opts.thumbnailUrl || "").trim() ||
    String(opts.imageUrl || "").trim() ||
    siteLogoOgImage().url;
  const accent = Number.isFinite(opts.accentColor)
    ? Number(opts.accentColor)
    : notFound
      ? SITE_404_ACCENT_INT
      : SITE_EMBED_COLOR_INT;
  const pageLabel = String(
    opts.pageLabel || (notFound ? "Vai alla home" : "Apri la pagina"),
  ).slice(0, 80);
  const inviteLabel = String(opts.inviteLabel || "Entra su Discord").slice(0, 80);
  const inviteUrl = String(opts.inviteUrl || SITE_DISCORD_INVITE).trim() || SITE_DISCORD_INVITE;

  const make = (desc: string, withThumb: boolean) => {
    const body: unknown[] = [];
    if (withThumb) {
      body.push({
        type: 9,
        components: [{ type: 10, content: `## ${title}\n${desc}` }],
        accessory: { type: 11, media: { url: thumb }, description: title },
      });
    } else {
      body.push({ type: 10, content: `## ${title}\n${desc}` });
    }
    body.push({ type: 14, divider: true, spacing: 1 });
    body.push({
      type: 1,
      components: [
        { type: 2, style: 5, label: pageLabel, url: pageUrl },
        { type: 2, style: 5, label: inviteLabel, url: inviteUrl },
      ],
    });
    return {
      component: {
        type: 17,
        accent_color: accent,
        components: body,
      },
    };
  };

  let payload = make(description, true);
  if (JSON.stringify(payload).length > DISCORD_COMPONENT_EMBED_MAX_BYTES) {
    payload = make(description.slice(0, 90), true);
  }
  if (JSON.stringify(payload).length > DISCORD_COMPONENT_EMBED_MAX_BYTES) {
    payload = make(description.slice(0, 120), false);
  }
  return payload;
}

export function discordComponentEmbedScriptTag(
  opts: Parameters<typeof buildDiscordComponentEmbedPayload>[0],
): string {
  const json = JSON.stringify(buildDiscordComponentEmbedPayload(opts));
  return `<script id="discord:component-embed" type="application/json">${json}</script>`;
}

/** Metadata Open Graph + Twitter — thumb = logo (non screenshot `/og/*.png`). */
export function pageSocialMeta(opts: {
  path: string;
  title?: string;
  description?: string;
  version?: string;
  notFound?: boolean;
}) {
  const notFound = opts.notFound === true;
  const path = normalizePagePath(opts.path || (notFound ? "/404/" : "/"));
  const image = siteLogoOgImage(opts.version);
  const description = notFound
    ? "Questo link non porta a nessuna pagina del sito Vinili & Caffè."
    : opts.description ||
      "Vinili & Caffè: community Discord italiana chill dove parlare di tutto.";
  const title = notFound ? "Pagina non trovata" : opts.title;
  const canonicalPath = notFound ? "/" : path === "/" ? "/" : path;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: canonicalPath },
    other: {
      // Accent caffè nell’unfurl classico; PWA resta su viewport.themeColor roast.
      "theme-color": notFound ? "#e07a5f" : SITE_EMBED_COLOR,
    },
    openGraph: {
      ...(title ? { title } : {}),
      description,
      url: `${SITE_ORIGIN}${canonicalPath}`,
      siteName: "Vinili & Caffè",
      locale: "it_IT",
      type: "website" as const,
      images: [image],
    },
    twitter: {
      card: "summary" as const,
      ...(title ? { title } : {}),
      description,
      images: [image.url],
    },
  };
}
